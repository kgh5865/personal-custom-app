# 개인 맞춤 생활 관리 앱

한 사람의 인생에서 챙겨야 할 모든 정보를 개인 프로필 기반으로 필터링하여 한곳에서 관리하는 안드로이드 앱.
ChatGPT와 통합되어 있어, 사용자가 GPT에게 말하면 앱의 UI를 실시간으로 수정/추가할 수 있다.

**저장소:** https://github.com/kgh5865/personal-custom-app

## 핵심 컨셉

앱은 **그릇**이고, GPT가 **내용물**을 채운다.

- 앱 셸은 고정: 홈, 챗, 프로필, 설정
- "도메인 화면"(예: 정부정책, 청약, 메모)은 GPT가 HTML/CSS/JS 파일로 직접 작성
- 파일은 앱 내부 저장소(`Directory.Data`)에 저장되고, WebView 안 iframe(sandboxed)에서 렌더
- 사용자가 "이 UI 바꿔줘" 하면 GPT가 즉시 파일 수정 → 다음 진입시 반영
- 모든 도메인 변경은 자동 백업되어 "되돌리기" 가능 (최근 20개 히스토리)
- 도메인 메타데이터에 `schemaVersion` 필드로 앞으로 스펙이 바뀌어도 옛 파일 무손실

## 배포

- Android 전용, Play Store 미경유
- **최초 1회만 adb 로 설치** → 이후 앱이 GitHub Releases 를 감시하며 자동 업데이트
- 단일 사용자 가정

## 기술 스택

| 항목 | 선택 |
|---|---|
| 앱 셸 | Capacitor 6 (Android 타겟, JDK 17) |
| UI 프레임워크 | Svelte 5 + Vite 5 + TypeScript + Tailwind v3 (Toss-style tokens) |
| 라우터 | svelte-spa-router (해시 기반, WebView 친화) |
| 동적 UI | 파일시스템에 HTML/CSS/JS 저장 → iframe `srcdoc` 렌더링 |
| LLM 인증 | ChatGPT OAuth (Codex client, 로컬 loopback 콜백) / OpenAI API Key / OpenClaw 게이트웨이 |
| LLM 호출 | OpenAI Chat Completions API, tool_calls 루프 |
| 데이터 저장 | SQLite (`@capacitor-community/sqlite`), 시크릿: `@capacitor/preferences` |
| 도메인 파일 | `@capacitor/filesystem` (`Directory.Data`) |
| 자동 업데이트 | GitHub Releases API + 자체 `ApkInstaller` 네이티브 플러그인 |
| 테스트 | Vitest, jsdom (99 tests) |

## 구현된 기능

- [x] adb 로 설치되는 Android APK
- [x] 사용자 프로필 입력 (SQLite 영속화)
- [x] AI 제공자 3종 (ChatGPT OAuth / API Key / OpenClaw 게이트웨이)
- [x] 앱 내 챗 인터페이스 (한국어 대화)
- [x] GPT 도구 호출로 도메인 생성/수정/삭제/되돌리기/조회
- [x] 동적 도메인 렌더러 (iframe + sandbox + postMessage RPC)
- [x] 도메인 자동 백업 + 되돌리기 (최근 20개)
- [x] 도메인 메타 스키마 버전 + 자동 마이그레이션
- [x] Android loopback OAuth 콜백 서버 (포트 1455, RFC 8252)
- [x] **자동 앱 업데이트** — GitHub Releases 감시 → 다운로드 → OS 설치 다이얼로그

## 환경 설정 (.env)

프로젝트 루트에 `.env` 파일 생성 (git 에는 안 올라감):

```
# OpenClaw 게이트웨이 기본값 (선택)
VITE_OPENCLAW_URL=http://home-server-1:18789
VITE_OPENCLAW_TOKEN=
VITE_OPENCLAW_MODEL=openclaw/default

# 앱 자동 업데이트 대상 저장소
VITE_UPDATE_REPO=kgh5865/personal-custom-app
```

## 빌드 및 배포

### 사전 준비 (1회)

1. **JDK 17** (Adoptium Temurin), **Android SDK** (API 34+), **Node.js 20+**
2. **adb** 를 PATH 에 추가 (최초 설치용):
   ```powershell
   [Environment]::SetEnvironmentVariable(
     'Path',
     $env:Path + ';C:\Users\<사용자>\AppData\Local\Android\Sdk\platform-tools',
     'User'
   )
   ```
3. 휴대폰 개발자 옵션 → USB 디버깅 ON → PC 연결 → `adb devices` 확인

### 최초 설치 (adb 마지막 사용)

```powershell
npm install
npm run build:android
npm run install:android
```

APK 위치: `android\app\build\outputs\apk\debug\app-debug.apk`

### 그 이후: 자동 업데이트 워크플로

1. **package.json 의 `version` 을 올린다** (예: `0.0.1` → `0.0.2`)
2. **태그 푸시**:
   ```powershell
   git commit -am "release v0.0.2"
   git tag v0.0.2
   git push --tags
   ```
3. GitHub Actions ([.github/workflows/release.yml](.github/workflows/release.yml)) 가:
   - package.json 버전과 태그 일치 검증
   - 웹 번들 빌드 + Capacitor sync + Gradle assembleRelease
   - APK 를 GitHub Release 에 첨부
4. 사용자 폰의 앱이 다음 실행 시 자동 감지 → 설정 화면에 "새 버전 있음" 표시 → 탭하면 다운로드 후 OS 설치 다이얼로그
5. Android 8+ 에서는 최초 1회 "출처를 알 수 없는 앱" 허용 필요

### 서명 키스토어 (자동 업데이트 필수 조건)

같은 서명으로 빌드해야 자동 업데이트가 성립. 로컬에서 한 번 생성 후 GitHub Secrets 에 등록:

```powershell
keytool -genkey -v -keystore release.keystore -alias upload `
        -keyalg RSA -keysize 2048 -validity 10000
[Convert]::ToBase64String([IO.File]::ReadAllBytes("release.keystore")) | Set-Clipboard
```

GitHub → Settings → Secrets → Actions 에 등록:
- `ANDROID_KEYSTORE_BASE64` (클립보드 값)
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS` (`upload`)
- `ANDROID_KEY_PASSWORD`

서명 시크릿이 없으면 워크플로가 debug APK 로 폴백 (첫 설치용, 자동 업데이트 안 됨).

### 브라우저 개발 모드

UI 만 빠르게 확인 (Capacitor 네이티브 기능은 동작 안 함):

```powershell
npm run dev
```

http://localhost:5173

### 테스트

```powershell
npm test          # 99개 통과
npm run test:watch
```

## 첫 실행 흐름

1. APK 설치 후 앱 실행 → 홈 화면 ("등록된 도메인이 없습니다")
2. **설정** → AI 제공자 선택 (ChatGPT / API Key / OpenClaw) → 인증
3. **프로필** → 본인 정보 입력 → 저장
4. **챗** → "안녕" → GPT 한국어 응답
5. 챗 → **"메모 도메인을 만들어줘"** → 홈에 카드 등장
6. 홈 → 메모 카드 → GPT 가 만든 UI
7. 챗 → **"메모 화면을 어두운 테마로"** → 재진입 시 반영
8. 도메인 상단 **되돌리기** 로 이전 버전 복원

## 알려진 제약

- 도메인 화면 보는 중 즉시 자동 갱신 안 됨 — 재진입 시 반영 (Phase 2 에서 reload 이벤트)
- 챗 히스토리는 텍스트만 저장 — 중간 tool call 컨텍스트는 재시작 시 사라짐
- 데이터 소스 통합 미구현 — GPT 가 UI 를 만드는 것까지만
- 자동 업데이트는 WiFi 만 감지 안 함 — 셀룰러에서도 다운로드 시도됨

## 로드맵

| Phase | 내용 | 상태 |
|---|---|---|
| 1 | 앱 셸 + 프로필 + 챗 + 동적 UI + 자동 업데이트 | ✅ 완료 |
| 2 | 정부24 / 온통청년 API + 자격 매칭 + 정책 알림 | 예정 |
| 3 | 청약홈 LH, 국토부 실거래가 | 예정 |
| 4+ | 이벤트(캐시백·적금), 직업/업계 트렌드 | 예정 |

## 프로젝트 구조

```
.
├── .github/workflows/
│   └── release.yml                   # 태그 push → APK 빌드 + Release 첨부
├── android/                          # Capacitor Android 프로젝트
│   └── app/src/main/java/com/personal/lifeapp/
│       ├── MainActivity.java
│       ├── LoopbackServerPlugin.java # OAuth 콜백용 로컬 서버
│       └── ApkInstallerPlugin.java   # 자동 업데이트 설치
├── src/
│   ├── main.ts / App.svelte
│   ├── routes/                       # Home, Chat, Profile, Settings, Domain
│   ├── lib/
│   │   ├── db.ts / schema.ts / fs.ts / secure-store.ts
│   │   ├── domains.ts                # 도메인 CRUD + 히스토리 + 스키마 마이그레이션
│   │   ├── domainRenderer.ts         # iframe srcdoc 조립
│   │   ├── oauth.ts                  # 3-provider auth
│   │   ├── openai.ts                 # Chat Completions 클라이언트
│   │   ├── messaging.ts              # iframe postMessage 화이트리스트
│   │   ├── loopback.ts               # LoopbackServer 플러그인 브릿지
│   │   ├── update.ts                 # GitHub Releases 자동 업데이트
│   │   └── gpt/
│   │       ├── tools.ts / registry.ts / bridge.ts
│   └── stores/                       # profile, chat, domains
├── tests/                            # 99 단위 테스트
├── docs/superpowers/                 # 설계서 / 구현 계획 / PoC 노트
└── package.json                      # version = 앱 버전의 단일 소스
```

## 문서

- 설계서: [docs/superpowers/specs/2026-05-27-personal-life-manager-design.md](docs/superpowers/specs/2026-05-27-personal-life-manager-design.md)
- 구현 계획: [docs/superpowers/plans/2026-05-31-phase-1-mvp.md](docs/superpowers/plans/2026-05-31-phase-1-mvp.md)
