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
import { sslSupabase } from './_pg-ssl.mjs';

const url = process.env.DATABASE_URL
  || readFileSync('.env.local', 'utf8').match(/^DATABASE_URL=["']?([^"'\r\n]+)/m)?.[1];
if (!url) { console.error('DATABASE_URL ausente'); process.exit(1); }

const TABELAS = ['competencias', 'modulos_base_conteudo', 'micro_conteudos', 'competencias_base', 'colaboradores'];

/**
 * Papéis a testar. `ci_rls_audit` (o usuário do workflow de postura) entra aqui
 * de propósito: ele recebeu `GRANT SELECT` para enxergar o CATÁLOGO, e a
 * pergunta que fica é se isso lhe deu DADO junto. Não deu — ele não tem
 * BYPASSRLS e nenhuma policy o alcança —, mas isso é uma afirmação que precisa
 * ser medida, não deduzida.
 */
const PAPEIS = process.argv.slice(2).length ? process.argv.slice(2) : ['authenticated', 'anon', 'ci_rls_audit'];

const client = new pg.Client({ connectionString: url, ssl: sslSupabase() });
await client.connect();

const claims = JSON.stringify({ role: 'authenticated', sub: '00000000-0000-0000-0000-000000000000', app_metadata: {} });

console.log('papel      | tabela                 | linhas visíveis');
console.log('-----------+------------------------+----------------');
for (const papel of PAPEIS) {
  // ⚠️ O `SET ROLE` é testado SEPARADAMENTE do `SELECT`, e isso não é zelo
  // gratuito: na primeira versão os dois estavam no mesmo try, e um
  // "permission denied to set role" aparecia na tabela como se fosse a tabela
  // negando. O relatório dizia "sem permissão em colaboradores" quando o que
  // faltava era poder virar aquele papel — a mesma classe de "o número prova
  // outra coisa" que este arquivo existe para evitar.
  await client.query('BEGIN');
  let podeAssumir = true;
  try {
    await client.query(`SET LOCAL ROLE ${papel}`);
  } catch (e) {
    podeAssumir = false;
    console.log(`${papel.padEnd(14)} | (não consegui assumir o papel: ${e.code} — resultado abaixo seria enganoso)`);
  }
  await client.query('ROLLBACK');
  if (!podeAssumir) continue;

  for (const t of TABELAS) {
    await client.query('BEGIN');
    let resultado;
    try {
      await client.query(`SET LOCAL request.jwt.claims = '${claims}'`);
      await client.query(`SET LOCAL ROLE ${papel}`);
      const { rows } = await client.query(`SELECT count(*)::int AS n FROM ${t}`);
      resultado = String(rows[0].n);
    } catch (e) {
      resultado = e.code === '42501' ? 'GRANT negado (42501)' : `erro ${e.code}`;
    }
    await client.query('ROLLBACK');
    console.log(`${papel.padEnd(14)} | ${t.padEnd(22)} | ${resultado}`);
  }
}

// A contraprova: service_role (o app) continua lendo.
const { rows } = await client.query('SELECT count(*)::int AS n FROM competencias');
console.log(`\nservice_role/app: competencias = ${rows[0].n} (tem que continuar > 0)`);

await client.end();
