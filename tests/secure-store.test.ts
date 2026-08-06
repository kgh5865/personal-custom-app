import { describe, it, expect, vi } from 'vitest';
import { createSecureStore, migratePlaintext, type SecureBackend } from '../src/lib/secure-store';

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

describe('migratePlaintext', () => {
  it('moves value from plaintext to encrypted and deletes plaintext', async () => {
    const from = makeBackend();
    const to = makeBackend();
    from.store.set('chatgpt_oauth', 'token123');
    await migratePlaintext(from, to, ['chatgpt_oauth']);
    expect(to.store.get('chatgpt_oauth')).toBe('token123');
    expect(from.store.has('chatgpt_oauth')).toBe(false);
  });

  it('does not overwrite when encrypted already has the key', async () => {
    const from = makeBackend();
    const to = makeBackend();
    from.store.set('chatgpt_oauth', 'plain-old');
    to.store.set('chatgpt_oauth', 'already-encrypted');
    await migratePlaintext(from, to, ['chatgpt_oauth']);
    expect(to.store.get('chatgpt_oauth')).toBe('already-encrypted');
    expect(from.store.has('chatgpt_oauth')).toBe(true);
  });

  it('does nothing when plaintext has no value', async () => {
    const from = makeBackend();
    const to = makeBackend();
    await migratePlaintext(from, to, ['chatgpt_oauth']);
    expect(to.store.has('chatgpt_oauth')).toBe(false);
  });

  // 실기기 회귀: 네이티브 SecureStorage 는 값이 없을 때 null 이 아니라 undefined 를
  // 준다(JSObject 가 null 을 안 넣는다). `!== null` 로 검사하면 "이미 있음"으로
  // 오판해 마이그레이션 전체가 조용히 건너뛰어지고, 사용자는 로그아웃된다.
  it('treats an undefined-returning destination as empty', async () => {
    const from = makeBackend();
    const to = makeBackend();
    // 네이티브 동작 재현: 없는 키는 undefined
    to.get = async (k: string) => (to.store.has(k) ? to.store.get(k)! : (undefined as any));
    from.store.set('chatgpt_oauth', 'token123');

    await migratePlaintext(from, to, ['chatgpt_oauth']);

    expect(to.store.get('chatgpt_oauth')).toBe('token123');
    expect(from.store.has('chatgpt_oauth')).toBe(false);
  });
});
