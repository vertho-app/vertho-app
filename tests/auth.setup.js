// Setup de autenticação: loga uma vez e salva o storageState pra os testes
// nível 3 reusarem (evita logar a cada página). Roda como projeto 'setup',
// dependência do projeto 'nivel3'.

const { test } = require('@playwright/test');
const { login } = require('./helpers/auth');
const fs = require('fs');
const path = require('path');

const STORAGE = path.join('playwright', '.auth', 'user.json');

test('authenticate', async ({ page }) => {
  fs.mkdirSync(path.dirname(STORAGE), { recursive: true });
  const ok = await login(page);
  test.skip(!ok, 'SMOKE_EMAIL/SMOKE_PASS não definidos');
  await page.context().storageState({ path: STORAGE });
});
