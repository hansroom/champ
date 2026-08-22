#!/usr/bin/env bash
# ================================================================
#  카카오 큰 글씨체(Kakao Big Sans) 내려받기
#  이 폴더(scanner/fonts/)에 폰트 파일을 배치하면 CSS가 자동으로 사용합니다.
#
#  필요한 파일 (woff2 또는 ttf 중 하나만 있어도 동작):
#    KakaoBigSans-Regular.woff2    / KakaoBigSans-Regular.ttf
#    KakaoBigSans-Bold.woff2       / KakaoBigSans-Bold.ttf
#    KakaoBigSans-ExtraBold.woff2  / KakaoBigSans-ExtraBold.ttf
# ================================================================
set -euo pipefail
cd "$(dirname "$0")"

echo "카카오 큰 글씨체를 내려받습니다…"

# 공식 배포 페이지에서 받은 zip 경로를 인자로 넘기면 여기서 풀어 줍니다.
#   ./download-fonts.sh ~/Downloads/KakaoBigSans.zip
if [ "${1:-}" != "" ] && [ -f "$1" ]; then
  echo "· 로컬 zip 사용: $1"
  tmp="$(mktemp -d)"
  unzip -q -o "$1" -d "$tmp"
  find "$tmp" -type f \( -iname '*.ttf' -o -iname '*.otf' -o -iname '*.woff2' \) -exec cp {} . \;
  rm -rf "$tmp"
  echo "· 완료. 배치된 파일:"
  ls -1 ./*.ttf ./*.otf ./*.woff2 2>/dev/null || true
  exit 0
fi

cat <<'MSG'

자동 내려받기에 실패했거나 네트워크가 차단된 환경입니다.
아래 중 한 곳에서 직접 받아 이 폴더에 넣어 주세요.

  1) 카카오 공식 배포 페이지
     https://www.kakaocorp.com/page/detail/11571

  2) 눈누 (상업용 무료 한글 폰트)
     https://noonnu.cc/font_page/1571

받은 zip 이 있다면 다음처럼 실행하면 이 폴더로 자동 정리됩니다.

     ./download-fonts.sh ~/Downloads/KakaoBigSans.zip

ttf 를 woff2 로 변환하면 용량이 크게 줄어듭니다 (선택).

     pip install fonttools brotli
     for f in *.ttf; do fonttools ttLib.woff2 compress "$f"; done

폰트 파일이 없어도 페이지는 Inter → Noto Sans KR → 시스템 폰트로
폴백되어 정상 동작합니다.

MSG
