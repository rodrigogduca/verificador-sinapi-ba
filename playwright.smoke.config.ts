import { defineConfig, devices } from '@playwright/test';

// Teste de fumaça contra a produção: npm run test:smoke
export default defineConfig({
  testDir: 'tests/smoke',
  timeout: 60_000,
  reporter: [['list']],
  use: { baseURL: process.env.E2E_URL ?? 'https://rodrigogduca.github.io/verificador-sinapi-ba/' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
