# 개인 맞춤 생활 관리 앱

한 사람의 인생에서 챙겨야 할 모든 정보를 개인 프로필 기반으로 필터링하여 한곳에서 관리하는 안드로이드 앱.
ChatGPT와 통합되어 있어, 사용자가 GPT에게 말하면 앱의 UI를 실시간으로 수정/추가할 수 있다.

**현재 상태:** Phase 1 MVP 코드 완료, 디바이스 테스트 대기.

## 핵심 컨셉

앱은 **그릇**이고, GPT가 **내용물**을 채운다.

- 앱 셸은 고정: 홈, 챗, 프로필, 설정
- "도메인 화면"(예: 정부정책, 청약, 메모)은 GPT가 HTML/CSS/JS 파일로 직접 작성
- 파일은 앱 내부 저장소에 저장되고, WebView 안 iframe(sandboxed)에서 렌더
- 사용자가 "이 UI 바꿔줘" 하면 GPT가 즉시 파일 수정 → 다음 진입시 반영
- 모든 도메인 변경은 자동 백업되어 "되돌리기" 가능

## 배포

- Android 전용
- Play Store 미경유, `adb install` 로 직접 배포 (개인용)
- 단일 사용자 가정

## 기술 스택 (확정)

| 항목 | 선택 |
|---|---|
| 앱 셸 | Capacitor 6 (Android 타겟, JDK 17 호환) |
| UI 프레임워크 | Svelte 5 + Vite 5 + TypeScript + Tailwind v3 |
| 라우터 | svelte-spa-router 4 (해시 기반, WebView 친화) |
| 동적 UI | 파일시스템에 HTML/CSS/JS 저장 → iframe `srcdoc` 렌더링 (sandbox: `allow-scripts`만) |
| LLM 인증 | 기본: OpenAI API Key (즉시 동작). 보조: ChatGPT 브라우저 OAuth (PoC 단계) |
| LLM 호출 | OpenAI Responses API (`/v1/responses`), 기본 모델 `gpt-4o` |
| 데이터 저장 | SQLite (`@capacitor-community/sqlite`), 시크릿: `@capacitor/preferences` |
| 도메인 파일 | `@capacitor/filesystem` (Directory.Data) |
| 테스트 | Vitest, jsdom, vi.fn() 스파이 (89 tests) |

## Phase 1 MVP 구현된 기능

- [x] adb로 설치되는 Android APK
- [x] 사용자 프로필 입력 (출생연도, 거주지, 직업, 소득, 결혼/자녀, 메모) + SQLite 영속화
- [x] ChatGPT API Key 입력 / OAuth 로그인 UI (Settings)
- [x] 앱 내 챗 인터페이스 (GPT와 한국어 대화)
- [x] GPT가 도구 호출로 도메인 생성/수정/삭제/되돌리기/조회
- [x] 동적 도메인 렌더러 (iframe + sandbox)
- [x] 도메인 자동 백업 + 되돌리기 (최근 20개 히스토리)
- [x] iframe → 호스트 RPC 채널 (화이트리스트, 현재: `get_user_profile`)

## 빌드 및 배포 절차

### 사전 준비 (1회만)

1. **JDK 17** 설치 — Adoptium Temurin 권장. `java -version`으로 확인.
2. **Android SDK** 설치 — Android Studio 설치 후 SDK Manager에서 API 34 이상.
3. **Node.js 18 이상** + npm.
4. **adb를 PATH에 추가** (선택이지만 권장):
   - 기본 경로: `C:\Users\<사용자>\AppData\Local\Android\Sdk\platform-tools`
   - PowerShell에서 영구 추가:
     ```powershell
     [Environment]::SetEnvironmentVariable(
       'Path',
       $env:Path + ';C:\Users\18qwe\AppData\Local\Android\Sdk\platform-tools',
       'User'
     )
     ```
   - 새 터미널을 열어 `adb version`으로 확인.

### 휴대폰 준비

1. **개발자 옵션 활성화**: 설정 → 휴대전화 정보 → 빌드번호 7번 탭.
2. **USB 디버깅 켜기**: 설정 → 개발자 옵션 → USB 디버깅 ON.
3. USB로 PC 연결 → 폰에서 "USB 디버깅을 허용하시겠습니까?" → 허용.
4. PC에서 확인:
   ```powershell
   adb devices
   ```
   휴대폰 시리얼이 보이면 OK. `unauthorized`로 나오면 폰의 USB 디버깅 권한 팝업을 다시 확인.

### 최초 빌드 + 설치

프로젝트 루트(`c:\vscode\개인\개인맞춤앱`)에서:

```powershell
# 의존성 설치 (1회)
npm install

# (선택) OAuth client_id가 있다면 .env에 설정
# 없으면 API Key 모드만 쓰면 됨 — Settings에서 입력
# 예시:
#   VITE_CHATGPT_CLIENT_ID=your_client_id_here

# 웹 빌드 + Capacitor sync + Android APK 빌드
npm run build:android

# APK 설치 (휴대폰 연결된 상태에서)
npm run install:android
```

APK 위치: `android\app\build\outputs\apk\debug\app-debug.apk`

### 코드 수정 후 재배포

```powershell
# 빠른 재빌드 + 재설치
npm run build:android
npm run install:android
```

또는 한 줄로:
```powershell
npm run build:android; npm run install:android
```

### 직접 실행 (브라우저 — 디버깅용)

UI만 빠르게 확인하고 싶을 때. Capacitor 네이티브 기능(SQLite, Preferences 등)은 동작 안 함.

```powershell
npm run dev
```

브라우저에서 http://localhost:5173 접속.

### 테스트

```powershell
npm test          # 1회 실행, 89개 통과 예상
npm run test:watch # 파일 변경 시 자동 재실행
```

## 첫 실행 흐름

1. APK 설치 후 앱 실행 → 홈 화면 ("등록된 도메인이 없습니다")
2. **설정** 탭 → OpenAI API Key 입력 (sk-...) → 저장
3. **프로필** 탭 → 본인 정보 입력 → 저장
4. **챗** 탭 → "안녕" 입력 → GPT 한국어 응답 확인
5. 챗에서 **"메모 도메인을 만들어줘"** → GPT가 `create_domain` 도구 호출 → 홈에 카드 등장
6. 홈 → 메모 카드 탭 → GPT가 만든 메모 UI 표시
7. 챗에서 **"메모 화면을 어두운 테마로 바꿔줘"** → 메모로 다시 진입하면 새 디자인
8. 도메인 상단 **되돌리기** 버튼으로 이전 버전 복원

## 알려진 제약 (Phase 1)

- **ChatGPT OAuth는 PoC 단계** — 일반 앱이 ChatGPT Plus 구독 토큰으로 Responses API를 호출할 수 있는지 미검증. `client_id` 환경변수가 없으면 명확한 한글 에러로 API Key 모드 안내. 자세히는 [docs/superpowers/notes/oauth-poc.md](docs/superpowers/notes/oauth-poc.md).
- **도메인 화면 보는 중에는 즉시 자동 갱신 안 됨** — GPT가 수정한 후 화면 재진입 시 반영. Phase 2에서 reload 이벤트 추가 예정.
- **챗 히스토리는 텍스트만 저장** — 중간 tool call 컨텍스트는 재시작 시 사라짐.
- **데이터 소스 통합은 Phase 2부터** — 정부정책/청약/이벤트의 실제 외부 API 연동은 아직 없음. 현재는 GPT가 도메인 화면을 직접 만드는 것까지.

## 로드맵

### Phase 1 (완료) — MVP 골격
앱 셸 + 프로필 + ChatGPT 통합 + 동적 UI 엔진.

### Phase 2 — 정부 정책 도메인
정부24 / 온통청년 API 연동 + 자격 매칭 엔진 + 정책 알림 + 백그라운드 일일 갱신.

### Phase 3 — 청약/부동산
청약홈 LH API, 국토부 실거래가.

### Phase 4+
이벤트(캐시백·적금), 직업/업계 트렌드, OAuth 정식화, 토큰 암호화 강화.

## 프로젝트 구조

```
.
├── android/                          # Capacitor 생성 Android 프로젝트
├── src/
│   ├── main.ts                       # 앱 엔트리
│   ├── app.css                       # Tailwind directives
│   ├── App.svelte                    # 라우터 + nav
│   ├── routes/
│   │   ├── Home.svelte               # 도메인 카드 그리드
│   │   ├── Chat.svelte               # GPT 챗
│   │   ├── Profile.svelte            # 프로필 편집
│   │   ├── Settings.svelte           # OAuth / API Key
│   │   └── Domain.svelte             # 동적 도메인 렌더러
│   ├── lib/
│   │   ├── db.ts                     # SQLite wrapper
│   │   ├── schema.ts                 # CREATE TABLE 정의
│   │   ├── secure-store.ts           # Preferences wrapper
│   │   ├── fs.ts                     # Filesystem wrapper
│   │   ├── domains.ts                # 도메인 파일 CRUD + 히스토리
│   │   ├── domainRenderer.ts         # HTML/CSS/JS 인라인 + 이스케이프
│   │   ├── oauth.ts                  # ChatGPT OAuth + API Key 모드
│   │   ├── openai.ts                 # Responses API 클라이언트
│   │   ├── messaging.ts              # iframe postMessage 호스트
│   │   └── gpt/
│   │       ├── tools.ts              # OpenAI 도구 스키마 (8개)
│   │       ├── registry.ts           # 도구 디스패처
│   │       └── bridge.ts             # 챗 루프 (tool-call 반복)
│   └── stores/
│       ├── profile.ts
│       ├── chat.ts
│       └── domains.ts
├── tests/                            # 89 단위 테스트
├── docs/superpowers/
│   ├── specs/                        # 설계서
│   ├── plans/                        # 구현 계획
│   └── notes/                        # PoC 노트 (OAuth)
├── capacitor.config.ts
├── vite.config.ts
├── vitest.config.ts
├── tailwind.config.js
├── postcss.config.js
└── package.json
```

## 문서

- 설계서: [docs/superpowers/specs/2026-05-27-personal-life-manager-design.md](docs/superpowers/specs/2026-05-27-personal-life-manager-design.md)
- 구현 계획: [docs/superpowers/plans/2026-05-31-phase-1-mvp.md](docs/superpowers/plans/2026-05-31-phase-1-mvp.md)
- OAuth PoC: [docs/superpowers/notes/oauth-poc.md](docs/superpowers/notes/oauth-poc.md)
