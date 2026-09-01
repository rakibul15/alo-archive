import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    alias: {
      // `server-only` throws unless it is resolved under React's react-server
      // condition. Under test we are exercising those modules directly, so it
      // is stubbed rather than restructuring source to suit the test runner.
      'server-only': new URL('./src/test/server-only-stub.ts', import.meta.url)
        .pathname,
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    css: false,
  },
});
