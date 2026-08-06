import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'path';

export default defineConfig({
  plugins: [svelte({ hot: false })],
  resolve: {
    alias: {
      '@capacitor/preferences': path.resolve(__dirname, 'tests/mocks/preferences.ts'),
    },
  },
  // 테스트는 레포 루트의 .env 를 읽지 않는다. 읽으면 개발자 로컬 설정에 따라
  // import.meta.env.VITE_* 가 채워져 결과가 달라진다. 실제로 VITE_OPENCLAW_URL 이
  // 있으면 getAuthMode() 가 null 대신 게이트웨이를 돌려줘 테스트가 깨졌다.
  // .env 가 없는 디렉터리를 가리켜 VITE_* 를 전부 비운다.
  envDir: path.resolve(__dirname, 'tests'),
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    globals: true,
  },
});
