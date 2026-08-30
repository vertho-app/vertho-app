const { defineConfig } = require('@playwright/test');

const STORAGE = 'playwright/.auth/user.json';

/**
 * ⚠️ F12 da auditoria de 09-10/08/2026 — dois defeitos, e o segundo é o que
 * fazia `npm test` sair 0 sem testar nada:
 *
 *  1. `baseURL` caía em **`https://vertho.ai`**, o site INSTITUCIONAL (Gamma),
 *     não o app. Hoje ele responde 404 com `server: gamma` — os 109 casos
 *     rodavam contra o alvo errado.
 *  2. Sem `SMOKE_EMAIL`, o helper de login devolvia `false` e cada spec chamava
 *     `test.skip()`. A suíte inteira pulava e o comando saía com código 0:
 *     "instrumento que não pode disparar". Agora, em CI, credencial ausente é
 *     FALHA — nunca skip verde. Fora de CI segue pulando (rodar local sem
 *     credencial é legítimo), mas com aviso.
 *
 * 🚧 DECISÃO PENDENTE — por que esta suíte ainda NÃO está em nenhum workflow:
 * ela **escreve** (`admin-crud.spec.js` cria e apaga competência de verdade).
 * Ligá-la no CI contra `app.vertho.ai` mexeria no banco de um tenant real a cada
 * push. Antes de agendar, é preciso escolher um tenant sandbox — decisão do dono,
 * não do config.
 */
const ALVO = process.env.PLAYWRIGHT_BASE_URL || 'https://app.vertho.ai';

if (process.env.CI && !process.env.SMOKE_EMAIL) {
  throw new Error(
    'E2E em CI sem SMOKE_EMAIL/SMOKE_PASS: a suíte pularia tudo e sairia verde. ' +
    'Configure as credenciais como secret, ou não rode este job.',
  );
}
if (!process.env.SMOKE_EMAIL) {
  console.warn('⚠️  Sem SMOKE_EMAIL: os specs que exigem login vão PULAR. Verde aqui não significa testado.');
}

// Os testes nível 3 (tests/nivel3/**) reusam uma sessão salva pelo projeto
// 'setup' (evita logar por página). Só entram quando há credenciais.
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
    baseURL: ALVO,
    // Medido 30/08: o chromium nasce en-US e a tela de login segue o idioma do
    // navegador ("Sign in with password") — os specs em pt-BR ficavam 60s
    // esperando um texto que não existia. Locale e fuso fixos em pt-BR/SP.
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
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
