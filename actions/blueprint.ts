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
import { createSupabaseAdmin } from '@/lib/supabase';
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

/**
 * Gera blueprints em LOTE: resolve a fila (ids dados, ou todos os colaboradores
 * com assessments IA4) e chama o núcleo por item, acumulando ok/erros.
 * O gate roda UMA vez aqui; o núcleo revalida o tenant de cada colaborador.
 */
export async function gerarBlueprintsLote(
  empresaId: string,
  colaboradorIds?: string[],
  aiConfig?: AIConfig,
): Promise<GerarBlueprintsLoteResult> {
  await requireAdminAction('ai.audit.regenerate');
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const tdb = tenantDb(empresaId);
  try {
    let fila: { id: string; nome_completo: string }[] = [];
    if (colaboradorIds?.length) {
      const { data } = await tdb.from('colaboradores')
        .select('id, nome_completo').in('id', colaboradorIds);
      fila = data || [];
    } else {
      // Regra dos 100%: só colabs com TODAS as competências foco mapeadas
      // (parcial/zero fica de fora — o núcleo também barra por defesa em profundidade).
      const fila100 = await resolverFilaBlueprint100(tdb);
      if (!fila100.length) return { success: false, error: 'Nenhum colaborador com as competências foco 100% mapeadas' };
      fila = fila100.map((c) => ({ id: c.id, nome_completo: c.nome }));
    }
    if (!fila.length) return { success: false, error: 'Nenhum colaborador na fila' };

    let ok = 0, erros = 0;
    const detalhes: BlueprintLoteDetalhe[] = [];
    // Gate já aplicado no topo → service-role direto, sem re-checar sessão por item.
    const sbRaw = createSupabaseAdmin();
    for (const c of fila) {
      const r = await gerarBlueprintCore(sbRaw, { colaboradorId: c.id, aiConfig, empresaIdEsperado: empresaId });
      if (r.ok) { ok++; detalhes.push({ colaborador: c.nome_completo, ok: true }); }
      else { erros++; detalhes.push({ colaborador: c.nome_completo, erro: r.error }); }
    }
    return {
      success: true, ok, erros, detalhes,
      message: `${ok} blueprint(s) gerado(s)${erros ? ` · ${erros} erro(s)` : ''}`,
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
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
 * Audita em LOTE os colaboradores que JÁ têm blueprint (o audit precisa de um
 * blueprint gerado). Padrão de `gerarBlueprintsLote`.
 */
export async function auditarBlueprintsLote(
  empresaId: string,
  colaboradorIds?: string[],
  aiConfig?: AIConfig,
): Promise<AuditarBlueprintsLoteResult> {
  await requireAdminAction('ai.audit.regenerate');
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const tdb = tenantDb(empresaId);
  try {
    // Fila = quem tem blueprint (pré-requisito do audit).
    const { data: bps } = await tdb.from('development_blueprints').select('colaborador_id');
    const ids = colaboradorIds?.length
      ? colaboradorIds
      : [...new Set((bps || []).map((b: any) => b.colaborador_id).filter(Boolean))] as string[];
    if (!ids.length) return { success: false, error: 'Nenhum colaborador com blueprint (gere o blueprint primeiro)' };

    const { data: colabs } = await tdb.from('colaboradores').select('id, nome_completo').in('id', ids);
    const nomePorId = new Map<string, string>((colabs || []).map((c: any) => [c.id, c.nome_completo]));

    let ok = 0, erros = 0, comDrift = 0;
    const detalhes: AuditarLoteDetalhe[] = [];
    // Gate já aplicado no topo → service-role direto, sem re-checar sessão por item.
    const sbRaw = createSupabaseAdmin();
    for (const id of ids) {
      const nome = nomePorId.get(id) || id;
      const r = await auditarBlueprintCore(sbRaw, { colaboradorId: id, aiConfig, empresaIdEsperado: empresaId });
      if (r.ok && r.relatorio) {
        ok++;
        if (r.relatorio.drift) comDrift++;
        detalhes.push({ colaborador: nome, ok: true, drift: r.relatorio.drift, score: r.relatorio.score });
      } else {
        erros++;
        detalhes.push({ colaborador: nome, erro: r.error });
      }
    }
    return {
      success: true, ok, comDrift, erros, detalhes,
      message: `${ok} auditado(s)${comDrift ? ` · ${comDrift} com drift` : ''}${erros ? ` · ${erros} erro(s)` : ''}`,
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
