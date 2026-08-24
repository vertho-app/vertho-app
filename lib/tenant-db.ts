/**
 * Tenant-scoped Supabase client — força filtro por empresa_id em todas
 * as queries tenant-owned, reduzindo risco de vazamento entre empresas.
 *
 * 🔴 E5 (auditoria 22/08) — O CONTRATO ERA FALSO NOS TRÊS VERBOS DE ESCRITA,
 * e todo o sistema de guards trata `tdb.` como PROVA de isolamento.
 *
 *   insert/upsert:  { empresa_id: tenantId, ...rows }   → o payload VENCIA
 *   update:         .eq('empresa_id', tenantId)         → o `.eq` escolhe QUAL
 *                                                          linha; `changes`
 *                                                          passava intacto
 *
 * O spread com o payload DEPOIS do default significava que
 * `tdb.from('colaboradores').insert({ empresa_id: outro, … })` gravava no outro
 * tenant — usando o wrapper que existe para impedir exatamente isso. E o
 * `update` era pior: `tdb.from('colaboradores').update({ empresa_id: outro })`
 * seleciona uma linha do MEU tenant e a TIRA de lá; o `.eq` não protege o
 * payload, só escolhe a vítima.
 *
 * Hoje o alcance real é pequeno (1 de 29 call-sites carrega `empresa_id` no
 * payload, com valor interno) — o problema é que a garantia que os guards
 * assumem não existia. Agora os três verbos LANÇAM quando o payload traz um
 * `empresa_id` divergente; `null`/`undefined` explícito é tratado como "usa o
 * tenant" e não como "sem tenant".
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

  /**
   * O tenant do wrapper VENCE o payload — e divergência é erro, não correção
   * silenciosa.
   *
   * Escrever `{ empresa_id: tenantId, ...row }` (o default ANTES do spread)
   * deixava o payload sobrescrever; inverter para `{ ...row, empresa_id }`
   * consertaria o vazamento e criaria outro problema: um call-site que passa o
   * tenant errado por engano passaria a gravar no tenant certo em silêncio, e
   * ninguém descobriria que o chamador está errado. Lançar mostra o bug.
   *
   * `null`/`undefined` explícito no payload significa "não sei o tenant" — o do
   * wrapper preenche, sem reclamar.
   */
  const comTenant = (row: unknown, verbo: string) => {
    const obj = { ...(row as Record<string, unknown>) };
    const doPayload = obj.empresa_id;
    if (doPayload != null && doPayload !== tenantId) {
      throw new Error(
        `tenantDb.${verbo}: payload com empresa_id ${String(doPayload)} sob o tenant ${tenantId}. ` +
        'O wrapper existe para impedir escrita cross-tenant — use tdb.raw se a operação é mesmo cross-tenant.',
      );
    }
    return { ...obj, empresa_id: tenantId };
  };

  const normalizar = (rows: unknown, verbo: string) =>
    Array.isArray(rows) ? rows.map((r) => comTenant(r, verbo)) : comTenant(rows, verbo);

  return {
    from(table: string): TenantQueryBuilder {
      const q = sb.from(table);
      return new Proxy(q, {
        get(target: any, prop: string | symbol) {
          if (prop === 'select') {
            return (...args: unknown[]) => target.select(...args).eq('empresa_id', tenantId);
          }
          if (prop === 'insert') {
            return (rows: unknown, opts?: unknown) => target.insert(normalizar(rows, 'insert'), opts);
          }
          if (prop === 'upsert') {
            return (rows: unknown, opts?: unknown) => target.upsert(normalizar(rows, 'upsert'), opts);
          }
          if (prop === 'update') {
            return (changes: unknown) => {
              // 🔴 O `.eq` escolhe QUAL linha; ele não olha o que está sendo
              // gravado. Sem esta checagem, `update({ empresa_id: outro })`
              // seleciona uma linha do tenant certo e a MOVE para outro.
              const doPayload = (changes as Record<string, unknown> | null)?.empresa_id;
              if (doPayload != null && doPayload !== tenantId) {
                throw new Error(
                  `tenantDb.update: tentativa de mover linha para o tenant ${String(doPayload)} ` +
                  `sob o tenant ${tenantId}. Use tdb.raw se a migração entre empresas é intencional.`,
                );
              }
              return target.update(changes).eq('empresa_id', tenantId);
            };
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
