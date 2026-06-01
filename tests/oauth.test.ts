import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createOAuth, type OAuthDeps, type Tokens } from '../src/lib/oauth';
import { setApiKeyMode, getAuthMode, clearAuth } from '../src/lib/oauth';
import { Preferences } from '@capacitor/preferences';

// Mock Capacitor plugins that aren't available in jsdom
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
    waitForCallback: vi.fn(async () => ({ code: 'CODE123' })),
    exchangeCode: vi.fn(async (code: string) => ({ access: 'A:' + code, refresh: 'R:' + code, expiresAt: Date.now() + 1000_000 })),
    refreshTokens: vi.fn(async (r: string) => ({ access: 'A2:' + r, refresh: r, expiresAt: Date.now() + 1000_000 })),
    buildAuthUrl: () => 'https://auth.openai.com/oauth/authorize?test=1',
    ...overrides,
  };
}

describe('oauth manager', () => {
  it('login opens browser then exchanges code then stores tokens', async () => {
    const deps = makeDeps();
    const oauth = createOAuth(deps);
    const t = await oauth.login();
    expect(deps.openBrowser).toHaveBeenCalledWith('https://auth.openai.com/oauth/authorize?test=1');
    expect(deps.waitForCallback).toHaveBeenCalled();
    expect(deps.exchangeCode).toHaveBeenCalledWith('CODE123');
    expect(t.access).toBe('A:CODE123');
    expect(await oauth.currentTokens()).toEqual(t);
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

  it('getValidTokens refreshes when expired', async () => {
    const deps = makeDeps({
      exchangeCode: vi.fn(async () => ({ access: 'old', refresh: 'r1', expiresAt: Date.now() - 1 })),
    });
    const oauth = createOAuth(deps);
    await oauth.login();
    const t = await oauth.getValidTokens();
    expect(deps.refreshTokens).toHaveBeenCalledWith('r1');
    expect(t.access).toBe('A2:r1');
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

describe('api key fallback', () => {
  beforeEach(() => {
    // Reset the mocked Preferences store + the OAuth singleton state by re-importing isn't trivial,
    // so use the mock's __reset() helper to clear keys.
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
    // Set api-key mode; even if oauth tokens were present, api-key wins
    await setApiKeyMode('sk-explicit');
    const mode = await getAuthMode();
    expect(mode?.mode).toBe('apikey');
  });
});
