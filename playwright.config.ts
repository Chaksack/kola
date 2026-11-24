import { defineConfig, devices } from '@playwright/test'

/**
 * Smoke end-to-end tests against a built server and a seeded database (TEST_DATABASE_URL, else
 * DATABASE_URL). Set E2E_BASE_URL to test an already-running server instead.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 60_000,
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    baseURL: process.env.E2E_BASE_URL,
    trace: 'retain-on-failure',
    // PW_CHANNEL=chrome uses the installed Google Chrome instead of Playwright's bundled Chromium.
    ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}),
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}) } },
    { name: 'mobile', use: { ...devices['Pixel 7'], ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}) }, grep: /@mobile/ },
  ],
})
