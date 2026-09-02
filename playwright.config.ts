import { defineConfig, devices } from '@playwright/test';

/**
 * Runs against the system's installed Chrome (`channel: 'chrome'`) rather
 * than downloading Playwright's own bundled Chromium — this machine already
 * has Chrome, and doubling up is wasted bandwidth for one browser's worth of
 * coverage. `webServer` builds and boots the app itself, so `npm run e2e` is
 * a single command with no separately-running dev server to remember.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
  ],
  webServer: {
    command: 'npm run build && npm start -- -p 3100',
    url: 'http://localhost:3100',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
