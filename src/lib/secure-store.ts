export interface SecureBackend {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export function createSecureStore(backend: SecureBackend) {
  return {
    async getObject<T = unknown>(key: string): Promise<T | null> {
      const raw = await backend.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    },
    async setObject(key: string, value: unknown): Promise<void> {
      await backend.set(key, JSON.stringify(value));
    },
    async remove(key: string): Promise<void> {
      await backend.remove(key);
    },
  };
}

export type SecureStore = ReturnType<typeof createSecureStore>;

// 평문 @capacitor/preferences 에서 암호화 SecureStorage 로 옮겨야 하는 키.
// 기존 기기에 로그인된 사용자가 재로그인하지 않도록 1회 마이그레이션한다.
const MIGRATION_KEYS = ['chatgpt_oauth', 'ai_settings', 'auth_mode', 'env_fallback_disabled'];

// 순수 함수: from 에 있고 to 에 없으면 옮기고 from 에서 지운다. to 에 이미 있으면 건드리지 않는다.
// 주의: `!= null` (nullish) 로 검사한다. `!== null` 로 쓰면 값이 없을 때 undefined 를
// 돌려주는 백엔드에서 "이미 있음"으로 오판해 마이그레이션이 통째로 조용히 건너뛰어진다.
export async function migratePlaintext(
  from: SecureBackend,
  to: SecureBackend,
  keys: string[],
): Promise<void> {
  for (const key of keys) {
    const existing = await to.get(key);
    if (existing != null) continue;
    const plain = await from.get(key);
    if (plain == null) continue;
    await to.set(key, plain);
    await from.remove(key);
  }
}

// Production singleton with promise-caching (lessons from Task 8)
let initPromise: Promise<SecureStore> | null = null;
export function getSecureStore(): Promise<SecureStore> {
  if (!initPromise) initPromise = initProd();
  return initPromise;
}

function preferencesBackend(Preferences: typeof import('@capacitor/preferences').Preferences): SecureBackend {
  return {
    async get(key) {
      const { value } = await Preferences.get({ key });
      return value;
    },
    async set(key, value) {
      await Preferences.set({ key, value });
    },
    async remove(key) {
      await Preferences.remove({ key });
    },
  };
}

async function initProd(): Promise<SecureStore> {
  try {
    const { Preferences } = await import('@capacitor/preferences');
    const plaintextBackend = preferencesBackend(Preferences);

    const { Capacitor } = await import('@capacitor/core');
    if (Capacitor.getPlatform() !== 'android') {
      return createSecureStore(plaintextBackend);
    }

    const { SecureStorage } = await import('./secure-storage');
    const encryptedBackend: SecureBackend = {
      async get(key) {
        // 네이티브가 값이 없을 때 `value` 키를 아예 빼고 주므로(JSObject 는 null 을
        // 넣지 않는다) undefined 가 온다. SecureBackend 계약대로 null 로 정규화한다.
        const { value } = await SecureStorage.get({ key });
        return value ?? null;
      },
      async set(key, value) {
        await SecureStorage.set({ key, value });
      },
      async remove(key) {
        await SecureStorage.remove({ key });
      },
    };

    try {
      await migratePlaintext(plaintextBackend, encryptedBackend, MIGRATION_KEYS);
    } catch (e) {
      // 마이그레이션 실패는 앱을 죽이지 않는다 — 로그만 남기고 진행
      console.error('secure-store migration failed', e);
    }

    return createSecureStore(encryptedBackend);
  } catch (e) {
    initPromise = null;
    throw e;
  }
}
