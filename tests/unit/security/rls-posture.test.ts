import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { Client } from 'pg';

/**
 * Guard de ESTADO DO BANCO — congela a postura de RLS/segurança estabelecida
 * pelas migrations 155-158 (auditoria 03/07). Diferente do tenant-mutation-guard
 * (scan estático de código), estas invariantes são propriedades do banco vivo:
 * uma migration futura descuidada (policy `USING(true)`, `DISABLE RLS`, MV
 * exposta a anon, função definer sem search_path) reabriria em silêncio.
 *
 * Roda contra o banco de `DATABASE_URL` (ou .env.local). SEM DATABASE_URL →
 * SKIP (CI sem banco passa). Só faz SELECTs de catálogo (read-only).
 *
 * Como corrigir uma falha: NÃO adicione o objeto a uma allowlist — conserte a
 * postura (dropar a permissiva, religar RLS, revogar o grant, fixar search_path).
 * Exceção legítima já embutida: tabelas `diag_*` (censo público do Radar) PODEM
 * ter policy `USING(true) FOR SELECT` a public.
 */

function getDatabaseUrl(): string | null {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const env = readFileSync('.env.local', 'utf8');
    return env.match(/^DATABASE_URL=["']?([^"'\r\n]+)/m)?.[1] || null;
  } catch {
    return null;
  }
}
const DB = getDatabaseUrl();

describe.skipIf(!DB)('RLS posture guard (migs 155-158)', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: DB!, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
    await client.connect();
  });
  afterAll(async () => { await client?.end(); });

  const violations = async (sql: string): Promise<string[]> =>
    (await client.query(sql)).rows.map((r) => Object.values(r).filter(Boolean).join('.'));

  it('INV1 — nenhuma tabela de public com RLS OFF concede SELECT a anon', async () => {
    const v = await violations(`
      SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = false
        AND has_table_privilege('anon', c.oid, 'SELECT')
      ORDER BY c.relname`);
    expect(v).toEqual([]);
  });

  it('INV2 — nenhuma policy permissiva USING/CHECK(true) a public/anon (exceto censo diag_*)', async () => {
    const v = await violations(`
      SELECT tablename, policyname FROM pg_policies
      WHERE schemaname = 'public' AND (qual = 'true' OR with_check = 'true')
        AND (roles @> '{public}' OR roles @> '{anon}')
        AND tablename NOT LIKE 'diag\\_%'
      ORDER BY tablename, policyname`);
    expect(v).toEqual([]);
  });

  it('INV3 — a função exec_sql não existe (RCE removida)', async () => {
    const v = await violations(`
      SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'exec_sql'`);
    expect(v).toEqual([]);
  });

  it('INV4 — nenhuma materialized view concede SELECT a anon/authenticated', async () => {
    const v = await violations(`
      SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'm'
        AND (has_table_privilege('anon', c.oid, 'SELECT') OR has_table_privilege('authenticated', c.oid, 'SELECT'))
      ORDER BY c.relname`);
    expect(v).toEqual([]);
  });

  it('INV5 — toda função SECURITY DEFINER de public tem search_path fixo', async () => {
    const v = await violations(`
      SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef
        AND (p.proconfig IS NULL OR NOT EXISTS (
          SELECT 1 FROM unnest(p.proconfig) s WHERE s LIKE 'search_path=%'))
      ORDER BY p.proname`);
    expect(v).toEqual([]);
  });
});
