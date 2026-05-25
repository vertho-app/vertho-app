#!/usr/bin/env node
/**
 * Aplica migration(s) SQL direto no Postgres do Supabase via DATABASE_URL.
 *
 * Por que existe: a Management API (PAT) retorna 403 nesta conta (sem
 * privilégio de Owner pro endpoint de SQL). A conexão direta com a senha
 * do banco (Session pooler) aplica DDL sem esse problema.
 *
 * Pré-requisito: `DATABASE_URL` no .env.local (Session pooler, IPv4):
 *   postgresql://postgres.<ref>:<senha>@aws-N-<região>.pooler.supabase.com:5432/postgres
 *
 * Uso:
 *   node --env-file=.env.local scripts/apply-migration.mjs migrations/116-admin-audit-log.sql [outra.sql ...]
 *   node --env-file=.env.local scripts/apply-migration.mjs --check   # só testa a conexão
 */
import { readFileSync } from 'node:fs';
import { argv, exit } from 'node:process';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('ERRO: DATABASE_URL ausente. Rode com: node --env-file=.env.local scripts/apply-migration.mjs <arquivo.sql>');
  exit(1);
}

const files = argv.slice(2).filter((a) => !a.startsWith('--'));
const checkOnly = argv.includes('--check');
if (!checkOnly && files.length === 0) {
  console.error('ERRO: informe ao menos um arquivo .sql (ou --check pra testar a conexão).');
  exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
console.log('✓ conectado ao Postgres');

if (checkOnly) {
  const { rows } = await client.query('select current_database() db, current_user usr, now() ts');
  console.log('  db:', rows[0].db, '| user:', rows[0].usr, '| now:', rows[0].ts);
  await client.end();
  exit(0);
}

let falhas = 0;
for (const file of files) {
  const sql = readFileSync(file, 'utf-8');
  try {
    await client.query(sql);
    console.log(`✓ aplicado: ${file}`);
  } catch (e) {
    falhas++;
    console.error(`✗ ERRO em ${file}: ${e.message}`);
  }
}

await client.end();
exit(falhas > 0 ? 2 : 0);
