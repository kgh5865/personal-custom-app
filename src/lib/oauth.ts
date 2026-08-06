import { getSecureStore } from './secure-store';

// ChatGPT (Codex) 공개 OAuth 앱 — RBBrowser 에서 검증된 값.
// 이 client_id 로 발급된 access_token 은 `chatgpt-account-id` 헤더와 함께
// api.openai.com / chatgpt.com backend 를 호출한다.
const CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const CODEX_AUTHORIZE_URL = 'https://auth.openai.com/oauth/authorize';
const CODEX_TOKEN_URL = 'https://auth.openai.com/oauth/token';
// 등록된 유일한 redirect_uri. 모바일/브라우저 앱에서는 실제 서버가 뜨지 않으므로
// 사용자가 브라우저 주소창의 `?code=…` 를 복사해서 앱에 붙여넣는 흐름으로 처리한다.
const CODEX_REDIRECT_URI = 'http://localhost:1455/auth/callback';
const CODEX_SCOPE = 'openid profile email offline_access';

export interface Tokens {
  access: string;
  refresh: string;
  expiresAt: number;
  accountId?: string;
  idToken?: string;
}

export interface OAuthDeps {
  secure: { getObject<T>(k: string): Promise<T | null>; setObject<T>(k: string, v: T): Promise<void>; remove(k: string): Promise<void>; };
  openBrowser: (url: string) => Promise<void>;
  waitForCode: () => Promise<string>;
  exchangeCode: (code: string, verifier: string) => Promise<Tokens>;
  refreshTokens: (refresh: string) => Promise<Tokens>;
  buildAuthUrl: (params: { challenge: string; state: string }) => string;
  pkce: () => { verifier: string; challenge: string; state: string };
}

const KEY = 'chatgpt_oauth';
const REFRESH_LEEWAY_MS = 30_000;

export function createOAuth(deps: OAuthDeps) {
  async function persist(t: Tokens): Promise<Tokens> {
    await deps.secure.setObject(KEY, t);
    return t;
  }

  // refresh 를 실행하고 이전 값을 보존 병합한 뒤 저장까지 한다.
  // 리프레시 응답에 account_id/id_token 이 없을 수 있으므로 이전 값 보존
  async function doRefresh(cur: Tokens): Promise<Tokens> {
    const refreshed = await deps.refreshTokens(cur.refresh);
    const merged: Tokens = {
      ...refreshed,
      accountId: refreshed.accountId ?? cur.accountId,
      idToken: refreshed.idToken ?? cur.idToken,
    };
    return persist(merged);
  }

  return {
    async login(): Promise<Tokens> {
      const { verifier, challenge, state } = deps.pkce();
      const url = deps.buildAuthUrl({ challenge, state });
      await deps.openBrowser(url);
      const code = await deps.waitForCode();
      const tokens = await deps.exchangeCode(splitCode(code), verifier);
      return persist(tokens);
    },

    async logout(): Promise<void> {
      await deps.secure.remove(KEY);
    },

    async currentTokens(): Promise<Tokens | null> {
      return deps.secure.getObject<Tokens>(KEY);
    },

    async getValidTokens(): Promise<Tokens> {
      const cur = await deps.secure.getObject<Tokens>(KEY);
      if (!cur) throw new Error('not logged in');
      if (cur.expiresAt > Date.now() + REFRESH_LEEWAY_MS) return cur;
      return doRefresh(cur);
    },

    // getValidTokens 와 달리 expiresAt 을 보지 않고 무조건 refresh 를 시도한다.
    // 서버가 401 을 준 경우(토큰 조기 폐기 등) 만료 전이라도 강제로 갱신할 때 쓴다.
    async forceRefresh(): Promise<Tokens> {
      const cur = await deps.secure.getObject<Tokens>(KEY);
      if (!cur) throw new Error('not logged in');
      return doRefresh(cur);
    },
  };
}

export type OAuth = ReturnType<typeof createOAuth>;

function splitCode(raw: string): string {
  const v = raw.trim();
  // `code#state` 또는 URL 전체를 붙여넣은 경우 code 파라미터만 추출
  if (v.startsWith('http')) {
    try {
      const u = new URL(v);
      const c = u.searchParams.get('code');
      if (c) return c;
    } catch { /* fallthrough */ }
  }
  if (v.includes('#')) return v.split('#', 2)[0];
  return v;
}

// ─── PKCE (browser-native WebCrypto) ────────────────────────────────────────
function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function generatePkce(): Promise<{ verifier: string; challenge: string; state: string }> {
  const verifierBytes = new Uint8Array(32);
  crypto.getRandomValues(verifierBytes);
  const verifier = b64url(verifierBytes);
  const stateBytes = new Uint8Array(32);
  crypto.getRandomValues(stateBytes);
  const state = b64url(stateBytes);
  const enc = new TextEncoder().encode(verifier);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', enc));
  const challenge = b64url(digest);
  return { verifier, challenge, state };
}

// PKCE 는 SHA-256(async) 계산이 필요한데 buildAuthUrl 은 sync 이므로
// UI 에서 preparePkce() 로 미리 계산해두고, login() 시 consume 한다.
let pkceCache: { verifier: string; challenge: string; state: string } | null = null;
function consumePkce(): { verifier: string; challenge: string; state: string } {
  const p = pkceCache;
  if (!p) throw new Error('PKCE not primed — call preparePkce() first');
  pkceCache = null;
  return p;
}

function buildProdAuthUrl(params: { challenge: string; state: string }): string {
  const u = new URL(CODEX_AUTHORIZE_URL);
  u.searchParams.append('client_id', CODEX_CLIENT_ID);
  u.searchParams.append('response_type', 'code');
  u.searchParams.append('redirect_uri', CODEX_REDIRECT_URI);
  u.searchParams.append('scope', CODEX_SCOPE);
  u.searchParams.append('code_challenge', params.challenge);
  u.searchParams.append('code_challenge_method', 'S256');
  u.searchParams.append('state', params.state);
  return u.toString();
}

// ─── Auth mode (OAuth vs API-key) ───────────────────────────────────────────
const MODE_KEY = 'auth_mode';
// clearAuth 후에도 .env 게이트웨이 폴백이 다시 나타나는 것을 막는다.
// 사용자가 명시적으로 다른 모드를 고르면 해제된다.
const ENV_DISABLED_KEY = 'env_fallback_disabled';

export type AuthMode =
  | { mode: 'oauth' }
  | { mode: 'apikey'; apiKey: string }
  | { mode: 'gateway'; baseURL: string; token: string; model: string };

async function reenableEnvFallback(): Promise<void> {
  const secure = await getSecureStore();
  await secure.remove(ENV_DISABLED_KEY);
}

export async function setApiKeyMode(apiKey: string): Promise<void> {
  const secure = await getSecureStore();
  await secure.setObject(MODE_KEY, { mode: 'apikey', apiKey });
  await reenableEnvFallback();
}

export async function setGatewayMode(baseURL: string, token: string, model: string): Promise<void> {
  const secure = await getSecureStore();
  await secure.setObject(MODE_KEY, { mode: 'gateway', baseURL, token, model });
  await reenableEnvFallback();
}

function getEnvGatewayMode(): AuthMode | null {
  const baseURL = import.meta.env.VITE_OPENCLAW_URL;
  const token = import.meta.env.VITE_OPENCLAW_TOKEN;
  const model = import.meta.env.VITE_OPENCLAW_MODEL ?? 'openclaw/default';
  if (!baseURL || !token) return null;
  return { mode: 'gateway', baseURL, token, model };
}

export async function getAuthMode(): Promise<AuthMode | null> {
  const secure = await getSecureStore();
  const explicit = await secure.getObject<AuthMode>(MODE_KEY);
  if (explicit && explicit.mode === 'apikey' && explicit.apiKey) return explicit;
  if (explicit && explicit.mode === 'gateway' && explicit.baseURL && explicit.token) return explicit;
  const oauth = await getOAuth();
  const t = await oauth.currentTokens();
  if (t) return { mode: 'oauth' };
  // 사용자가 clearAuth 로 명시적으로 끊었으면 .env 폴백을 무시
  const envDisabled = await secure.getObject<boolean>(ENV_DISABLED_KEY);
  if (envDisabled) return null;
  const envGw = getEnvGatewayMode();
  if (envGw) return envGw;
  return null;
}

export async function clearAuth(): Promise<void> {
  const secure = await getSecureStore();
  await secure.remove(MODE_KEY);
  await secure.setObject(ENV_DISABLED_KEY, true);
  const oauth = await getOAuth();
  await oauth.logout();
}

// ─── Prod singleton ────────────────────────────────────────────────────────
let initPromise: Promise<OAuth> | null = null;
export function getOAuth(): Promise<OAuth> {
  if (!initPromise) initPromise = initProd();
  return initPromise;
}

// UI 가 login() 을 부르기 전에 등록: 사용자로부터 코드를 받아오는 방법.
let pendingCodeResolver: ((code: string) => void) | null = null;
let pendingCodeRejecter: ((err: Error) => void) | null = null;

export function providePastedCode(code: string): void {
  if (pendingCodeResolver) {
    pendingCodeResolver(code);
    pendingCodeResolver = null;
    pendingCodeRejecter = null;
  }
}

export function cancelPendingCode(reason = '로그인 취소'): void {
  if (pendingCodeRejecter) {
    pendingCodeRejecter(new Error(reason));
    pendingCodeResolver = null;
    pendingCodeRejecter = null;
  }
  // 안드로이드에서 loopback 대기 중이면 그것도 정리
  cancelLoopback().catch(() => {});
}

function decodeJwtClaims(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const padded = part.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(padded + '='.repeat((4 - padded.length % 4) % 4)));
  } catch { return null; }
}

function accountIdFromIdToken(idToken?: string): string | undefined {
  if (!idToken) return undefined;
  const claims = decodeJwtClaims(idToken) ?? {};
  const authClaim = claims['https://api.openai.com/auth'] as { chatgpt_account_id?: string; organization_id?: string } | undefined;
  return authClaim?.chatgpt_account_id ?? authClaim?.organization_id ?? (claims.sub as string | undefined);
}

async function initProd(): Promise<OAuth> {
  try {
    const { Browser } = await import('@capacitor/browser');
    const { Capacitor } = await import('@capacitor/core');
    const secure = await getSecureStore();
    const isAndroid = Capacitor.getPlatform() === 'android';

    return createOAuth({
      secure,
      pkce: () => consumePkce(),
      buildAuthUrl: buildProdAuthUrl,
      openBrowser: async (url) => {
        if (isAndroid) {
          // 로컬 콜백 서버를 먼저 띄운 뒤 브라우저를 연다. 순서 중요:
          // 브라우저가 리다이렉트할 때 서버가 이미 대기 중이어야 code 를 놓치지 않는다.
          await startLoopbackForCode();
        }
        await Browser.open({ url });
      },
      waitForCode: () => {
        if (isAndroid) return waitForLoopbackCode();
        return new Promise<string>((resolve, reject) => {
          pendingCodeResolver = resolve;
          pendingCodeRejecter = reject;
        });
      },
      exchangeCode: async (code, verifier) => {
        const r = await fetch(CODEX_TOKEN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: CODEX_REDIRECT_URI,
            client_id: CODEX_CLIENT_ID,
            code_verifier: verifier,
          }),
        });
        if (!r.ok) throw new Error(`token exchange failed: ${r.status} ${await r.text().catch(() => '')}`);
        const d = await r.json();
        return {
          access: d.access_token,
          refresh: d.refresh_token ?? '',
          expiresAt: Date.now() + (d.expires_in ?? 3600) * 1000,
          idToken: d.id_token,
          accountId: accountIdFromIdToken(d.id_token),
        };
      },
      refreshTokens: async (refresh) => {
        const r = await fetch(CODEX_TOKEN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refresh,
            client_id: CODEX_CLIENT_ID,
            scope: CODEX_SCOPE,
          }),
        });
        if (!r.ok) throw new Error(`token refresh failed: ${r.status} ${await r.text().catch(() => '')}`);
        const d = await r.json();
        return {
          access: d.access_token,
          refresh: d.refresh_token ?? refresh,
          expiresAt: Date.now() + (d.expires_in ?? 3600) * 1000,
          idToken: d.id_token,
          accountId: accountIdFromIdToken(d.id_token),
        };
      },
    });
  } catch (e) {
    initPromise = null;
    throw e;
  }
}

// UI 에서 login 을 시작하기 전에 호출: PKCE 를 미리 준비한다.
export async function preparePkce(): Promise<void> {
  pkceCache = await generatePkce();
}

// ─── Android loopback OAuth callback (RFC 8252) ─────────────────────────────
// Codex 클라이언트는 http://localhost:1455/auth/callback 만 redirect_uri 로 받으므로
// 안드로이드에서도 같은 포트로 서버를 띄워야 한다. 커스텀 Capacitor 플러그인 참고:
//   android/app/src/main/java/com/personal/lifeapp/LoopbackServerPlugin.java
let loopbackPending: {
  resolve: (code: string) => void;
  reject: (err: Error) => void;
  cleanup: () => Promise<void>;
} | null = null;

async function startLoopbackForCode(): Promise<void> {
  const { LoopbackServer } = await import('./loopback');
  await LoopbackServer.start({ port: 1455 });
  const handle = await LoopbackServer.addListener('callback', (data) => {
    if (!loopbackPending) return;
    const p = loopbackPending;
    loopbackPending = null;
    p.cleanup().catch(() => {});
    if (data.error) {
      p.reject(new Error(`authorize error: ${data.error} ${data.errorDescription || ''}`.trim()));
    } else if (data.code) {
      p.resolve(data.code);
    } else {
      p.reject(new Error('콜백에 code 파라미터가 없습니다'));
    }
  });
  const cleanup = async () => {
    try { await handle.remove(); } catch { /* */ }
    try { await LoopbackServer.stop(); } catch { /* */ }
  };
  // Placeholder — waitForLoopbackCode 가 실제 resolve/reject 를 채운다
  loopbackPending = {
    resolve: () => {},
    reject: () => {},
    cleanup,
  };
}

function waitForLoopbackCode(): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    if (!loopbackPending) {
      reject(new Error('loopback server not started'));
      return;
    }
    loopbackPending.resolve = resolve;
    loopbackPending.reject = reject;
    // 5 분 안에 안 오면 정리
    const timeout = setTimeout(() => {
      if (!loopbackPending) return;
      const p = loopbackPending;
      loopbackPending = null;
      p.cleanup().catch(() => {});
      reject(new Error('로그인 시간 초과 (5분)'));
    }, 5 * 60_000);
    // 원래 resolve/reject 를 감싸 타임아웃 clear
    const origResolve = loopbackPending.resolve;
    const origReject = loopbackPending.reject;
    loopbackPending.resolve = (c) => { clearTimeout(timeout); origResolve(c); };
    loopbackPending.reject = (e) => { clearTimeout(timeout); origReject(e); };
  });
}

// 사용자가 UI 에서 로그인 취소 시 호출 (안드로이드 loopback 대기 중일 때)
export async function cancelLoopback(): Promise<void> {
  if (!loopbackPending) return;
  const p = loopbackPending;
  loopbackPending = null;
  await p.cleanup();
  p.reject(new Error('로그인 취소'));
}
