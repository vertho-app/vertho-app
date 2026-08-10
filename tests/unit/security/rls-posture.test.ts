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

/**
 * ⚠️ `skipIf(!DB)` sozinho é a armadilha que a auditoria de 09-10/08 catalogou
 * (F2): sem `DATABASE_URL` o arquivo inteiro pula e o CI fica verde **sem ter
 * rodado**. Enquanto isso, o INV4 saía com exit 1 na máquina de quem tinha o
 * `.env.local` — vermelho de verdade que ninguém via.
 *
 * A separação: PR roda verificação ESTÁTICA (`rls-policy-estatica-guard`), que
 * não precisa de banco e não pode receber credencial de produção — o PR pode
 * modificar o código que executa. O banco VIVO é conferido pelo job próprio
 * `.github/workflows/rls-posture.yml`.
 *
 * 🔑 **Quem garante que o skip não vira verde é o WORKFLOW, não este arquivo.**
 * A primeira versão colocava a exigência aqui, atrás de uma env
 * (`RLS_POSTURE_REQUIRED`) — e na primeira execução o vitest não recebeu a
 * variável, o `skipIf` caiu no ramo de skip e o guard-contra-verde-falso passou
 * verde sem rodar. O job agora falha no shell (`[ -z "$SECRET" ]`) antes de
 * chegar aqui: uma condição que não depende de propagação de env para dentro de
 * worker de teste.
 */
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

  /**
   * INV2 — REESCRITO em 10/08/2026. A versão anterior tinha DOIS pontos cegos, e
   * o F1 (acervo de 10 tenants legível por qualquer sessão autenticada) passou
   * pelos dois:
   *
   *  · filtrava `roles @> '{public}' OR '{anon}'` — o papel **`authenticated`
   *    nunca entrava na conta**, e era exatamente ele que estava aberto;
   *  · casava `qual = 'true'`, enquanto `micro_conteudos` era
   *    `USING (ativo = true)` — igualmente permissiva e igualmente invisível.
   *
   * A régua agora não é um padrão de `qual`: é a lista de tabelas **tenant-owned
   * derivada do próprio banco** (as que têm coluna `empresa_id`) contra o que a
   * policy referencia. Tabela com dono precisa de policy que fale de dono.
   * `service_role` sozinho fica de fora — tem BYPASSRLS, a policy não é a defesa
   * dele; e `diag_*` (censo público do Radar) segue como exceção nomeada.
   */
  it('INV2 — nenhuma policy sobre tabela tenant-owned sem filtro de tenant', async () => {
    const v = await violations(`
      SELECT p.tablename, p.policyname FROM pg_policies p
      WHERE p.schemaname = 'public'
        AND EXISTS (
          SELECT 1 FROM information_schema.columns c
          WHERE c.table_schema = 'public' AND c.table_name = p.tablename AND c.column_name = 'empresa_id'
        )
        AND NOT (p.roles @> '{service_role}' AND array_length(p.roles, 1) = 1)
        AND p.tablename NOT LIKE 'diag\\_%'
        AND coalesce(p.qual, '') !~* 'empresa_id|current_colaborador_id|can_read_sessao_avaliacao'
        AND coalesce(p.with_check, '') !~* 'empresa_id|current_colaborador_id'
      ORDER BY p.tablename, p.policyname`);
    expect(v).toEqual([]);
  });

  /**
   * O INV2 acima só pode ficar verde por MEDIÇÃO, não por cegueira — e como as
   * policies do F1 foram dropadas (mig 206), não há mais nada real para ele
   * acusar. Este teste roda o MESMO predicado contra linhas sintéticas, entre
   * elas as duas policies exatas que existiam: se alguém afrouxar a régua do
   * INV2, isto acusa sem depender do estado do banco.
   */
  it('INV2 — o predicado pega o F1 e absolve as policies legítimas', async () => {
    const { rows } = await client.query(`
      WITH fake(tablename, policyname, roles, qual, with_check) AS (VALUES
        ('competencias',   'authenticated_select_competencias', '{authenticated}'::name[], 'true',                            NULL),
        ('micro_conteudos','mc_authenticated_read',             '{authenticated}'::name[], '(ativo = true)',                  NULL),
        ('colaboradores',  'tenant_ok',                         '{authenticated}'::name[], '(empresa_id = get_empresa_id())', NULL),
        ('colaboradores',  'update_self',                       '{authenticated}'::name[], '(id = current_colaborador_id())', NULL),
        ('micro_conteudos','mc_service_all',                    '{service_role}'::name[],  'true',                            NULL)
      )
      SELECT f.tablename || '.' || f.policyname AS policy,
             (EXISTS (SELECT 1 FROM information_schema.columns c
                      WHERE c.table_schema='public' AND c.table_name=f.tablename AND c.column_name='empresa_id')
              AND NOT (f.roles @> '{service_role}' AND array_length(f.roles,1)=1)
              AND f.tablename NOT LIKE 'diag\\_%'
              AND coalesce(f.qual,'') !~* 'empresa_id|current_colaborador_id|can_read_sessao_avaliacao'
              AND coalesce(f.with_check,'') !~* 'empresa_id|current_colaborador_id') AS acusa
      FROM fake f`);

    const veredito = Object.fromEntries(rows.map((r: any) => [r.policy, r.acusa]));
    // as duas que abriram o acervo de 10 tenants — inclusive a `USING (ativo = true)`,
    // que o INV2 anterior (`qual = 'true'`) deixava passar
    expect(veredito['competencias.authenticated_select_competencias']).toBe(true);
    expect(veredito['micro_conteudos.mc_authenticated_read']).toBe(true);
    // e as que estão certas seguem passando — guard que acusa quem fez certo vira ruído
    expect(veredito['colaboradores.tenant_ok']).toBe(false);
    expect(veredito['colaboradores.update_self']).toBe(false);
    expect(veredito['micro_conteudos.mc_service_all']).toBe(false);
  });

  it('INV2b — nenhuma policy permissiva USING/CHECK(true) a public/anon (exceto censo diag_*)', async () => {
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
