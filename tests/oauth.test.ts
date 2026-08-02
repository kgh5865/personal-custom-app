import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createOAuth, generatePkce, type OAuthDeps, type Tokens } from '../src/lib/oauth';
import { setApiKeyMode, setGatewayMode, getAuthMode, clearAuth } from '../src/lib/oauth';
import { Preferences } from '@capacitor/preferences';

vi.mock('@capacitor/browser', () => ({ Browser: { open: vi.fn(), close: vi.fn() } }));
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn() } }));

function makeSecure() {
  let store: Tokens | null = null;
  return {
    async getObject<T>(_k: string): Promise<T | null> { return (store as T | null); },
    async setObject<T>(_k: string, v: T): Promise<void> { store = v as any; },
    async remove(_k: string): Promise<void> { store = null; },
    _peek: () => store,
  };
}

function makeDeps(overrides: Partial<OAuthDeps> = {}): OAuthDeps {
  return {
    secure: makeSecure(),
    openBrowser: vi.fn(async (_url: string) => {}),
    waitForCode: vi.fn(async () => 'CODE123'),
    exchangeCode: vi.fn(async (code: string, verifier: string) => ({
      access: 'A:' + code, refresh: 'R:' + code, expiresAt: Date.now() + 1_000_000, accountId: 'acct-1', idToken: 'id.' + verifier,
    })),
    refreshTokens: vi.fn(async (r: string) => ({
      access: 'A2:' + r, refresh: r, expiresAt: Date.now() + 1_000_000,
    })),
    buildAuthUrl: ({ challenge, state }) =>
      `https://auth.openai.com/oauth/authorize?code_challenge=${challenge}&state=${state}`,
    pkce: () => ({ verifier: 'v-test', challenge: 'c-test', state: 's-test' }),
    ...overrides,
  };
}

describe('oauth manager', () => {
  it('login opens browser then exchanges code with verifier then stores tokens', async () => {
    const deps = makeDeps();
    const oauth = createOAuth(deps);
    const t = await oauth.login();
    expect(deps.openBrowser).toHaveBeenCalledWith(expect.stringContaining('code_challenge=c-test'));
    expect(deps.waitForCode).toHaveBeenCalled();
    expect(deps.exchangeCode).toHaveBeenCalledWith('CODE123', 'v-test');
    expect(t.access).toBe('A:CODE123');
    expect(t.accountId).toBe('acct-1');
    expect(await oauth.currentTokens()).toEqual(t);
  });

  it('login strips code#state suffix before exchange', async () => {
    const deps = makeDeps({ waitForCode: vi.fn(async () => 'ABC#STATE') });
    const oauth = createOAuth(deps);
    await oauth.login();
    expect(deps.exchangeCode).toHaveBeenCalledWith('ABC', 'v-test');
  });

  it('login accepts full URL and extracts code param', async () => {
    const deps = makeDeps({ waitForCode: vi.fn(async () => 'http://localhost:1455/auth/callback?code=XYZ&state=s') });
    const oauth = createOAuth(deps);
    await oauth.login();
    expect(deps.exchangeCode).toHaveBeenCalledWith('XYZ', 'v-test');
  });

  it('currentTokens returns null when not logged in', async () => {
    const oauth = createOAuth(makeDeps());
    expect(await oauth.currentTokens()).toBeNull();
  });

  it('getValidTokens returns cached if not expired', async () => {
    const deps = makeDeps();
    const oauth = createOAuth(deps);
    await oauth.login();
    const t = await oauth.getValidTokens();
    expect(t.access).toBe('A:CODE123');
    expect(deps.refreshTokens).not.toHaveBeenCalled();
  });

  it('getValidTokens refreshes when expired and preserves accountId', async () => {
    const deps = makeDeps({
      exchangeCode: vi.fn(async () => ({ access: 'old', refresh: 'r1', expiresAt: Date.now() - 1, accountId: 'acct-keep' })),
    });
    const oauth = createOAuth(deps);
    await oauth.login();
    const t = await oauth.getValidTokens();
    expect(deps.refreshTokens).toHaveBeenCalledWith('r1');
    expect(t.access).toBe('A2:r1');
    expect(t.accountId).toBe('acct-keep');
  });

  it('getValidTokens refreshes when within 30s of expiry', async () => {
    const deps = makeDeps({
      exchangeCode: vi.fn(async () => ({ access: 'old', refresh: 'r2', expiresAt: Date.now() + 10_000 })),
    });
    const oauth = createOAuth(deps);
    await oauth.login();
    const t = await oauth.getValidTokens();
    expect(deps.refreshTokens).toHaveBeenCalled();
    expect(t.access).toBe('A2:r2');
  });

  it('getValidTokens throws when not logged in', async () => {
    const oauth = createOAuth(makeDeps());
    await expect(oauth.getValidTokens()).rejects.toThrow(/not logged in/i);
  });

  it('logout clears stored tokens', async () => {
    const oauth = createOAuth(makeDeps());
    await oauth.login();
    await oauth.logout();
    expect(await oauth.currentTokens()).toBeNull();
  });

  it('refreshed tokens are persisted', async () => {
    const deps = makeDeps({
      exchangeCode: vi.fn(async () => ({ access: 'old', refresh: 'r3', expiresAt: Date.now() - 1 })),
    });
    const oauth = createOAuth(deps);
    await oauth.login();
    await oauth.getValidTokens();
    const t = await oauth.currentTokens();
    expect(t?.access).toBe('A2:r3');
  });
});

describe('generatePkce', () => {
  it('returns verifier/challenge/state with base64url chars only', async () => {
    const { verifier, challenge, state } = await generatePkce();
    const re = /^[A-Za-z0-9_-]+$/;
    expect(verifier).toMatch(re);
    expect(challenge).toMatch(re);
    expect(state).toMatch(re);
    expect(verifier.length).toBeGreaterThan(20);
    expect(challenge.length).toBeGreaterThan(20);
  });

  it('generates distinct values on subsequent calls', async () => {
    const a = await generatePkce();
    const b = await generatePkce();
    expect(a.verifier).not.toBe(b.verifier);
    expect(a.state).not.toBe(b.state);
  });
});

describe('api key fallback', () => {
  beforeEach(() => {
    (Preferences as any).__reset?.();
  });

  it('setApiKeyMode persists the key', async () => {
    await setApiKeyMode('sk-test-123');
    const mode = await getAuthMode();
    expect(mode).toEqual({ mode: 'apikey', apiKey: 'sk-test-123' });
  });

  it('getAuthMode returns null when no auth set', async () => {
    expect(await getAuthMode()).toBeNull();
  });

  it('clearAuth removes both api-key and oauth state', async () => {
    await setApiKeyMode('sk-test-xyz');
    await clearAuth();
    expect(await getAuthMode()).toBeNull();
  });

  it('api-key mode takes precedence over oauth presence', async () => {
    await setApiKeyMode('sk-explicit');
    const mode = await getAuthMode();
    expect(mode?.mode).toBe('apikey');
  });

  it('setGatewayMode persists baseURL/token/model', async () => {
    await setGatewayMode('http://gw.local:18789', 'gw-token', 'openclaw/default');
    const mode = await getAuthMode();
    expect(mode).toEqual({
      mode: 'gateway', baseURL: 'http://gw.local:18789', token: 'gw-token', model: 'openclaw/default',
    });
  });

  it('clearAuth also clears gateway mode', async () => {
    await setGatewayMode('http://gw.local:18789', 'gw-token', 'openclaw/default');
    await clearAuth();
    expect(await getAuthMode()).toBeNull();
  });
});
