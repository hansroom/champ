# YouTube Channel Scanner

채널을 등록해 두면 **조회수가 급등한 이슈 영상**을 자동으로 뽑아내고,
채널 성장 지표 · 인기 영상 패턴 · 스크립트를 함께 분석해 주는 도구입니다.

`scanner/index.html` 을 브라우저로 열면 바로 동작합니다. (빌드 · 서버 불필요)

## 배포 파일

| 파일 | 설명 |
| --- | --- |
| `youtube-channel-scanner.html` | **단독 실행 파일.** CSS·JS가 모두 인라인된 한 개의 HTML — 다운로드해서 더블클릭하면 끝 |
| `youtube-channel-scanner.zip` | 위 단독 파일 + 분리된 소스 전체 |

단독 파일은 소스를 수정한 뒤 아래 명령으로 다시 만듭니다.

```bash
node scanner/build-standalone.js     # → youtube-channel-scanner.html
```

폰트를 함께 쓰려면 단독 HTML 과 같은 위치에 `fonts/` 폴더를 두면 됩니다.

## 파일 구조

```
scanner/
├── index.html            # 마크업 (헤더 · 사이드바 · 4개 탭 · 모달)
├── css/scanner.css       # Meta Design System 기반 Neutral 테마
├── fonts/                # 카카오 큰 글씨체를 넣는 자리 (README · 내려받기 스크립트)
├── build-standalone.js   # 단독 실행 HTML 빌드 스크립트
└── js/
    ├── utils.js          # 포맷터 · 토큰화 · CSV · 토스트 등 공통 유틸
    ├── store.js          # localStorage 상태 저장소
    ├── mock.js           # 데모 모드용 가상 데이터 생성기 (시드 기반)
    ├── api.js            # YouTube Data API v3 래퍼 · 자막 수집
    ├── analytics.js      # 이슈 점수 · 성장 지표 · 패턴/스크립트 분석
    ├── ui.js             # 렌더링
    └── app.js            # 컨트롤러 · 이벤트 바인딩
```

의존성 없는 순수 HTML/CSS/JS이며, 각 파일은 전역 네임스페이스
(`U`, `Store`, `Mock`, `API`, `Analytics`, `UI`)로 나뉘어 있습니다.
ES 모듈을 쓰지 않기 때문에 `file://` 로 열어도 그대로 동작합니다.

## 디자인 시스템

Meta Design System의 공개 문서를 기준으로 **Neutral 테마**를 구성했습니다.

| 항목 | 값 |
| --- | --- |
| 팔레트 | 중립 그레이 램프 `--n-0` ~ `--n-950` (브랜드 컬러 대신 중립 강조) |
| 상태색 | 증감 표현에만 사용 (`--positive` / `--negative` / `--warning`) |
| 타이포 | **카카오 큰 글씨체(Kakao Big Sans)** → Inter → Noto Sans KR → 시스템 폰트 폴백 |
| 스페이싱 | 4px 배수 스케일 (4 · 8 · 12 · 16 · 24 · 32 · 48) |
| 라운딩 | 4 / 8 / 12 / 16 / pill |
| 토큰 | 시맨틱 네이밍 (`--surface-*`, `--text-*`, `--stroke-*`, `--action-*`) |
| 테마 | neutral-light(기본) · neutral-dark (`[data-theme="dark"]`, 헤더에서 전환) |

## 폰트 — 카카오 큰 글씨체

본문·제목 모두 **카카오 큰 글씨체(Kakao Big Sans)** 를 기본 서체로 씁니다.
Regular(400) · Bold(700) · ExtraBold(800) 세 굵기를 `@font-face` 로 선언해 두었습니다.

폰트 바이너리는 저장소에 포함하지 않습니다. `scanner/fonts/` 에 아래 이름으로 넣으면
자동 적용되고, 없으면 Inter → Noto Sans KR → 시스템 폰트로 폴백해 레이아웃은 그대로 유지됩니다.

```
KakaoBigSans-Regular.woff2     (또는 .ttf)
KakaoBigSans-Bold.woff2        (또는 .ttf)
KakaoBigSans-ExtraBold.woff2   (또는 .ttf)
```

받는 곳과 배치 방법은 [`fonts/README.md`](fonts/README.md) 를 참고하세요.
공식 배포 페이지에서 받은 zip 은 다음 한 줄로 정리됩니다.

```bash
./fonts/download-fonts.sh ~/Downloads/KakaoBigSans.zip
```

## 사용법

### 1. 데모 모드 (API 키 불필요)

첫 화면에서 **데모 채널 불러오기**를 누르면 가상 채널 4개와 영상 200개가
생성되어 전체 분석 흐름을 그대로 확인할 수 있습니다. 시드 기반이라 결과가 항상 동일합니다.

### 2. 실제 데이터 연동

1. [Google Cloud Console](https://console.cloud.google.com/)에서 **YouTube Data API v3** 활성화
2. *API 및 서비스 → 사용자 인증 정보*에서 API 키 발급
3. 우측 상단 **⚙ 설정**에 키 입력 후 저장 → 배지가 `API 연결됨` 으로 바뀝니다
4. 사이드바에 채널을 등록하고 **전체 스캔** 실행

키는 브라우저 `localStorage`에만 저장되며 외부로 전송되지 않습니다.

채널 등록은 다음 형식을 모두 인식합니다.

- `@channelname`
- `https://youtube.com/@channelname`
- `https://youtube.com/channel/UCxxxxxxxxxxxxxxxxxxxxxx`
- `UCxxxxxxxxxxxxxxxxxxxxxx`
- 그 외 문자열은 검색으로 대체 (할당량 100유닛 소모)

**할당량**: 채널 1개당 약 `(수집 영상 수 ÷ 50) × 2 + 1` 유닛. 기본 일일 한도는 10,000유닛입니다.

### 3. 추천 채널

사이드바의 **추천 채널** 블록에서 아래 채널을 클릭 한 번으로 등록할 수 있습니다.
(*모두 등록* 을 누르면 4개를 한 번에 추가하고 바로 스캔합니다.)

| 채널 | 주소 |
| --- | --- |
| natv 국회방송 | <https://www.youtube.com/@NATV_korea> |
| 이재명 | <https://www.youtube.com/@이재명tv> |
| 델리민주 | <https://www.youtube.com/@dailyminjoo> |
| KTV 국민방송 | <https://www.youtube.com/@KTV_korea> |

이미 등록된 채널은 체크 표시와 함께 비활성화됩니다.
데모 모드에서는 같은 이름의 가상 채널로, API 연결 상태에서는 실제 채널 데이터로 등록됩니다.

## 분석 항목

### 이슈 점수 (0~100)

단순 조회수 순 정렬은 오래된 대형 영상이 늘 상위를 차지하기 때문에,
**"지금 이슈가 되고 있는가"** 를 네 지표의 가중 합으로 계산합니다.

| 지표 | 의미 | 가중치 | 만점 기준 |
| --- | --- | --- | --- |
| 채널 중앙값 대비 배율 | 그 채널 평소 성적 대비 초과 성과 | 35% | 3배 |
| 일평균 조회수 | 발행 후 경과일로 나눈 확산 속도 | 25% | 30,000회/일 |
| 구독자 대비 조회수 | 구독자 밖으로 퍼진 정도 | 20% | 60% |
| 참여율 | (좋아요 + 댓글) ÷ 조회수 | 20% | 5% |

각 항목은 로그 포화 함수(`log10(1 + 9x/anchor)`)로 정규화해 극단값에 덜 흔들립니다.
점수 구간은 초대박(85+) · 대박(70+) · 화제(55+) · 준수(40+) · 평이로 나뉩니다.

### 성장 지표 (대시보드 탭)

구독자 · 총 조회수 · 평균 조회수 · **도달률**(평균 조회수 ÷ 구독자) ·
**업로드 주기**(발행 간격 중앙값) · **모멘텀**(최근 10개 평균 ÷ 직전 10개 평균) ·
평균 참여율 · 이슈 영상 수.

### 인기 패턴 (패턴 탭)

상위 이슈 영상 20%와 전체 영상을 비교해 다음을 추출합니다.

- 제목 키워드 빈도 (한국어 조사 제거 토큰화)
- 제목 길이 분포 · 제목 구성 요소(숫자 · 물음표 · 괄호 · 최상급 표현 등)의 상위군 vs 전체 사용률
- 요일별 / 시간대별 평균 조회수
- 영상 길이대별 성과, 숏츠 vs 롱폼 비교
- 자주 쓰인 태그
- 위 결과를 문장으로 정리한 자동 인사이트

### 스크립트 (스크립트 탭)

설명문 · 해시태그 · 챕터는 API 응답에서 자동 수집됩니다.
자막 원문은 YouTube `timedtext` 엔드포인트가 CORS를 허용하지 않아 브라우저에서 직접 호출할 수 없으므로,

- 설정에 **자막 프록시 URL** 을 지정하거나 (`https://proxy.example/?url=` 뒤에 인코딩된 자막 URL이 붙습니다)
- 대본을 직접 붙여넣으면

동일하게 분석됩니다. 글자/단어/문장 수, 문장당 단어 수, 분당 단어(WPM),
어휘 다양도, 도입부 훅 3문장, 마무리 문장, 핵심 키워드, CTA 표현을 산출합니다.

## 기타

- **CSV 내보내기**: 이슈 영상 탭의 현재 필터 결과를 그대로 내보냅니다 (UTF-8 BOM 포함).
- **데이터 보관**: 채널 · 수집 영상 · 스크립트 · 테마가 `localStorage`에 저장되어 새로고침 후에도 유지됩니다.
- **초기화**: 설정 모달의 *저장 데이터 초기화* 로 전체 삭제.
