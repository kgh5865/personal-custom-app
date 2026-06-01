import { getSecureStore } from './secure-store';

export interface Tokens {
  access: string;
  refresh: string;
  expiresAt: number;
}

export interface OAuthDeps {
  secure: { getObject<T>(k: string): Promise<T | null>; setObject<T>(k: string, v: T): Promise<void>; remove(k: string): Promise<void>; };
  openBrowser: (url: string) => Promise<void>;
  waitForCallback: () => Promise<{ code: string }>;
  exchangeCode: (code: string) => Promise<Tokens>;
  refreshTokens: (refresh: string) => Promise<Tokens>;
  buildAuthUrl: () => string;
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
      const url = deps.buildAuthUrl();
      await deps.openBrowser(url);
      const { code } = await deps.waitForCallback();
      const tokens = await deps.exchangeCode(code);
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
      return persist(refreshed);
    },
  };
}

export type OAuth = ReturnType<typeof createOAuth>;

// Production singleton with promise-caching (same pattern as db / secure-store / fs)
let initPromise: Promise<OAuth> | null = null;
export function getOAuth(): Promise<OAuth> {
  if (!initPromise) initPromise = initProd();
  return initPromise;
}

function buildProdAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: import.meta.env.VITE_CHATGPT_CLIENT_ID ?? '',
    response_type: 'code',
    redirect_uri: import.meta.env.VITE_CHATGPT_REDIRECT_URI ?? 'personal-life-app://oauth/callback',
    scope: 'openai',
  });
  return `https://auth.openai.com/oauth/authorize?${params.toString()}`;
}

// API key fallback mode — bypasses OAuth entirely
const MODE_KEY = 'auth_mode';

export type AuthMode =
  | { mode: 'oauth' }
  | { mode: 'apikey'; apiKey: string };

export async function setApiKeyMode(apiKey: string): Promise<void> {
  const secure = await getSecureStore();
  await secure.setObject<AuthMode>(MODE_KEY, { mode: 'apikey', apiKey });
}

export async function getAuthMode(): Promise<AuthMode | null> {
  const secure = await getSecureStore();
  const explicit = await secure.getObject<AuthMode>(MODE_KEY);
  if (explicit && explicit.mode === 'apikey' && explicit.apiKey) return explicit;
  // No explicit api-key mode — check if OAuth is set up
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

async function initProd(): Promise<OAuth> {
  try {
    const { Browser } = await import('@capacitor/browser');
    const { App } = await import('@capacitor/app');
    const secure = await getSecureStore();

    return createOAuth({
      secure,
      buildAuthUrl: buildProdAuthUrl,
      openBrowser: async (url) => { await Browser.open({ url }); },
      waitForCallback: () => new Promise((resolve) => {
        // Listen for appUrlOpen event, resolve when our callback URL fires
        App.addListener('appUrlOpen', (event: { url: string }) => {
          try {
            const parsed = new URL(event.url);
            const code = parsed.searchParams.get('code');
            if (code) {
              Browser.close().catch(() => {});
              resolve({ code });
            }
          } catch { /* ignore non-URL events */ }
        });
      }),
      exchangeCode: async (code) => {
        const r = await fetch('https://auth.openai.com/oauth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            client_id: import.meta.env.VITE_CHATGPT_CLIENT_ID ?? '',
            redirect_uri: import.meta.env.VITE_CHATGPT_REDIRECT_URI ?? '',
          }),
        });
        if (!r.ok) throw new Error(`token exchange failed: ${r.status}`);
        const d = await r.json();
        return { access: d.access_token, refresh: d.refresh_token, expiresAt: Date.now() + (d.expires_in ?? 3600) * 1000 };
      },
      refreshTokens: async (refresh) => {
        const r = await fetch('https://auth.openai.com/oauth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refresh,
            client_id: import.meta.env.VITE_CHATGPT_CLIENT_ID ?? '',
          }),
        });
        if (!r.ok) throw new Error(`token refresh failed: ${r.status}`);
        const d = await r.json();
        return { access: d.access_token, refresh: d.refresh_token ?? refresh, expiresAt: Date.now() + (d.expires_in ?? 3600) * 1000 };
      },
    });
  } catch (e) {
    initPromise = null;
    throw e;
  }
}
