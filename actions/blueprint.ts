'use server';

/**
 * Development Blueprint (Fase 1, Estágio 1) — geração da FONTE ÚNICA de
 * desenvolvimento por colaborador (foco do cargo + assessments IA4 + DISC → objeto
 * estruturado `DevelopmentBlueprint`). Persiste em `development_blueprints` (1 por
 * colaborador; UPSERT substitui o anterior). ADITIVO: PDI e trilha NÃO consomem
 * ainda (Estágios 2-3).
 *
 * Multi-tenant: todo acesso a dado de tenant vai por `tenantDb(empresaId)`.
 *
 * Gate: cada export é um endpoint HTTP (arquivo `'use server'`), então nenhum
 * export aceita flag de bypass — o gate `ai.audit.regenerate` roda sempre. Os
 * lotes aplicam o gate uma vez e chamam o núcleo privado (`*Core`), que revalida
 * o tenant de cada colaborador (defesa em profundidade).
 */

import { tenantDb } from '@/lib/tenant-db';
import { requireAdminSupabase } from '@/lib/admin-supabase';
import { requireAdminAction } from '@/lib/auth/action-context';
import {
  gerarBlueprintCore, auditarBlueprintCore, resolverFilaBlueprint100,
  type GerarBlueprintResult, type AuditarBlueprintResult,
} from '@/lib/blueprint/core';
import type { DevelopmentBlueprint } from '@/lib/blueprint/types';
import type { AIConfig } from './ai-client';

/**
 * @deprecated STUB de depreciação (C1b, 24/08/2026).
 *
 * Gerava UM blueprint de forma síncrona, e a tela chamava isto num laço, um
 * colaborador por vez, presa na aba. Com o deadline real ligado no stream (C1),
 * o caminho deixou de ser sustentável: 277 s medidos contra 300 s de
 * `maxDuration` é margem de 23 s — cabe, e não sustenta SLA nenhum.
 *
 * Stub, e não removido, pelo mesmo motivo do `gerarBlueprintsLote`: `'use server'`
 * publica action id, e o Skew Protection segura o cliente antigo por até 12 h.
 * Um export que some dá erro opaco; um stub responde o motivo.
 *
 * O núcleo (`gerarBlueprintCore`) segue vivo e é o que a task de lote usa.
 */
export async function gerarBlueprint(
  _params: { colaboradorId: string; aiConfig?: AIConfig },
): Promise<GerarBlueprintResult> {
  await requireAdminAction('ai.audit.regenerate');
  return { error: LOTE_DEPRECIADO };
}

export interface BlueprintLoteDetalhe {
  colaborador: string;
  ok?: boolean;
  erro?: string;
}

export interface GerarBlueprintsLoteResult {
  success: boolean;
  error?: string;
  message?: string;
  ok?: number;
  erros?: number;
  detalhes?: BlueprintLoteDetalhe[];
}

/**
 * Mensagem única dos caminhos SÍNCRONOS de blueprint, depreciados (F-E4 + C1b).
 *
 * ⚠️ A versão anterior desta mensagem mandava usar "a fila + loop no cliente" —
 * o caminho que o C1b removeu em 24/08. Mensagem de depreciação que aponta para
 * outro caminho morto é pior que nenhuma: ela ensina o errado com autoridade.
 */
const LOTE_DEPRECIADO =
  'Geração síncrona de blueprint foi DEPRECIADA (F-E4 + C1b): cada blueprint leva ~2 min '
  + '(máx medido 277 s contra os 300 s de maxDuration), então o caminho síncrono estoura sob '
  + 'qualquer variação de carga — e o estouro custa a geração paga mais o retry. '
  + 'Use `enqueueBlueprintBatch(empresaId)` UMA vez para o lote inteiro: Batch API (−50%), '
  + 'assíncrono, com job re-adotado ao recarregar a tela.';

/**
 * @deprecated STUB de depreciação (F-E4 do `docs/FMEA-PIPELINE.md`).
 *
 * Recusa sem tocar em IA ou banco. O padrão correto já existia e É o caminho real da
 * tela desde antes: `filaBlueprint` + um `gerarBlueprint` por colaborador no cliente
 * (`app/admin/empresas/[empresaId]/page.tsx`), com progresso e cancelamento. Este lote
 * não tinha nenhum caller quando foi depreciado (28/07) — a UI nunca o importou.
 *
 * Mantido como stub, e não removido, porque `'use server'` publica action id: um export
 * que desaparece dá erro opaco no cliente de um deploy antigo; um stub responde o motivo.
 */
export async function gerarBlueprintsLote(
  _empresaId: string,
  _colaboradorIds?: string[],
  _aiConfig?: AIConfig,
): Promise<GerarBlueprintsLoteResult> {
  await requireAdminAction('ai.audit.regenerate');
  return { success: false, error: LOTE_DEPRECIADO };
}

export interface FilaBlueprintItem { id: string; nome: string; }
export interface FilaBlueprintResult { success: boolean; error?: string; data?: FilaBlueprintItem[]; }

/**
 * Fila de GERAÇÃO de blueprint: colaboradores com assessments IA4 (pré-requisito).
 * Rápida (sem IA) — o cliente itera chamando `gerarBlueprint` por colaborador,
 * evitando o timeout de 300s da Vercel que estourava no lote síncrono.
 */
/**
 * @deprecated STUB de depreciação (C1b, 24/08/2026).
 *
 * Listava a fila para o laço no cliente, que saiu junto com o caminho síncrono.
 * Quem monta a fila hoje é `enqueueBlueprintBatch`, do lado do servidor, com a
 * MESMA regra dos 100% (`resolverFilaBlueprint100`, que segue viva em
 * `lib/blueprint/core.ts`).
 */
export async function filaBlueprint(_empresaId: string): Promise<FilaBlueprintResult> {
  await requireAdminAction('ai.audit.regenerate');
  return { success: false, error: LOTE_DEPRECIADO };
}

/**
 * Fila de AUDITORIA: colaboradores que JÁ têm blueprint. Rápida (sem IA) — o
 * cliente itera chamando `auditarBlueprint` por colaborador (mesma razão do timeout).
 */
export async function filaAuditBlueprint(empresaId: string): Promise<FilaBlueprintResult> {
  await requireAdminAction('ai.audit.regenerate');
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const tdb = tenantDb(empresaId);
  try {
    const { data: bps } = await tdb.from('development_blueprints').select('colaborador_id');
    const ids = [...new Set((bps || []).map((b: any) => b.colaborador_id).filter(Boolean))] as string[];
    if (!ids.length) return { success: false, error: 'Nenhum colaborador com blueprint (gere o blueprint primeiro)' };
    const { data } = await tdb.from('colaboradores').select('id, nome_completo').in('id', ids).order('nome_completo');
    return { success: true, data: (data || []).map((c: any) => ({ id: c.id, nome: c.nome_completo })) };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/** Retorna o blueprint salvo de um colaborador (inspeção). */
export async function getBlueprint(empresaId: string, colaboradorId: string): Promise<
  { ok: true; id: string; blueprint: DevelopmentBlueprint; spec_version: number; gerado_em: string } | { error: string }
> {
  await requireAdminAction('ai.audit.regenerate');
  if (!empresaId || !colaboradorId) return { error: 'empresaId e colaboradorId obrigatórios' };
  const tdb = tenantDb(empresaId);
  try {
    const { data } = await tdb.from('development_blueprints')
      .select('id, blueprint, spec_version, gerado_em')
      .eq('colaborador_id', colaboradorId)
      .order('gerado_em', { ascending: false })
      .limit(1).maybeSingle();
    if (!data) return { error: 'Blueprint não encontrado' };
    return { ok: true, id: data.id, blueprint: data.blueprint, spec_version: data.spec_version, gerado_em: data.gerado_em };
  } catch (err: any) {
    return { error: err.message };
  }
}

/** Audita o blueprint de UM colaborador. Gated. */
export async function auditarBlueprint(
  { colaboradorId, aiConfig }: { colaboradorId: string; aiConfig?: AIConfig },
): Promise<AuditarBlueprintResult> {
  const sbRaw = await requireAdminSupabase('ai.audit.regenerate');
  return auditarBlueprintCore(sbRaw, { colaboradorId, aiConfig });
}

export interface AuditarLoteDetalhe {
  colaborador: string;
  ok?: boolean;
  drift?: boolean;
  score?: number;
  erro?: string;
}

export interface AuditarBlueprintsLoteResult {
  success: boolean;
  error?: string;
  message?: string;
  ok?: number;
  comDrift?: number;
  erros?: number;
  detalhes?: AuditarLoteDetalhe[];
}

/**
 * @deprecated STUB de depreciação (F-E4). Gêmeo de `gerarBlueprintsLote` — mesma
 * mecânica, mesmo risco de 504, e também sem caller quando foi depreciado (28/07).
 * O caminho é `filaAuditBlueprint` + `auditarBlueprint` por colaborador no cliente.
 */
export async function auditarBlueprintsLote(
  _empresaId: string,
  _colaboradorIds?: string[],
  _aiConfig?: AIConfig,
): Promise<AuditarBlueprintsLoteResult> {
  await requireAdminAction('ai.audit.regenerate');
  return { success: false, error: LOTE_DEPRECIADO };
}
