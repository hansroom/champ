#!/usr/bin/env python3
"""보통의민주 정치 쇼츠 제작 파이프라인.

원본 영상의 '지정 구간만' 받아서 분석하고, 후보 구간을 뽑고, 9:16 쇼츠로 렌더한다.

  python3 make_short.py fetch      --job job.json     # 구간만 다운로드 + 자막 확보
  python3 make_short.py rank       --job job.json     # 45~60초 후보 구간 / HOOK 후보 랭킹
  python3 make_short.py render     --job job.json --hook 1512.4 1515.8 \
                                   --body 1508.0 1562.5 --headline "타도의 대상이 된 지지자들"

랭킹은 '읽어볼 후보'를 좁혀줄 뿐이고, 최종 선정은 사람이 대본을 읽고 판단한다.
스크립트는 원본에 없는 문장을 만들어내지 않는다 — 모든 자막 텍스트는 원본에서 그대로 온다.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path

# ---------------------------------------------------------------- 공통 유틸


def ffmpeg_bin() -> str:
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        sys.exit("ffmpeg 를 찾을 수 없습니다.  pip install imageio-ffmpeg  또는 시스템 ffmpeg 설치.")


def ffprobe_bin() -> str:
    exe = shutil.which("ffprobe")
    if exe:
        return exe
    # imageio-ffmpeg 는 ffprobe 를 포함하지 않으므로 ffmpeg 로 대체 조회한다.
    return ""


def run(cmd: list[str], **kw) -> subprocess.CompletedProcess:
    print("+", " ".join(str(c) for c in cmd), file=sys.stderr)
    return subprocess.run(cmd, check=True, **kw)


def hhmmss(value: str | float) -> float:
    """'00:24:20' / '1460' / '24:20' 를 초로."""
    if isinstance(value, (int, float)):
        return float(value)
    parts = str(value).strip().split(":")
    secs = 0.0
    for p in parts:
        secs = secs * 60 + float(p)
    return secs


def stamp(sec: float) -> str:
    h, rem = divmod(max(0.0, sec), 3600)
    m, s = divmod(rem, 60)
    return f"{int(h):02d}:{int(m):02d}:{s:06.3f}"


def load_job(path: str) -> dict:
    with open(path, encoding="utf-8") as fh:
        job = json.load(fh)
    job.setdefault("workdir", str(Path(path).resolve().parent / "build"))
    Path(job["workdir"]).mkdir(parents=True, exist_ok=True)
    return job


# ---------------------------------------------------------------- 1. fetch


def cmd_fetch(job: dict, args) -> None:
    """분석 구간만 내려받는다. 전체 영상은 받지 않는다."""
    work = Path(job["workdir"])
    start, end = hhmmss(job["analysis_start"]), hhmmss(job["analysis_end"])
    segment = work / "segment.mp4"

    section = f"*{stamp(start)}-{stamp(end)}"
    ydl = [
        sys.executable, "-m", "yt_dlp",
        "--download-sections", section,     # 이 구간만 부분 요청
        "--force-keyframes-at-cuts",        # 경계에서 키프레임 재생성 → 정확한 컷
        "--ffmpeg-location", ffmpeg_bin(),
        "-f", job.get("format", "bv*[height>=1080]+ba/bv*+ba/b"),
        "--merge-output-format", "mp4",
        "-o", str(segment),
        job["url"],
    ]
    run(ydl)

    # 자막: 사이드카 텍스트(수 KB)만 받고, 분석은 지정 구간으로 잘라서 한다.
    subs_stem = work / "subs"
    try:
        run([
            sys.executable, "-m", "yt_dlp",
            "--skip-download", "--write-auto-subs", "--write-subs",
            "--sub-langs", job.get("sub_langs", "ko.*"),
            "--sub-format", "vtt", "-o", str(subs_stem), job["url"],
        ])
    except subprocess.CalledProcessError:
        print("자동자막을 받지 못했습니다. whisper 폴백을 씁니다.", file=sys.stderr)

    vtts = sorted(work.glob("subs*.vtt"))
    cues = []
    if vtts:
        cues = parse_vtt(vtts[0])
        print(f"자막 사용: {vtts[0].name} ({len(cues)} cue)", file=sys.stderr)
    if not cues:
        cues = whisper_transcribe(segment, offset=start, lang=job.get("lang", "ko"))

    cues = [c for c in cues if c["end"] > start and c["start"] < end]
    out = work / "transcript.json"
    out.write_text(json.dumps({"offset": start, "cues": cues}, ensure_ascii=False, indent=2),
                   encoding="utf-8")
    print(f"→ {segment}\n→ {out}  ({len(cues)} cue, {stamp(start)}~{stamp(end)})")


VTT_TIME = re.compile(
    r"(\d{2}:\d{2}:\d{2}[.,]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[.,]\d{3})")


def parse_vtt(path: Path) -> list[dict]:
    cues, cur = [], None
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        m = VTT_TIME.search(line)
        if m:
            if cur and cur["text"].strip():
                cues.append(cur)
            cur = {"start": hhmmss(m.group(1).replace(",", ".")),
                   "end": hhmmss(m.group(2).replace(",", ".")), "text": ""}
            continue
        if cur is None or not line.strip() or line.strip().isdigit():
            continue
        if line.startswith(("WEBVTT", "Kind:", "Language:", "NOTE")):
            continue
        clean = re.sub(r"<[^>]+>", "", line).strip()
        if clean:
            cur["text"] = (cur["text"] + " " + clean).strip()
    if cur and cur["text"].strip():
        cues.append(cur)
    # YouTube 자동자막은 롤업 때문에 같은 줄이 반복된다 — 연속 중복 제거.
    dedup: list[dict] = []
    for c in cues:
        if dedup and c["text"] == dedup[-1]["text"]:
            dedup[-1]["end"] = c["end"]
        else:
            dedup.append(c)
    return dedup


def whisper_transcribe(segment: Path, offset: float, lang: str) -> list[dict]:
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        sys.exit("자막도 없고 faster-whisper 도 없습니다.  pip install faster-whisper")
    model = WhisperModel(os.environ.get("WHISPER_MODEL", "large-v3"),
                         device="auto", compute_type="auto")
    segs, _ = model.transcribe(str(segment), language=lang, vad_filter=True,
                               word_timestamps=False)
    # segment.mp4 는 0초부터 시작하므로 원본 타임라인으로 되돌린다.
    return [{"start": s.start + offset, "end": s.end + offset, "text": s.text.strip()}
            for s in segs]


# ---------------------------------------------------------------- 2. rank


@dataclass
class Candidate:
    start: float
    end: float
    score: float
    hits: dict
    text: str


def score_text(text: str, topics: dict) -> tuple[float, dict]:
    hits = {}
    for name, words in topics.items():
        n = sum(text.count(w) for w in words)
        if n:
            hits[name] = n
    # 서로 다른 주제 축이 함께 잡힐수록 가산점 — 한 단어만 반복되는 구간을 걸러낸다.
    coverage = len(hits) / max(1, len(topics))
    return sum(hits.values()) * (1 + 2 * coverage), hits


def cmd_rank(job: dict, args) -> None:
    work = Path(job["workdir"])
    data = json.loads((work / "transcript.json").read_text(encoding="utf-8"))
    cues = data["cues"]
    if not cues:
        sys.exit("transcript.json 이 비어 있습니다. fetch 를 먼저 실행하세요.")
    topics = job["topics"]
    lo, hi = job.get("target_min", 45.0), job.get("target_max", 60.0)

    # 본편 후보: cue 경계에 맞춘 45~60초 창을 전부 훑는다.
    windows: list[Candidate] = []
    for i in range(len(cues)):
        for j in range(i, len(cues)):
            dur = cues[j]["end"] - cues[i]["start"]
            if dur < lo:
                continue
            if dur > hi:
                break
            text = " ".join(c["text"] for c in cues[i:j + 1])
            sc, hits = score_text(text, topics)
            windows.append(Candidate(cues[i]["start"], cues[j]["end"], sc, hits, text))
    windows.sort(key=lambda c: -c.score)

    picked: list[Candidate] = []
    for w in windows:                       # 겹치는 후보는 최고점 하나만 남긴다.
        if all(w.end <= p.start or w.start >= p.end for p in picked):
            picked.append(w)
        if len(picked) >= args.top:
            break

    # HOOK 후보: 2~4초 안에 떨어지는 실제 발화 한 덩어리.
    hooks: list[Candidate] = []
    for i in range(len(cues)):
        for j in range(i, min(i + 4, len(cues))):
            dur = cues[j]["end"] - cues[i]["start"]
            if dur < 2.0:
                continue
            if dur > 4.0:
                break
            text = " ".join(c["text"] for c in cues[i:j + 1])
            sc, hits = score_text(text, topics)
            if re.search(r"(다|까|요|죠|냐)[.?!]?$", text.strip()):
                sc *= 1.3               # 문장이 끝나는 발화가 콜드 오픈에 낫다
            if sc > 0:
                hooks.append(Candidate(cues[i]["start"], cues[j]["end"], sc, hits, text))
    hooks.sort(key=lambda c: -c.score)
    hook_picked: list[Candidate] = []
    for h in hooks:
        if all(h.end <= p.start or h.start >= p.end for p in hook_picked):
            hook_picked.append(h)
        if len(hook_picked) >= args.top:
            break

    report = {
        "body_candidates": [c.__dict__ for c in picked],
        "hook_candidates": [c.__dict__ for c in hook_picked],
    }
    (work / "candidates.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    for label, items in ((f"본편 후보 ({lo:.0f}~{hi:.0f}초)", picked), ("HOOK 후보 (2~4초)", hook_picked)):
        print(f"\n=== {label} ===")
        for n, c in enumerate(items, 1):
            print(f"\n[{n}] {stamp(c.start)} ~ {stamp(c.end)}  "
                  f"({c.end - c.start:.1f}s, score {c.score:.1f}, {c.hits})")
            print(f"    {c.text}")
    print(f"\n→ {work / 'candidates.json'}")
    print("최종 선정은 위 대본을 직접 읽고 판단하세요. 점수는 후보를 좁히는 용도입니다.")


# ---------------------------------------------------------------- 3. render


KOREAN_FONT_HINTS = ("NanumGothicBold", "NanumGothic", "NotoSansKR", "NotoSansCJKkr",
                     "Pretendard", "SpoqaHanSans", "AppleSDGothicNeo", "malgun")


def find_korean_font(explicit: str | None) -> str:
    if explicit:
        if not Path(explicit).exists():
            sys.exit(f"폰트 파일이 없습니다: {explicit}")
        return explicit
    try:
        out = subprocess.run(["fc-list", ":lang=ko", "file"], capture_output=True,
                             text=True).stdout
    except FileNotFoundError:
        out = ""
    files = [ln.split(":")[0].strip() for ln in out.splitlines() if ln.strip()]
    for hint in KOREAN_FONT_HINTS:
        for f in files:
            if hint.lower() in Path(f).name.lower():
                return f
    if files:
        return files[0]
    sys.exit("한글 폰트를 찾지 못했습니다. --font 로 .ttf/.otf 경로를 지정하거나 "
             "나눔고딕/Noto Sans KR 을 설치하세요. (한글 폰트 없이 렌더하면 글자가 깨집니다)")


def probe_size(path: Path) -> tuple[int, int]:
    """ffprobe 가 없을 수 있으므로 ffmpeg 로그에서 해상도를 읽는다."""
    probe = ffprobe_bin()
    if probe:
        out = subprocess.run(
            [probe, "-v", "error", "-select_streams", "v:0", "-show_entries",
             "stream=width,height", "-of", "csv=p=0", str(path)],
            capture_output=True, text=True).stdout.strip()
        w, h = out.split(",")[:2]
        return int(w), int(h)
    log = subprocess.run([ffmpeg_bin(), "-hide_banner", "-i", str(path)],
                         capture_output=True, text=True).stderr
    m = re.search(r"Video:.*?(\d{3,5})x(\d{3,5})", log)
    if not m:
        sys.exit("영상 해상도를 읽지 못했습니다.")
    return int(m.group(1)), int(m.group(2))


def detect_face_x(segment: Path, start: float, end: float) -> float:
    """구간을 샘플링해 얼굴 중심 x 를 프레임 폭 대비 비율로 돌려준다. 실패 시 0.5."""
    try:
        import cv2
    except ImportError:
        print("opencv 가 없어 얼굴 자동 추적을 건너뜁니다 (--face-x 0.5).", file=sys.stderr)
        return 0.5
    cascade = cv2.CascadeClassifier(
        cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    with tempfile.TemporaryDirectory() as td:
        pat = str(Path(td) / "f%03d.png")
        run([ffmpeg_bin(), "-v", "error", "-y", "-ss", stamp(start), "-to", stamp(end),
             "-i", str(segment), "-vf", "fps=1,scale=640:-2", pat])
        centers = []
        for img_path in sorted(Path(td).glob("*.png")):
            img = cv2.imread(str(img_path))
            if img is None:
                continue
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            faces = cascade.detectMultiScale(gray, 1.1, 6, minSize=(48, 48))
            if len(faces):
                x, _, w, _ = max(faces, key=lambda f: f[2] * f[3])
                centers.append((x + w / 2) / img.shape[1])
    if not centers:
        print("얼굴을 찾지 못했습니다 — 중앙 크롭을 씁니다.", file=sys.stderr)
        return 0.5
    centers.sort()
    median = centers[len(centers) // 2]
    print(f"얼굴 중심 x = {median:.3f} (샘플 {len(centers)}장)", file=sys.stderr)
    return median


def wrap_headline(text: str, max_chars: int = 14) -> list[str]:
    """헤드라인을 최대 2줄로 나눈다. 줄바꿈이 명시돼 있으면 그대로 존중한다."""
    if "\n" in text:
        return [ln.strip() for ln in text.split("\n") if ln.strip()][:2]
    if len(text) <= max_chars or " " not in text:
        return [text]
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = f"{cur} {w}".strip()
        if len(trial) > max_chars and cur:
            lines.append(cur)
            cur = w
        else:
            cur = trial
    lines.append(cur)
    return lines if len(lines) <= 2 else [lines[0], " ".join(lines[1:])]


def render_headline_png(text: str, font_path: str, out: Path, width: int = 1080) -> Path:
    """헤드라인을 투명 배경 PNG 로 그린다.

    ffmpeg 의 drawtext 는 libfreetype 없이 빌드된 경우가 많아서(imageio-ffmpeg 포함)
    텍스트는 Pillow 로 그려 overlay 로 합성한다. 한글 폰트만 있으면 어디서나 동작한다.
    """
    from PIL import Image, ImageDraw, ImageFont

    lines = wrap_headline(text)
    pad_x, pad_y, gap = 36, 22, 14
    box_max = int(width * 0.90)

    size = 84
    while size >= 40:
        font = ImageFont.truetype(font_path, size)
        probe = ImageDraw.Draw(Image.new("RGBA", (8, 8)))
        widths = [probe.textbbox((0, 0), ln, font=font)[2] for ln in lines]
        if max(widths) + pad_x * 2 <= box_max:
            break
        size -= 2
    else:
        font = ImageFont.truetype(font_path, 40)

    probe = ImageDraw.Draw(Image.new("RGBA", (8, 8)))
    metrics = [probe.textbbox((0, 0), ln, font=font) for ln in lines]
    text_w = max(m[2] - m[0] for m in metrics)
    line_h = max(m[3] - m[1] for m in metrics)
    box_w = min(box_max, text_w + pad_x * 2)
    box_h = line_h * len(lines) + gap * (len(lines) - 1) + pad_y * 2

    img = Image.new("RGBA", (width, box_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    x0 = (width - box_w) // 2
    draw.rounded_rectangle([x0, 0, x0 + box_w, box_h], radius=10, fill=(0, 0, 0, 165))
    y = pad_y
    for ln, m in zip(lines, metrics):
        w = m[2] - m[0]
        draw.text(((width - w) // 2 - m[0], y - m[1]), ln, font=font, fill=(255, 255, 255, 255))
        y += line_h + gap
    img.save(out)
    print(f"헤드라인 {size}px / {len(lines)}줄 → {out.name}", file=sys.stderr)
    return out


def require_filters(names: list[str]) -> None:
    have = subprocess.run([ffmpeg_bin(), "-hide_banner", "-filters"],
                          capture_output=True, text=True).stdout
    missing = [n for n in names if not re.search(rf"\b{n}\b", have)]
    if missing:
        sys.exit(f"이 ffmpeg 빌드에 필요한 필터가 없습니다: {', '.join(missing)}")


def cmd_render(job: dict, args) -> None:
    work = Path(job["workdir"])
    segment = work / "segment.mp4"
    if not segment.exists():
        sys.exit(f"{segment} 이 없습니다. fetch 를 먼저 실행하세요.")

    offset = hhmmss(job["analysis_start"])   # segment.mp4 는 0초부터 시작
    h0, h1 = hhmmss(args.hook[0]) - offset, hhmmss(args.hook[1]) - offset
    b0, b1 = hhmmss(args.body[0]) - offset, hhmmss(args.body[1]) - offset
    for name, (a, b) in (("hook", (h0, h1)), ("body", (b0, b1))):
        if a < 0 or b <= a:
            sys.exit(f"{name} 구간이 분석 구간을 벗어났습니다: {args.hook if name=='hook' else args.body}")
    hook_dur, body_dur = h1 - h0, b1 - b0
    trans = args.transition
    if not 2.0 <= hook_dur <= 4.5:
        print(f"주의: HOOK 길이 {hook_dur:.1f}s — 사양은 2~4초입니다.", file=sys.stderr)
    total = hook_dur + body_dur - trans
    if not 45 <= total <= 70:
        print(f"주의: 완성본 {total:.1f}s — 목표는 50~65초입니다.", file=sys.stderr)

    src_w, src_h = probe_size(segment)
    face_x = detect_face_x(segment, b0, b1) if args.face_x == "auto" else float(args.face_x)

    # 세로 크롭: 높이는 그대로 두고 9:16 폭만 잘라내므로 얼굴이 위아래로 잘리지 않는다.
    crop_w = min(src_w, int(round(src_h * 9 / 16)))
    crop_w -= crop_w % 2
    max_x = src_w - crop_w
    crop_x = int(round(face_x * src_w - crop_w / 2))
    crop_x = max(0, min(max_x, crop_x))      # 프레임 밖으로 나가지 않게 클램프

    font = find_korean_font(args.font)
    require_filters(["overlay", "xfade", "acrossfade", "loudnorm"])

    tmp = Path(tempfile.mkdtemp())
    headline_png = render_headline_png(args.headline, font, tmp / "headline.png")

    vf = (f"crop={crop_w}:{src_h}:{crop_x}:0,"
          f"scale=1080:1920:flags=lanczos,setsar=1,fps={args.fps},settb=AVTB")

    filter_complex = (
        f"[0:v]{vf},format=yuva420p[hookbase];"
        f"[2:v]format=rgba[hl];"
        f"[hookbase][hl]overlay=x=(W-w)/2:y=H*0.085:format=auto,format=yuv420p[hook];"
        f"[1:v]{vf},format=yuv420p[body];"
        f"[hook][body]xfade=transition=fade:duration={trans}:offset={hook_dur - trans}[vout];"
        f"[0:a][1:a]acrossfade=d={trans}:c1=tri:c2=tri[amix];"
        f"[amix]loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[aout]"
    )

    out = Path(args.out or work / "short.mp4")
    cmd = [
        ffmpeg_bin(), "-hide_banner", "-y",
        "-ss", stamp(h0), "-to", stamp(h1), "-i", str(segment),
        "-ss", stamp(b0), "-to", stamp(b1), "-i", str(segment),
        "-loop", "1", "-framerate", str(args.fps), "-t", f"{hook_dur:.3f}",
        "-i", str(headline_png),
        "-filter_complex", filter_complex,
        "-map", "[vout]", "-map", "[aout]",
        "-c:v", "libx264", "-profile:v", "high", "-level", "4.2",
        "-preset", "slow", "-crf", str(args.crf), "-pix_fmt", "yuv420p",
        "-g", str(args.fps * 2), "-movflags", "+faststart",
        "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
        str(out),
    ]
    run(cmd)
    shutil.rmtree(tmp, ignore_errors=True)

    w, h = probe_size(out)
    print(f"\n→ {out}  {w}x{h}  약 {total:.1f}초")
    print(f"   HOOK {hook_dur:.1f}s + 전환 {trans}s + 본편 {body_dur:.1f}s")
    print(f"   크롭 x={crop_x}/{max_x} (얼굴 중심 {face_x:.3f}), 소스 {src_w}x{src_h}")


# ---------------------------------------------------------------- main


def main() -> None:
    ap = argparse.ArgumentParser(description="보통의민주 정치 쇼츠 제작 파이프라인")
    sub = ap.add_subparsers(dest="cmd", required=True)

    for name in ("fetch", "rank", "render"):
        p = sub.add_parser(name)
        p.add_argument("--job", required=True, help="작업 정의 JSON")
        if name == "rank":
            p.add_argument("--top", type=int, default=5)
        if name == "render":
            p.add_argument("--hook", nargs=2, required=True, metavar=("START", "END"),
                           help="HOOK 구간 (원본 타임라인, 00:24:20 또는 초)")
            p.add_argument("--body", nargs=2, required=True, metavar=("START", "END"))
            p.add_argument("--headline", required=True)
            p.add_argument("--face-x", default="auto",
                           help="'auto' 또는 0~1 (프레임 폭 대비 얼굴 중심)")
            p.add_argument("--font", default=None)
            p.add_argument("--transition", type=float, default=0.25)
            p.add_argument("--fps", type=int, default=30)
            p.add_argument("--crf", type=int, default=18)
            p.add_argument("--out", default=None)

    args = ap.parse_args()
    job = load_job(args.job)
    {"fetch": cmd_fetch, "rank": cmd_rank, "render": cmd_render}[args.cmd](job, args)


if __name__ == "__main__":
    main()
