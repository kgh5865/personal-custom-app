import { getSecureStore } from './secure-store';

const KEY = 'onboarding_done';

export interface OnboardingStore {
  getObject<T>(key: string): Promise<T | null>;
  setObject(key: string, value: unknown): Promise<void>;
}

export function createOnboarding(store: OnboardingStore) {
  return {
    async isOnboardingDone(): Promise<boolean> {
      return (await store.getObject<boolean>(KEY)) === true;
    },
    async markOnboardingDone(): Promise<void> {
      await store.setObject(KEY, true);
    },
  };
}

// Production singleton — 실제 기기의 SecureStore 를 쓴다.
export async function isOnboardingDone(): Promise<boolean> {
  const onboarding = createOnboarding(await getSecureStore());
  return onboarding.isOnboardingDone();
}

export async function markOnboardingDone(): Promise<void> {
  const onboarding = createOnboarding(await getSecureStore());
  return onboarding.markOnboardingDone();
}
