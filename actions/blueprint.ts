'use server';

/**
 * Development Blueprint (Fase 1, Estágio 1) — geração da FONTE ÚNICA de
 * desenvolvimento por colaborador (foco do cargo + assessments IA4 + DISC → objeto
 * estruturado `DevelopmentBlueprint`). Persiste em `development_blueprints` (1 por
 * colaborador; UPSERT substitui o anterior). ADITIVO: PDI e trilha NÃO consomem
 * ainda (Estágios 2-3).
 *
 * Multi-tenant: todo acesso a dado de tenant vai por `tenantDb(empresaId)`. Caller
 * interno (lote/cron) passa `internal={ empresaId }` e a action REVALIDA o tenant
 * (defesa em profundidade), como em `gerarAvaliacaoAcumulada`.
 */

import { tenantDb } from '@/lib/tenant-db';
import { createSupabaseAdmin } from '@/lib/supabase';
import { requireAdminSupabase } from '@/lib/admin-supabase';
import { requireAdminAction } from '@/lib/auth/action-context';
import { focoDoCargo } from '@/lib/foco-cargo';
import { PROGRAMA_REGULAR_DUO } from '@/lib/season-engine/programa-config';
import { buildBlueprintPrompt, type BlueprintCompetenciaInput } from '@/lib/blueprint/prompt';
import type { DevelopmentBlueprint } from '@/lib/blueprint/types';
import { callAI, type AIConfig } from './ai-client';
import { extractJSON } from './utils';

const BLUEPRINT_SPEC_VERSION = 1;

export interface GerarBlueprintResult {
  ok?: true;
  blueprintId?: string;
  error?: string;
}

/**
 * Gera e persiste o Development Blueprint de UM colaborador.
 *
 * `internal.empresaId` (caller interno) pula o gate e usa esse tenant, mas
 * revalida que o colaborador pertence a ele (defense-in-depth). Sem `internal`,
 * exige o gate `ai.audit.regenerate` e resolve o tenant pelo próprio colaborador.
 */
export async function gerarBlueprint(
  { colaboradorId, aiConfig, internal }: {
    colaboradorId: string;
    aiConfig?: AIConfig;
    internal?: { empresaId: string };
  },
): Promise<GerarBlueprintResult> {
  if (!colaboradorId) return { error: 'colaboradorId obrigatório' };
  // Tenant só é conhecido após ler o colaborador → query inicial raw (com gate no
  // caminho admin, service-role no caminho interno).
  const sbRaw = internal ? createSupabaseAdmin() : await requireAdminSupabase('ai.audit.regenerate');
  try {
    const { data: colab } = await sbRaw.from('colaboradores')
      .select('id, empresa_id, nome_completo, cargo, d_natural, i_natural, s_natural, c_natural, perfil_dominante, lid_executivo, lid_motivador, lid_metodico, lid_sistematico')
      .eq('id', colaboradorId).maybeSingle();
    if (!colab) return { error: 'Colaborador não encontrado' };

    // Defense-in-depth: caller interno DEVE provar o tenant; rejeita colaborador
    // de outro tenant (colaboradorId forjado).
    if (internal?.empresaId && colab.empresa_id !== internal.empresaId) {
      return { error: 'Colaborador de outro tenant — acesso negado' };
    }
    const empresaId: string = colab.empresa_id;
    if (!empresaId) return { error: 'Colaborador sem empresa_id' };
    const tdb = tenantDb(empresaId);

    // empresas: id é o tenant — sem empresa_id; usar raw.
    const { data: empresa } = await sbRaw.from('empresas')
      .select('nome, segmento').eq('id', empresaId).single();
    if (!empresa) return { error: 'Empresa não encontrada' };

    // Foco do cargo (fonte única PDI↔trilha). Gate: sem foco, não gera.
    const { data: cargoEmp } = await tdb.from('cargos_empresa')
      .select('competencia_foco, competencias_foco').eq('nome', colab.cargo).maybeSingle();
    const focoCargo = focoDoCargo(cargoEmp);
    if (focoCargo.length === 0) {
      return { error: 'Selecione as competências foco do cargo antes de gerar o blueprint.' };
    }

    // Assessments (IA4) por competência foco → nível/nota consolidados.
    const competenciasFoco: BlueprintCompetenciaInput[] = [];
    for (const nomeComp of focoCargo) {
      const { data: assess } = await tdb.from('descriptor_assessments')
        .select('descritor, nota')
        .eq('colaborador_id', colaboradorId)
        .eq('competencia', nomeComp);
      const descritores = (assess || []).map((a: any) => ({
        descritor: a.descritor,
        nota: a.nota == null ? null : Number(a.nota),
      }));
      const notas = descritores.map((d) => d.nota).filter((n): n is number => typeof n === 'number');
      const media = notas.length ? notas.reduce((s, v) => s + v, 0) / notas.length : null;
      competenciasFoco.push({
        nome: nomeComp,
        // floor, não round: a pessoa é N1 até CONSOLIDAR o 2.0 (média 1.6 = N1,
        // não N2). Conservador e alinhado com o nível que o PDI mostra.
        nivel: media == null ? null : Math.max(1, Math.min(4, Math.floor(media))),
        nota_decimal: media == null ? null : Number(media.toFixed(2)),
        descritores,
      });
    }

    // Perfil comportamental (DISC) — vira leitura textual (sem scores no output).
    let perfilComportamental: string | undefined;
    if (colab.d_natural != null) {
      perfilComportamental = `DISC: D=${colab.d_natural} | I=${colab.i_natural} | S=${colab.s_natural} | C=${colab.c_natural}\nDominante: ${colab.perfil_dominante || '—'}\nLiderança: Executor=${colab.lid_executivo || 0}% | Motivador=${colab.lid_motivador || 0}% | Metódico=${colab.lid_metodico || 0}% | Sistemático=${colab.lid_sistematico || 0}%`;
    }

    // Parâmetros da trilha: Regular DUO (14 semanas, missões 4/8/12, avaliação 13/14).
    const cfg = PROGRAMA_REGULAR_DUO;
    const { system, user } = buildBlueprintPrompt({
      colaborador: { nome: colab.nome_completo, cargo: colab.cargo },
      empresa: { nome: empresa.nome, segmento: empresa.segmento },
      perfilComportamental,
      competenciasFoco,
      duracaoSemanas: cfg.semanas,
      semanasMissao: cfg.semanasMissao,
      semanasAvaliacao: cfg.semanasAvaliacao,
    });

    const resultado = await callAI(system, user, aiConfig || {}, 64000);
    const blueprint: DevelopmentBlueprint | null = await extractJSON(resultado);
    if (!blueprint) return { error: 'IA não retornou blueprint válido' };

    // Validação: competências não-vazio + toda semana com conexao_com_pdi não-vazio.
    if (!Array.isArray(blueprint.competencias) || blueprint.competencias.length === 0) {
      return { error: 'Blueprint sem competências' };
    }
    const semanas = blueprint.trilha?.semanas;
    if (!Array.isArray(semanas) || semanas.length === 0) {
      return { error: 'Blueprint sem trilha' };
    }
    const semanaSemPdi = semanas.find(
      (s) => !Array.isArray(s.conexao_com_pdi) || s.conexao_com_pdi.length === 0,
    );
    if (semanaSemPdi) {
      return { error: `Semana ${semanaSemPdi.semana} sem conexao_com_pdi (regra dura: toda semana referencia ≥1 objetivo)` };
    }

    // Nível autoritativo = calculado das notas de assessment (a IA tende a
    // arredondar pra cima; N1 real não pode virar N2 no output). Casa por nome.
    const nivelCalc = new Map(
      competenciasFoco
        .filter((c) => c.nivel != null)
        .map((c) => [c.nome.trim().toLowerCase(), c.nivel as number]),
    );
    for (const comp of blueprint.competencias) {
      const calc = nivelCalc.get((comp.nome || '').trim().toLowerCase());
      if (calc != null) comp.nivel_atual = `N${calc}` as DevelopmentBlueprint['competencias'][number]['nivel_atual'];
    }

    blueprint.spec_version = BLUEPRINT_SPEC_VERSION;

    // UPSERT por colaborador (substitui o anterior). empresa_id é injetado pelo tdb.
    const { data: saved, error: saveErr } = await tdb.from('development_blueprints').upsert({
      colaborador_id: colaboradorId,
      blueprint,
      spec_version: BLUEPRINT_SPEC_VERSION,
      gerado_em: new Date().toISOString(),
    }, { onConflict: 'empresa_id,colaborador_id' }).select('id').maybeSingle();

    if (saveErr) return { error: saveErr.message };
    return { ok: true, blueprintId: saved?.id };
  } catch (err: any) {
    return { error: err.message };
  }
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
 * com assessments IA4) e chama `gerarBlueprint` por item com `internal`,
 * acumulando ok/erros. Padrão de `gerarRelatoriosIndividuaisLote`.
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
      // Pré-requisito real do blueprint: assessments IA4. Sem eles, não há o que ler.
      const { data: assess } = await tdb.from('descriptor_assessments').select('colaborador_id');
      const ids = [...new Set((assess || []).map((a: any) => a.colaborador_id).filter(Boolean))] as string[];
      if (!ids.length) return { success: false, error: 'Nenhum colaborador com assessments (rode IA4 primeiro)' };
      const { data } = await tdb.from('colaboradores').select('id, nome_completo').in('id', ids);
      fila = data || [];
    }
    if (!fila.length) return { success: false, error: 'Nenhum colaborador na fila' };

    let ok = 0, erros = 0;
    const detalhes: BlueprintLoteDetalhe[] = [];
    for (const c of fila) {
      const r = await gerarBlueprint({ colaboradorId: c.id, aiConfig, internal: { empresaId } });
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
