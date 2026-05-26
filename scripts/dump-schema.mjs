#!/usr/bin/env node
/**
 * Gera um snapshot do schema `public` via catálogos do Postgres.
 *
 * Por que existe: as migrations 001–021 (tabelas core: empresas, colaboradores,
 * competencias, trilhas, sessoes_avaliacao, etc.) foram removidas do repo, então
 * não há baseline versionado — recriar o banco do zero era impossível e o drift
 * é incontrolável. `pg_dump --schema-only` seria o ideal, mas não está disponível
 * no ambiente Windows local; este script reconstrói o essencial usando as funções
 * de catálogo que retornam definições EXATAS (pg_get_indexdef / pg_get_constraintdef
 * / pg_get_functiondef), cobrindo: colunas, PK/FK/UNIQUE/CHECK, índices, RLS +
 * policies e funções. Não é byte-idêntico a um pg_dump, mas é fiel e restaurável.
 *
 * Uso:
 *   node --env-file=.env.local scripts/dump-schema.mjs > migrations/000-baseline.sql
 */
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) { console.error('ERRO: DATABASE_URL ausente.'); process.exit(1); }

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

const out = [];
const p = (s = '') => out.push(s);

p('-- BASELINE do schema `public` — snapshot introspecção (NÃO é pg_dump).');
p(`-- Gerado por scripts/dump-schema.mjs em ${new Date().toISOString()}`);
p('-- Reconstrói tabelas core não-versionadas (migrations 001-021 removidas).');
p('-- Idempotente onde possível (IF NOT EXISTS). Revisar antes de aplicar num banco novo.');
p('');

// ── Tabelas + colunas ──────────────────────────────────────────────────────
const { rows: tables } = await client.query(`
  SELECT c.relname AS table_name, c.relrowsecurity AS rls
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
  ORDER BY c.relname
`);

for (const t of tables) {
  const { rows: cols } = await client.query(`
    SELECT a.attname AS name,
           format_type(a.atttypid, a.atttypmod) AS type,
           a.attnotnull AS notnull,
           pg_get_expr(d.adbin, d.adrelid) AS default
    FROM pg_attribute a
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE a.attrelid = ('public.' || $1)::regclass AND a.attnum > 0 AND NOT a.attisdropped
    ORDER BY a.attnum
  `, [t.table_name]);

  p(`-- ════════════════════════════════════════════════════════════════════`);
  p(`CREATE TABLE IF NOT EXISTS public."${t.table_name}" (`);
  const lines = cols.map((c) => {
    let line = `  "${c.name}" ${c.type}`;
    if (c.default) line += ` DEFAULT ${c.default}`;
    if (c.notnull) line += ' NOT NULL';
    return line;
  });
  p(lines.join(',\n'));
  p(');');

  // Constraints (PK, FK, UNIQUE, CHECK) — definição exata.
  const { rows: cons } = await client.query(`
    SELECT conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid = ('public.' || $1)::regclass
    ORDER BY contype DESC, conname
  `, [t.table_name]);
  for (const c of cons) {
    p(`ALTER TABLE public."${t.table_name}" ADD CONSTRAINT "${c.conname}" ${c.def};`);
  }

  if (t.rls) p(`ALTER TABLE public."${t.table_name}" ENABLE ROW LEVEL SECURITY;`);
  p('');
}

// ── Índices (exclui os que dão suporte a constraints) ────────────────────────
p('-- ── Índices ─────────────────────────────────────────────────────────────');
const { rows: idx } = await client.query(`
  SELECT indexdef FROM pg_indexes
  WHERE schemaname = 'public'
    AND indexname NOT IN (
      SELECT conname FROM pg_constraint WHERE connamespace = 'public'::regnamespace
    )
  ORDER BY tablename, indexname
`);
for (const i of idx) p(`${i.indexdef.replace('CREATE INDEX', 'CREATE INDEX IF NOT EXISTS').replace('CREATE UNIQUE INDEX', 'CREATE UNIQUE INDEX IF NOT EXISTS')};`);
p('');

// ── RLS policies ─────────────────────────────────────────────────────────────
p('-- ── Policies (RLS) ──────────────────────────────────────────────────────');
const { rows: pol } = await client.query(`
  SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
  FROM pg_policies WHERE schemaname = 'public'
  ORDER BY tablename, policyname
`);
for (const x of pol) {
  // pg pode devolver name[] como array OU como string '{anon,authenticated}'.
  const rolesArr = Array.isArray(x.roles)
    ? x.roles
    : String(x.roles || '').replace(/^\{|\}$/g, '').split(',').filter(Boolean);
  const roles = rolesArr.join(', ');
  let s = `CREATE POLICY "${x.policyname}" ON public."${x.tablename}"`;
  s += ` AS ${x.permissive === 'PERMISSIVE' ? 'PERMISSIVE' : 'RESTRICTIVE'}`;
  s += ` FOR ${x.cmd}`;
  if (roles) s += ` TO ${roles}`;
  if (x.qual) s += ` USING (${x.qual})`;
  if (x.with_check) s += ` WITH CHECK (${x.with_check})`;
  p(`${s};`);
}
p('');

// ── Funções ──────────────────────────────────────────────────────────────────
p('-- ── Funções ─────────────────────────────────────────────────────────────');
const { rows: fns } = await client.query(`
  SELECT pg_get_functiondef(p.oid) AS def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f'
  ORDER BY p.proname
`);
for (const f of fns) p(`${f.def};\n`);

await client.end();
process.stdout.write(out.join('\n') + '\n');
