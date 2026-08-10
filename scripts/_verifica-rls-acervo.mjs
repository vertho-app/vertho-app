/**
 * Teste de aceite de F1 (mig 206): o que uma sessão `authenticated` enxerga do
 * acervo. Reproduz o que o PostgREST faz — `SET ROLE authenticated` + claims do
 * JWT — em vez de confiar na leitura da policy.
 *
 * Os claims imitam um JWT REAL desta base: sem `empresa_id` no app_metadata,
 * porque nenhum dos 365 usuários tem esse claim.
 *
 * Uso: node scripts/_verifica-rls-acervo.mjs
 */
import { readFileSync } from 'fs';
import pg from 'pg';

const url = process.env.DATABASE_URL
  || readFileSync('.env.local', 'utf8').match(/^DATABASE_URL=["']?([^"'\r\n]+)/m)?.[1];
if (!url) { console.error('DATABASE_URL ausente'); process.exit(1); }

const TABELAS = ['competencias', 'modulos_base_conteudo', 'micro_conteudos', 'competencias_base'];

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

const claims = JSON.stringify({ role: 'authenticated', sub: '00000000-0000-0000-0000-000000000000', app_metadata: {} });

console.log('papel      | tabela                 | linhas visíveis');
console.log('-----------+------------------------+----------------');
for (const papel of ['authenticated', 'anon']) {
  for (const t of TABELAS) {
    await client.query('BEGIN');
    let resultado;
    try {
      await client.query(`SET LOCAL request.jwt.claims = '${claims}'`);
      await client.query(`SET LOCAL ROLE ${papel}`);
      const { rows } = await client.query(`SELECT count(*)::int AS n FROM ${t}`);
      resultado = String(rows[0].n);
    } catch (e) {
      resultado = `sem permissão (${e.code})`;
    }
    await client.query('ROLLBACK');
    console.log(`${papel.padEnd(10)} | ${t.padEnd(22)} | ${resultado}`);
  }
}

// A contraprova: service_role (o app) continua lendo.
const { rows } = await client.query('SELECT count(*)::int AS n FROM competencias');
console.log(`\nservice_role/app: competencias = ${rows[0].n} (tem que continuar > 0)`);

await client.end();
