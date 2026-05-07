const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

module.exports = defineConfig({
  testDir: './tests/e2e',

  // Smoke tests share a persistent browser context, so they must run sequentially
  fullyParallel: false,
  workers: 1,

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',

  use: {
    browserName: 'chromium',
    // Extensions require headed mode ("new headless" does not support extensions)
    headless: false,
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'github-smoke',
      testMatch: '**/smoke-test.spec.js',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
