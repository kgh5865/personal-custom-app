import { describe, it, expect } from 'vitest';

describe('sanity', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });

  // vitest.config.ts 의 envDir 로 레포 루트 .env 로드를 막고 있다. 이게 풀리면
  // 개발자 로컬 .env 값이 import.meta.env 로 새어 들어와 테스트 결과가 사람마다
  // 달라진다 (실제로 VITE_OPENCLAW_URL 때문에 getAuthMode 테스트가 깨졌었다).
  it('does not leak the repo .env into tests', () => {
    const env = import.meta.env as Record<string, unknown>;
    for (const key of ['VITE_OPENCLAW_URL', 'VITE_OPENCLAW_TOKEN', 'VITE_UPDATE_REPO']) {
      expect(env[key] ?? '').toBe('');
    }
  });
});
