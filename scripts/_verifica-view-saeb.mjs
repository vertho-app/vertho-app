/**
 * Teste de aceite da mig 209: `diag_view_escola_n0_breakdown` não pode ser
 * legível por anon/authenticated. Mesmo método do `_verifica-rls-acervo.mjs` —
 * SET ROLE + claims, não leitura de catálogo.
 *
 * Uso: node scripts/_verifica-view-saeb.mjs
 */
import { readFileSync } from 'fs';
import pg from 'pg';

const url = process.env.DATABASE_URL
  || readFileSync('.env.local', 'utf8').match(/^DATABASE_URL=["']?([^"'\r\n]+)/m)?.[1];
if (!url) { console.error('DATABASE_URL ausente'); process.exit(1); }

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

const claims = JSON.stringify({ role: 'authenticated', sub: '00000000-0000-0000-0000-000000000000', app_metadata: {} });

for (const papel of ['authenticated', 'anon']) {
  await client.query('BEGIN');
  let resultado;
  try {
    await client.query(`SET LOCAL request.jwt.claims = '${claims}'`);
    await client.query(`SET LOCAL ROLE ${papel}`);
    const { rows } = await client.query('SELECT count(*)::int AS n FROM diag_view_escola_n0_breakdown');
    resultado = `🔴 LÊ ${rows[0].n} linhas — REVOKE NÃO aplicado`;
  } catch (e) {
    resultado = e.code === '42501' ? '✅ sem permissão (42501)' : `⚠️ erro inesperado: ${e.code} ${e.message}`;
  }
  await client.query('ROLLBACK');
  console.log(`${papel.padEnd(14)} | ${resultado}`);
}

// Contraprova: a view existe e o app (service_role) segue lendo.
const { rows } = await client.query('SELECT count(*)::int AS n FROM diag_view_escola_n0_breakdown');
console.log(`service_role/app: ${rows[0].n} linhas (tem que continuar > 0)`);

await client.end();
