import { defineConfig } from '@playwright/test';

export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  retries: 0,
  testDir: './apps/chrome-extension/e2e',
  timeout: 45_000,
  use: {
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  workers: 1
});
