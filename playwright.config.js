const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 60000,
  retries: 1,
  workers: 1, // Serial execution — avoids Supabase Auth rate limiting
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'https://vertho.com.br',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
