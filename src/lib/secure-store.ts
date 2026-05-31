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

// Production singleton with promise-caching (lessons from Task 8)
let initPromise: Promise<SecureStore> | null = null;
export function getSecureStore(): Promise<SecureStore> {
  if (!initPromise) initPromise = initProd();
  return initPromise;
}

async function initProd(): Promise<SecureStore> {
  try {
    const { Preferences } = await import('@capacitor/preferences');
    const backend: SecureBackend = {
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
    return createSecureStore(backend);
  } catch (e) {
    initPromise = null;
    throw e;
  }
}
