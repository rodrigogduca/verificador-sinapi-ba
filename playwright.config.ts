import { defineConfig, devices } from '@playwright/test';

const base = '/verificador-sinapi-ba/';
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_URL ?? `http://localhost:4173${base}`,
    acceptDownloads: true,
    trace: 'retain-on-failure',
  },
  globalSetup: './tests/e2e/global-setup.ts',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_URL
    ? undefined
    : { command: 'npm run preview', url: `http://localhost:4173${base}`, reuseExistingServer: true, timeout: 60_000 },
});
