/**
 * Tenant-scoped Supabase client — força filtro por empresa_id em todas
 * as queries tenant-owned, reduzindo risco de vazamento entre empresas.
 *
 * Uso:
 *   const tdb = tenantDb(empresaId);
 *   await tdb.from('colaboradores').select('*');           // filtra automaticamente
 *   await tdb.from('colaboradores').insert({ nome: 'X' }); // injeta empresa_id
 *   await tdb.raw.from('competencias_base').select('*');   // escape hatch pra tabelas globais
 *
 * Tabelas GLOBAIS (sem empresa_id) — use `tdb.raw`:
 *   competencias_base, platform_admins, banco_cenarios (parcial), ia_usage_log, prompt_versions
 *
 * Tabelas TENANT-OWNED (com empresa_id) — tdb.from() é suficiente:
 *   colaboradores, competencias, trilhas, temporada_semana_progresso,
 *   descriptor_assessments, micro_conteudos, sessoes_avaliacao,
 *   mensagens_chat, respostas, fase4_envios, fit_resultados, cargos,
 *   cargos_empresa, banco_cenarios (por empresa), checkpoints_gestor,
 *   pdis, relatorios, videos_watched, cis_ia_referencia, evolucao, etc.
 */

import { createSupabaseAdmin } from './supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Wrapper builder que se parece com `sb.from()` do Supabase mas com filtros
 * de tenant injetados. Tipado como `any` porque o builder do Supabase tem
 * encadeamento dinâmico difícil de modelar — o ganho de tipos aqui não
 * compensa a fricção. As tabelas chamadoras já tipam seus retornos.
 */
type TenantQueryBuilder = any;

export interface TenantDb {
  from(table: string): TenantQueryBuilder;
  /** Escape hatch: acesso direto ao client admin, bypass do filtro.
   *  Use só em tabelas globais (competencias_base, platform_admins) ou
   *  operações cross-tenant legítimas. */
  raw: SupabaseClient;
  /** Auth, storage, rpc seguem no raw. */
  auth: SupabaseClient['auth'];
  storage: SupabaseClient['storage'];
  rpc: SupabaseClient['rpc'];
}

export function tenantDb(tenantId: string): TenantDb {
  if (!tenantId) throw new Error('tenantDb: tenantId obrigatório');
  const sb = createSupabaseAdmin();

  return {
    from(table: string): TenantQueryBuilder {
      const q = sb.from(table);
      return new Proxy(q, {
        get(target: any, prop: string | symbol) {
          if (prop === 'select') {
            return (...args: unknown[]) => target.select(...args).eq('empresa_id', tenantId);
          }
          if (prop === 'insert') {
            return (rows: unknown, opts?: unknown) => {
              const withTenant = Array.isArray(rows)
                ? rows.map((r) => ({ empresa_id: tenantId, ...(r as object) }))
                : { empresa_id: tenantId, ...(rows as object) };
              return target.insert(withTenant, opts);
            };
          }
          if (prop === 'upsert') {
            return (rows: unknown, opts?: unknown) => {
              const withTenant = Array.isArray(rows)
                ? rows.map((r) => ({ empresa_id: tenantId, ...(r as object) }))
                : { empresa_id: tenantId, ...(rows as object) };
              return target.upsert(withTenant, opts);
            };
          }
          if (prop === 'update') {
            return (changes: unknown) => target.update(changes).eq('empresa_id', tenantId);
          }
          if (prop === 'delete') {
            return () => target.delete().eq('empresa_id', tenantId);
          }
          const v = target[prop];
          return typeof v === 'function' ? v.bind(target) : v;
        },
      });
    },

    raw: sb,
    auth: sb.auth,
    storage: sb.storage,
    rpc: sb.rpc.bind(sb),
  };
}

/**
 * Helper: extrai tenantId do colaborador a partir do email autenticado.
 * Uso típico em rotas/actions que recebem email do usuário logado.
 */
export async function resolveTenantByEmail(email: string): Promise<string | null> {
  const sb = createSupabaseAdmin();
  const { data } = await sb.from('colaboradores')
    .select('empresa_id').eq('email', email).maybeSingle();
  return (data as { empresa_id?: string } | null)?.empresa_id || null;
}
