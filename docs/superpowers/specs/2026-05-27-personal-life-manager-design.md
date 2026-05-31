# 개인 맞춤 생활 관리 앱 — Phase 1 MVP 설계서

- 작성일: 2026-05-27
- 단계: Phase 1 (MVP)
- 배포: Android, adb 직접 설치 (개인용)

## 1. 개요

한 사용자의 인생에서 챙겨야 할 정보(부동산, 정부 정책, 이벤트, 직업 이슈 등)를 개인 프로필 기반으로 필터링하여 모아 보는 안드로이드 앱.
ChatGPT와 통합되어 있어, 사용자가 대화를 통해 앱의 도메인 화면을 실시간으로 추가·수정할 수 있다.

핵심 원칙: **앱은 그릇, 내용물은 GPT가 채운다.**

## 2. Phase 1 목표 / 비목표

### Phase 1에서 해내야 하는 것
- adb로 APK 설치하여 실행
- 사용자 프로필 입력
- ChatGPT 브라우저 OAuth 로그인
- 앱 내 챗 인터페이스로 GPT와 일반 대화
- GPT가 호출 가능한 도구를 통해 "도메인 화면"을 생성·수정·되돌리기

### Phase 1에서 하지 않는 것
- 정부 정책 / 청약 / 이벤트 등 실제 도메인 데이터 수집 (Phase 2 이후)
- 알림 시스템 (Phase 2)
- 백그라운드 작업 (Phase 2)
- iOS 지원

Phase 1의 검증 기준은 "도메인 화면 한 개를 GPT가 만들고, 사용자 요청에 따라 수정하는 것이 동작한다"이다.

## 3. 기술 스택

| 항목 | 선택 |
|---|---|
| 앱 셸 | Capacitor (Android 타겟) |
| UI 프레임워크 | Svelte + Vite + Tailwind |
| 동적 UI 전략 | WebView 기반, GPT가 HTML/CSS/JS 직접 작성 |
| LLM 인증 | ChatGPT 브라우저 OAuth (`type: chatgpt`) |
| LLM 호출 | OAuth 토큰으로 Responses API |
| 데이터 저장 | SQLite (`@capacitor-community/sqlite`) |
| 시크릿 저장 | `@capacitor/preferences` + 암호화 (또는 Capacitor Secure Storage) |
| OAuth 외부 브라우저 | `@capacitor/browser` |

## 4. 아키텍처

```
[Android Device]
└── Capacitor App Shell
    ├── WebView
    │   ├── Host UI (Svelte, 빌드 시 번들)
    │   │   - /home, /chat, /profile, /settings, /sources
    │   │   - /domain/:name  (Dynamic Renderer)
    │   └── Dynamic Renderer
    │       - 파일시스템에서 /domains/<name>/index.html 로드
    │       - iframe 또는 sandboxed div 에 마운트
    ├── Native Bridge (Capacitor 플러그인)
    │   - Filesystem, SQLite, Preferences, Browser
    │   - LocalNotifications (Phase 2 용 미리 추가)
    │   - BackgroundTask (Phase 2)
    └── Local Storage
        - SQLite:  user_profile, chat_history, domain_meta
        - Files:   /domains/<name>/{index.html, style.css, script.js, meta.json, history/}
        - Secure:  chatgpt_oauth_tokens
```

## 5. 컴포넌트

### 5.1 App Shell
Capacitor Android 프로젝트. 한 번 빌드 후 adb 설치. 이후 UI 변경은 재빌드 없이 WebView 안에서 처리.

### 5.2 Host UI (Svelte)
빌드 시 번들에 포함되는 고정 화면들.
- `/home` — 등록된 도메인 카드 목록
- `/chat` — GPT와 대화
- `/profile` — 사용자 프로필 입력/수정
- `/settings` — OAuth 재로그인, 도메인 관리, 데이터 초기화
- `/sources` — (Phase 2) 데이터 소스 설정
- `/domain/:name` — Dynamic Renderer

### 5.3 Dynamic Renderer
`/domain/:name` 라우트 진입 시:
1. `Filesystem.readFile('/domains/<name>/index.html')`
2. `style.css`, `script.js` 도 같이 로드
3. **iframe `srcdoc`** 으로 마운트 (CSS/JS를 호스트로부터 격리)
4. iframe 안에서 `parent.postMessage({type, payload})` 로 호스트 API 호출
5. 호스트는 화이트리스트된 `type` 만 수락 (예: `query_data`, `notify`)

iframe을 쓰는 이유: 도메인 화면의 CSS/JS가 호스트 UI를 오염시키지 못하도록 격리. GPT가 짠 깨진 JS가 앱 전체를 멈추지 않게 함.

### 5.4 GPT Bridge
- 사용자 메시지 + 시스템 프롬프트 + 대화 이력 + 도구 정의를 묶어 OpenAI Responses API 호출
- 응답에 tool_calls 가 있으면 Tool Registry 로 실행
- tool 결과를 다시 GPT 에게 전달해 후속 응답을 받음
- 최종 텍스트 응답을 채팅창에 표시

### 5.5 GPT Tool Registry
GPT가 호출 가능한 함수 목록. 호스트에서 실행되어 결과를 GPT에게 반환.

| 도구 | 시그니처 | 동작 |
|---|---|---|
| `update_screen` | `(domain: string, files: {html, css?, js?})` | 도메인 화면 전체 교체. 직전 버전을 `history/` 에 백업 |
| `patch_screen` | `(domain, file, search, replace)` | 부분 패치 |
| `read_screen` | `(domain)` | 현재 도메인 파일 내용 반환 |
| `list_domains` | `()` | 등록된 도메인 목록 |
| `create_domain` | `(name, displayName, icon?)` | 새 도메인 폴더 + 기본 파일 생성 |
| `delete_domain` | `(name)` | 도메인 제거 (휴지통으로 이동) |
| `revert_screen` | `(domain, steps=1)` | history 에서 N단계 전 복원 |
| `get_user_profile` | `()` | 프로필 조회 |
| `update_user_profile` | `(updates)` | 프로필 부분 업데이트 |

### 5.6 OAuth Manager
- 브라우저 OAuth 플로우 (`type: chatgpt`)
- 시작: `Browser.open(authUrl)`
- 콜백: Capacitor App URL scheme (`personal-life-app://oauth/callback`) 또는 localhost 리다이렉트
- 토큰 저장: 암호화된 Preferences
- 401 응답 시 refresh 시도, 실패 시 재로그인 유도

### 5.7 Data Service
Phase 1 에서는 다음만 다룬다.
- `user_profile` 테이블 CRUD
- `chat_history` 테이블 CRUD
- `domain_meta` 테이블 CRUD (이름, displayName, icon, 생성일)

Phase 2부터 도메인별 캐시 테이블(`cached_items`)을 추가한다.

## 6. 데이터 흐름

### 6.1 첫 실행 (온보딩)
```
앱 실행 → 프로필 입력 화면 →
프로필 SQLite 저장 → OAuth 로그인 →
토큰 SecureStorage 저장 → 홈 화면
```

### 6.2 GPT 대화로 도메인 화면 만들기
```
사용자 입력 (/chat)
   → GPT Bridge: Responses API 호출
   → GPT 응답에 tool_calls (예: create_domain + update_screen)
   → Tool Registry 실행:
       - /domains/memo/ 폴더 생성
       - meta.json, index.html, style.css, script.js 작성
       - domain_meta 테이블에 레코드 추가
   → 결과를 GPT 에게 반환 → 최종 텍스트 응답
   → 사용자에게 "메모 도메인 만들었어요" 표시
   → 홈 화면에 메모 카드 자동 등장
```

### 6.3 GPT 가 도메인 화면 수정
```
사용자: "메모 화면 색을 어둡게 해줘"
   → GPT Bridge → GPT
   → tool_calls: read_screen("memo") → ... → update_screen("memo", ...)
   → Tool Registry:
       - 직전 버전을 /domains/memo/history/<timestamp>/ 로 복사
       - 새 파일 쓰기
       - Dynamic Renderer 에게 reload 이벤트 송신
   → /domain/memo 화면이 즉시 갱신
```

## 7. 오류 처리

| 오류 | 처리 |
|---|---|
| OAuth 토큰 만료 (401) | refresh 시도. 실패 시 토큰 폐기 + 재로그인 안내 |
| GPT API 호출 실패 | 채팅창에 오류 메시지 + 재시도 버튼 |
| GPT tool_call 인자 검증 실패 | 도구 실행 안 함. 오류 메시지를 GPT 에게 반환해 자가 수정 유도 |
| `update_screen` 으로 깨진 HTML 작성 | iframe 격리로 다른 화면 영향 없음. 도메인 화면 상단에 "되돌리기" 버튼 항상 노출 |
| 파일시스템 쓰기 실패 | 사용자 알림 + 재시도 |

`update_screen` / `patch_screen` 은 항상 **이전 버전을 백업** 한다 (history 폴더에 timestamp 디렉토리로 저장). 백업은 최근 20개만 유지하고 그 이상은 삭제.

## 8. 테스팅

개인용 앱 수준의 실용적 테스트만.

- **단위 테스트**: GPT Bridge (tool_call 파싱), Tool Registry (각 도구), OAuth Manager (토큰 갱신 로직)
- **mocking**: 실제 OpenAI API 호출은 mock 으로 대체. 응답 픽스처로 tool_call 시나리오 재현.
- **수동 테스트**: Host UI 화면 전환, Dynamic Renderer 로딩, OAuth 플로우는 실 디바이스에서 확인.
- **CI 불필요**: 개인용. 로컬 `npm test` 만.

## 9. Phase 1 완료 정의 (DoD)

- [ ] adb로 APK 설치하여 실행 가능
- [ ] 프로필 입력 화면 동작 및 SQLite 저장
- [ ] ChatGPT 브라우저 OAuth 성공 → 토큰 저장 및 재호출 시 자동 사용
- [ ] 챗 화면에서 GPT와 일반 텍스트 대화 가능
- [ ] 사용자가 "샘플 도메인 '메모' 화면 만들어줘" 요청 시:
  - GPT가 `create_domain` + `update_screen` 호출
  - 홈 화면에 메모 카드 등장
  - `/domain/memo` 진입 시 GPT가 만든 화면 렌더
- [ ] "메모 화면 색깔 부드럽게 바꿔줘" 요청 시 즉시 반영
- [ ] 도메인 화면 상단의 "되돌리기" 버튼으로 직전 버전 복구
- [ ] 깨진 HTML 을 GPT 가 작성해도 앱 전체는 동작 (iframe 격리 검증)

## 10. 알려진 위험 / 미해결

- **ChatGPT OAuth 모바일 콜백**: `redirect_uri` 가 `localhost` 인 경우가 대부분이라, Android 에서 받기 위해 커스텀 scheme 또는 임시 로컬 서버가 필요. 구현 단계에서 둘 중 어느 게 동작 가능한지 PoC 필요.
- **Responses API + OAuth 토큰의 정확한 엔드포인트**: Codex App Server 문서에 OAuth 플로우는 있으나 일반 앱이 같은 토큰으로 Responses API 를 호출할 수 있는지는 구현 단계에서 확인 필요. 안 되면 fallback 으로 API Key 입력 모드 추가.
- **iframe `srcdoc` 의 Capacitor 브릿지 접근**: iframe 내부에서 `parent.postMessage` 로 호스트와 통신하는 패턴은 동작하지만, 호스트 측에서 메시지 화이트리스트 정의가 필요.
- **GPT의 tool_call 신뢰성**: GPT가 의도와 다른 도구를 부를 수 있음. 도구 결과를 GPT 가 다시 받아 자가 보정하는 루프(반복 호출 한도 5회) 로 완화.

## 11. Phase 2 이후 (참고용, 본 spec 의 범위 아님)

- 데이터 소스 통합: 정부24, 청약홈 등 API + 매일 갱신
- 자격 매칭 엔진 (프로필 기반 필터링)
- 백그라운드 작업 + 알림
- `query_data`, `set_notification` GPT 도구 추가
- 도메인 템플릿 라이브러리 (정책, 청약, 이벤트, 뉴스 등 GPT가 빠르게 생성하도록)
