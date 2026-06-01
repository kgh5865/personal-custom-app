const store = new Map<string, string>();
export const Preferences = {
  async get({ key }: { key: string }) { return { value: store.get(key) ?? null }; },
  async set({ key, value }: { key: string; value: string }) { store.set(key, value); },
  async remove({ key }: { key: string }) { store.delete(key); },
  // For tests that want a clean slate
  __reset() { store.clear(); },
};
