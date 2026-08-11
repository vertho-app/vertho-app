/**
 * Cria (ou re-senha) o papel `ci_rls_audit` — o usuário SOMENTE-LEITURA que o
 * workflow `rls-posture.yml` usa para conferir a postura do banco vivo.
 *
 * ⚠️ Por que ele precisa de `GRANT SELECT` se "só lê catálogo": porque
 * `information_schema.columns` **filtra pelo que o papel enxerga**. Sem o grant
 * ele veria ZERO colunas, e o INV2 — que descobre as tabelas tenant-owned
 * procurando `column_name = 'empresa_id'` — encontraria zero tabelas e passaria
 * verde por não ver nada. Seria o guard-contra-verde-falso caindo no próprio
 * defeito (já aconteceu uma vez nesta mesma correção, com a env do vitest).
 *
 * O grant NÃO lhe dá as linhas: `ci_rls_audit` não tem BYPASSRLS, então o RLS
 * continua valendo para ele. Se um dia este papel enxergar dado de tenant, isso
 * é achado, não configuração.
 *
 * A senha é gerada aqui e **nunca é impressa**: sai só para um arquivo no TEMP
 * do SO, para virar secret e ser apagado. O host/porta vêm do `DATABASE_URL`
 * atual, e o usuário do pooler segue o formato `<role>.<project-ref>` do
 * Supavisor — sem esse formato a conexão falha.
 *
 * Uso: node --env-file=.env.local scripts/_setup-ci-rls-audit.mjs
 */
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import pg from 'pg';

const ADMIN_URL = process.env.DATABASE_URL;
if (!ADMIN_URL) {
  console.error('DATABASE_URL ausente. Rode com: node --env-file=.env.local scripts/_setup-ci-rls-audit.mjs');
  process.exit(1);
}

const ROLE = 'ci_rls_audit';
// alfanumérico: não precisa de escape em SQL nem de percent-encoding na URL
const senha = randomBytes(48).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 40);

const admin = new pg.Client({ connectionString: ADMIN_URL, ssl: { rejectUnauthorized: false } });
await admin.connect();

const { rows: existe } = await admin.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [ROLE]);
if (existe.length) {
  await admin.query(`ALTER ROLE ${ROLE} LOGIN PASSWORD '${senha}'`);
  console.log(`papel ${ROLE}: já existia → senha rotacionada`);
} else {
  await admin.query(`CREATE ROLE ${ROLE} LOGIN PASSWORD '${senha}'`);
  console.log(`papel ${ROLE}: criado`);
}

await admin.query(`GRANT CONNECT ON DATABASE postgres TO ${ROLE}`);
await admin.query(`GRANT USAGE ON SCHEMA public TO ${ROLE}`);
await admin.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${ROLE}`);
await admin.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ${ROLE}`);
console.log('grants aplicados (connect, usage, select em public + default privileges)');

const { rows: [{ bypass }] } = await admin.query(
  'SELECT rolbypassrls AS bypass FROM pg_roles WHERE rolname = $1', [ROLE],
);
console.log(`rolbypassrls = ${bypass}  ← tem que ser false: o papel não pode furar RLS`);
await admin.end();

// ── connection string do pooler, formato Supavisor `<role>.<ref>` ────────────
const u = new URL(ADMIN_URL);
const ref = decodeURIComponent(u.username).split('.')[1];
if (!ref) { console.error('não consegui extrair o project-ref do DATABASE_URL atual'); process.exit(1); }
const url = `postgresql://${ROLE}.${ref}:${senha}@${u.hostname}:${u.port}${u.pathname}`;

// ── prova de que o papel VÊ o catálogo (o ponto todo do grant) ───────────────
//
// ⚠️ Com RETRY porque o pooler (Supavisor) CACHEIA credencial: depois de um
// `ALTER ROLE … PASSWORD`, a senha nova é rejeitada com `28P01
// password authentication failed` por alguns instantes, enquanto a antiga ainda
// vale. Medido em 11/08/2026 — a criação inicial conectou de primeira; a
// ROTAÇÃO falhou. Consequência prática, que é o que interessa: um secret gravado
// antes da rotação continua "funcionando" por um tempo e depois quebra sozinho,
// sem ninguém ter mexido em nada.
async function conectarComRetry(connectionString, tentativas = 8, esperaMs = 10000) {
  for (let i = 1; ; i++) {
    const c = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
    try {
      await c.connect();
      if (i > 1) console.log(`(conectou na tentativa ${i} — o pooler levou ~${((i - 1) * esperaMs) / 1000}s para aceitar a senha nova)`);
      return c;
    } catch (e) {
      await c.end().catch(() => {});
      if (e.code !== '28P01' || i >= tentativas) throw e;
      if (i === 1) console.log(`\naguardando o pooler aceitar a senha nova (cache de credencial)…`);
      await new Promise((r) => setTimeout(r, esperaMs));
    }
  }
}

const teste = await conectarComRetry(url);
const { rows: [c] } = await teste.query(`
  SELECT
    (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND column_name='empresa_id') AS tabelas_tenant,
    (SELECT count(*) FROM pg_policies WHERE schemaname='public') AS policies,
    (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('m','v')) AS views`);
console.log(`\nvisto PELO papel novo: ${c.tabelas_tenant} tabelas com empresa_id · ${c.policies} policies · ${c.views} views/MVs`);
if (Number(c.tabelas_tenant) === 0) {
  console.error('❌ zero tabelas tenant-owned visíveis — o guard ficaria CEGO. Não grave este secret.');
  process.exit(1);
}

// ── E a contraprova: o GRANT deu CATÁLOGO, não deu DADO ──────────────────────
// Medido conectando COMO o papel, não deduzido do `rolbypassrls`. Ele tem
// SELECT nas tabelas (senão o catálogo some), mas não tem BYPASSRLS e nenhuma
// policy o alcança — então o RLS devolve zero linha. Se algum dia isto imprimir
// um número > 0, a credencial do CI virou um leitor de PII e o secret tem que
// sair do GitHub.
const PII = ['colaboradores', 'respostas', 'competencias'];
let vazou = false;
for (const t of PII) {
  try {
    const { rows: [r] } = await teste.query(`SELECT count(*)::int AS n FROM ${t}`);
    const alerta = r.n > 0 ? '  ❌ LÊ DADO' : '';
    if (r.n > 0) vazou = true;
    console.log(`  ${t.padEnd(16)} → ${r.n} linha(s)${alerta}`);
  } catch (e) {
    console.log(`  ${t.padEnd(16)} → GRANT negado (${e.code})`);
  }
}
await teste.end();
if (vazou) {
  console.error('\n❌ o papel de auditoria enxerga dado de tenant. NÃO grave este secret.');
  process.exit(1);
}
console.log('  ✅ catálogo visível, dado de tenant não — que é exatamente o que se queria');

const destino = path.join(tmpdir(), 'ci-rls-audit.url');
writeFileSync(destino, url, { encoding: 'utf8' });
console.log(`\n✅ connection string escrita em: ${destino}`);
console.log('   (grave como secret e APAGUE o arquivo — a senha não foi impressa em lugar nenhum)');
