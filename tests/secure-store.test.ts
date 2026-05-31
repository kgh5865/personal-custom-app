import { describe, it, expect, vi } from 'vitest';
import { createSecureStore, type SecureBackend } from '../src/lib/secure-store';

function makeBackend(): SecureBackend & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    set: vi.fn(async (k: string, v: string) => { store.set(k, v); }),
    remove: vi.fn(async (k: string) => { store.delete(k); }),
  };
}

describe('secure-store', () => {
  it('stores and retrieves objects via JSON serialization', async () => {
    const backend = makeBackend();
    const store = createSecureStore(backend);
    await store.setObject('oauth', { access: 'abc', refresh: 'xyz' });
    expect(backend.set).toHaveBeenCalledWith('oauth', JSON.stringify({ access: 'abc', refresh: 'xyz' }));
    const out = await store.getObject('oauth');
    expect(out).toEqual({ access: 'abc', refresh: 'xyz' });
  });

  it('getObject returns null when backend returns null', async () => {
    const backend = makeBackend();
    const store = createSecureStore(backend);
    expect(await store.getObject('missing')).toBeNull();
  });

  it('remove delegates to backend', async () => {
    const backend = makeBackend();
    const store = createSecureStore(backend);
    await store.setObject('k', { a: 1 });
    await store.remove('k');
    expect(backend.remove).toHaveBeenCalledWith('k');
    expect(await store.getObject('k')).toBeNull();
  });
});
