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

export function tenantDb(tenantId) {
  if (!tenantId) throw new Error('tenantDb: tenantId obrigatório');
  const sb = createSupabaseAdmin();

  return {
    // Query builder tenant-scoped — força filtro por empresa_id em select/update/delete,
    // injeta empresa_id em insert/upsert.
    from(table) {
      const q = sb.from(table);
      return new Proxy(q, {
        get(target, prop) {
          if (prop === 'select') {
            return (...args) => target.select(...args).eq('empresa_id', tenantId);
          }
          if (prop === 'insert') {
            return (rows, opts) => {
              const withTenant = Array.isArray(rows)
                ? rows.map(r => ({ empresa_id: tenantId, ...r })) // row pode sobrescrever se quiser
                : { empresa_id: tenantId, ...rows };
              return target.insert(withTenant, opts);
            };
          }
          if (prop === 'upsert') {
            return (rows, opts) => {
              const withTenant = Array.isArray(rows)
                ? rows.map(r => ({ empresa_id: tenantId, ...r }))
                : { empresa_id: tenantId, ...rows };
              return target.upsert(withTenant, opts);
            };
          }
          if (prop === 'update') {
            return (changes) => target.update(changes).eq('empresa_id', tenantId);
          }
          if (prop === 'delete') {
            return () => target.delete().eq('empresa_id', tenantId);
          }
          const v = target[prop];
          return typeof v === 'function' ? v.bind(target) : v;
        },
      });
    },

    /** Escape hatch: acesso direto ao client admin, bypass do filtro.
     *  Use só em tabelas globais (competencias_base, platform_admins) ou
     *  operações cross-tenant legítimas. */
    raw: sb,

    /** Auth, storage, rpc seguem no raw. */
    auth: sb.auth,
    storage: sb.storage,
    rpc: sb.rpc.bind(sb),
  };
}

/**
 * Helper: extrai tenantId do colaborador a partir do email autenticado.
 * Uso típico em rotas/actions que recebem email do usuário logado.
 */
export async function resolveTenantByEmail(email) {
  const sb = createSupabaseAdmin();
  const { data } = await sb.from('colaboradores')
    .select('empresa_id').eq('email', email).maybeSingle();
  return data?.empresa_id || null;
}
