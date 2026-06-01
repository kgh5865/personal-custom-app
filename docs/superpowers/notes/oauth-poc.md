# ChatGPT OAuth PoC — to be verified on device

## Goal

Get the ChatGPT browser OAuth flow working on Android so the user can sign in once and have the app call the OpenAI Responses API on their behalf using their ChatGPT Plus subscription.

## Approach (implemented)

1. App calls `Browser.open({ url: <authUrl> })` from `@capacitor/browser`. The system browser (or Chrome Custom Tab) opens chat.openai.com (or auth.openai.com) for the user to sign in.
2. The OAuth endpoint redirects back via `redirect_uri = personal-life-app://oauth/callback?code=<auth-code>`.
3. Android sees the custom scheme, launches our app (intent filter declared in AndroidManifest), and Capacitor's `App.addListener('appUrlOpen', ...)` fires with the URL.
4. We extract `code` from the query string, exchange it for tokens via POST to `https://auth.openai.com/oauth/token`, and store the tokens in SecureStore.

## Open questions (need device verification)

- **Q1: Does OpenAI's OAuth endpoint accept the custom scheme `personal-life-app://oauth/callback` as a redirect_uri?**
  Some OAuth providers only allow `https://` redirect URIs. If OpenAI rejects custom schemes, fall back to running a tiny localhost HTTP listener inside the app:
  - Use `@capacitor-community/http` server, OR
  - Bundle a lightweight native HTTP server, OR
  - Final fallback: API Key mode (Task 14).

- **Q2: What is the actual `client_id` for a third-party app?**
  The Codex App Server documentation describes the flow but assumes you have an OpenAI-provided client ID. The user will need to either:
  - Register an OAuth client in their OpenAI account (if/when OpenAI exposes this for general apps), OR
  - Use the existing Codex CLI client ID (if publicly known), OR
  - Use API Key mode (Task 14).

- **Q3: Which scopes does the Responses API require?**
  Documented scopes may differ. The code uses `'openai'` as a placeholder.

## What's implemented now (and what isn't)

- ✅ OAuth state machine: login → store tokens → refresh on expiry → logout
- ✅ Pluggable deps so tests don't need real OAuth
- ✅ AndroidManifest custom scheme intent filter
- ✅ Code wired to `Browser.open` and `App.addListener('appUrlOpen')`
- ❌ Real `client_id` / `redirect_uri` / `scopes` — these come from env vars at runtime, see Q1–Q3
- ❌ Device-tested PoC — needs human

## Workaround for Phase 1

Until OAuth is confirmed working, use **API Key mode** (Task 14): the user pastes their OpenAI API key into Settings. The app stores it in SecureStore and uses it for Responses API calls. This bypasses the OAuth complexity entirely at the cost of explicit billing.

## To complete the PoC (user task)

1. Build the APK (`npm run build:android`) and install on device.
2. In Settings, tap "ChatGPT로 로그인".
3. Observe what happens:
   - Does the browser open?
   - After signing in, does the browser redirect back to the app?
   - Are tokens stored (check via app's debug log or by retrying — if it doesn't ask to log in again, OAuth worked)?
4. If any step fails, drop down to API Key mode and document the failure point in this file.

Env vars to set before building (in `.env` file):

```
VITE_CHATGPT_CLIENT_ID=<your_client_id>
VITE_CHATGPT_REDIRECT_URI=personal-life-app://oauth/callback
```
