const { defineConfig } = require('@playwright/test');

const STORAGE = 'playwright/.auth/user.json';

// Os testes nível 3 (tests/nivel3/**) reusam uma sessão salva pelo projeto
// 'setup' (evita logar por página). Só são incluídos quando há credenciais,
// pra não quebrar `npm test`/CI sem SMOKE_EMAIL.
const nivel3 = process.env.SMOKE_EMAIL
  ? [{
      name: 'nivel3',
      testMatch: /nivel3[/\\].*\.spec\.js/,
      dependencies: ['setup'],
      use: { browserName: 'chromium', storageState: STORAGE },
    }]
  : [];

module.exports = defineConfig({
  testDir: './tests',
  timeout: 60000,
  retries: 1,
  workers: 1, // Serial execution — avoids Supabase Auth rate limiting
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'https://vertho.ai',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.js/ },
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
      testIgnore: [/auth\.setup\.js/, /nivel3[/\\]/],
    },
    ...nivel3,
  ],
});
