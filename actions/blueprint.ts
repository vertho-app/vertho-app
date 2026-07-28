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

/** Gera e persiste o Development Blueprint de UM colaborador. Gated. */
export async function gerarBlueprint(
  { colaboradorId, aiConfig }: { colaboradorId: string; aiConfig?: AIConfig },
): Promise<GerarBlueprintResult> {
  // O tenant só é conhecido após ler o colaborador, então o gate é de permissão
  // (admin), não de tenant — e o client volta já autorizado.
  const sbRaw = await requireAdminSupabase('ai.audit.regenerate');
  return gerarBlueprintCore(sbRaw, { colaboradorId, aiConfig });
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

/** Mensagem única dos lotes síncronos depreciados (F-E4). */
const LOTE_DEPRECIADO =
  'Lote síncrono de blueprint foi DEPRECIADO (F-E4): N chamadas de IA numa server action '
  + 'estouram o maxDuration de 300s e o lote morre 504 no meio, sem retomada. Use a fila + '
  + 'loop no cliente, que já é o caminho da tela: filaBlueprint/filaAuditBlueprint + '
  + 'gerarBlueprint/auditarBlueprint por colaborador (progresso [i/N], erro por item, botão de parar).';

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
export async function filaBlueprint(empresaId: string): Promise<FilaBlueprintResult> {
  await requireAdminAction('ai.audit.regenerate');
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const tdb = tenantDb(empresaId);
  try {
    // Regra dos 100%: só colabs com TODAS as competências foco mapeadas.
    const fila = await resolverFilaBlueprint100(tdb);
    if (!fila.length) return { success: false, error: 'Nenhum colaborador com as competências foco 100% mapeadas (complete o mapeamento primeiro)' };
    return { success: true, data: fila.map((c) => ({ id: c.id, nome: c.nome })).sort((a, b) => a.nome.localeCompare(b.nome)) };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
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
