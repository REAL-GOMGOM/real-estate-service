import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

/**
 * Vitest 설정.
 *
 * 사용 환경 — node 기본.
 * SVG output 비교는 react-dom/server.renderToStaticMarkup으로 SSR 가능 → DOM 불필요.
 * jsdom 의존성은 향후 DOM API 사용 시 대비해 설치만 해두고 default는 node.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    include: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  },
});
