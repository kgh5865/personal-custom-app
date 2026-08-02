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
      const refreshed = await deps.refreshTokens(cur.refresh);
      // 리프레시 응답에 account_id/id_token 이 없을 수 있으므로 이전 값 보존
      const merged: Tokens = {
        ...refreshed,
        accountId: refreshed.accountId ?? cur.accountId,
        idToken: refreshed.idToken ?? cur.idToken,
      };
      return persist(merged);
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

export type AuthMode =
  | { mode: 'oauth' }
  | { mode: 'apikey'; apiKey: string }
  | { mode: 'gateway'; baseURL: string; token: string; model: string };

export async function setApiKeyMode(apiKey: string): Promise<void> {
  const secure = await getSecureStore();
  await secure.setObject(MODE_KEY, { mode: 'apikey', apiKey });
}

export async function setGatewayMode(baseURL: string, token: string, model: string): Promise<void> {
  const secure = await getSecureStore();
  await secure.setObject(MODE_KEY, { mode: 'gateway', baseURL, token, model });
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
  // 사용자 저장값이 없으면 빌드타임 .env 게이트웨이 폴백을 사용
  const envGw = getEnvGatewayMode();
  if (envGw) return envGw;
  const oauth = await getOAuth();
  const t = await oauth.currentTokens();
  if (t) return { mode: 'oauth' };
  return null;
}

export async function clearAuth(): Promise<void> {
  const secure = await getSecureStore();
  await secure.remove(MODE_KEY);
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
    const secure = await getSecureStore();

    return createOAuth({
      secure,
      pkce: () => consumePkce(),
      buildAuthUrl: buildProdAuthUrl,
      openBrowser: async (url) => { await Browser.open({ url }); },
      waitForCode: () => new Promise<string>((resolve, reject) => {
        pendingCodeResolver = resolve;
        pendingCodeRejecter = reject;
      }),
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
