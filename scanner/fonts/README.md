# fonts

이 폴더는 **카카오 큰 글씨체(Kakao Big Sans)** 파일을 두는 자리입니다.

`css/scanner.css` 의 `@font-face` 가 아래 이름을 그대로 찾습니다.
woff2 · ttf 중 하나만 있어도 동작하며, 둘 다 있으면 woff2 가 우선 사용됩니다.

```
KakaoBigSans-Regular.woff2     KakaoBigSans-Regular.ttf      (400)
KakaoBigSans-Bold.woff2        KakaoBigSans-Bold.ttf         (700)
KakaoBigSans-ExtraBold.woff2   KakaoBigSans-ExtraBold.ttf    (800)
```

## 받는 곳

- 카카오 공식 배포 페이지 — <https://www.kakaocorp.com/page/detail/11571>
- 눈누 — <https://noonnu.cc/font_page/1571>

받은 zip 을 `./download-fonts.sh ~/Downloads/KakaoBigSans.zip` 로 넘기면
이 폴더에 자동으로 정리됩니다.

## 폰트가 없을 때

`@font-face` 가 `local()` → `woff2` → `ttf` 순으로 찾고, 모두 없으면
`Inter` → `Noto Sans KR` → 시스템 폰트로 폴백합니다. 레이아웃은 그대로 유지됩니다.

## 라이선스

카카오 큰 글씨체는 카카오가 무료로 배포하는 글꼴입니다.
개인·기업 상업적 이용이 가능하나, **글꼴 자체를 유료로 판매하는 것은 금지**됩니다.
재배포 및 웹폰트 임베딩 조건은 배포처의 라이선스 전문을 확인한 뒤 사용하세요.
이 저장소에는 폰트 바이너리를 포함하지 않습니다.
