import { describe, it, expect } from 'vitest';
import { createOnboarding, type OnboardingStore } from '../src/lib/onboarding';

function makeStore(): OnboardingStore & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return {
    data,
    async getObject<T>(key: string) {
      return (data.has(key) ? (data.get(key) as T) : null);
    },
    async setObject(key: string, value: unknown) {
      data.set(key, value);
    },
  };
}

describe('onboarding', () => {
  it('is not done when flag was never saved', async () => {
    const onboarding = createOnboarding(makeStore());
    expect(await onboarding.isOnboardingDone()).toBe(false);
  });

  it('is done after markOnboardingDone', async () => {
    const store = makeStore();
    const onboarding = createOnboarding(store);
    await onboarding.markOnboardingDone();
    expect(await onboarding.isOnboardingDone()).toBe(true);
    expect(store.data.get('onboarding_done')).toBe(true);
  });
});
