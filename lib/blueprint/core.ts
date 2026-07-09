/**
 * NÚCLEO do Development Blueprint — geração + auditoria, SEM guard de sessão.
 *
 * Vive em `lib/` pelo mesmo motivo de `lib/modulo-base-auditor.ts`: scripts,
 * seeds e tasks precisam gerar/auditar blueprint headless, e um módulo
 * `'use server'` não pode ser importado por eles sem transformar cada export
 * num endpoint HTTP — o que reexporia o bypass de gate que este arquivo existe
 * para conter.
 *
 * REGRA: estas funções NÃO autorizam ninguém. Recebem um client service-role já
 * autorizado pelo caller. Quem expõe à web é `actions/blueprint.ts`, que aplica
 * o gate `ai.audit.regenerate` antes de chamar. `empresaIdEsperado` revalida o
 * tenant do colaborador (defesa em profundidade).
 */

import { tenantDb } from '@/lib/tenant-db';
import { createSupabaseAdmin } from '@/lib/supabase';
import { focoDoCargo } from '@/lib/foco-cargo';
import { PROGRAMA_REGULAR_DUO } from '@/lib/season-engine/programa-config';
import { buildBlueprintPrompt, type BlueprintCompetenciaInput } from '@/lib/blueprint/prompt';
import {
  auditEstrutural, buildBlueprintAuditPrompt, parseAuditResponse, montarRelatorioAuditoria,
  type BlueprintAuditReport,
} from '@/lib/blueprint/audit';
import type { DevelopmentBlueprint } from '@/lib/blueprint/types';
import { callAI, type AIConfig } from '@/actions/ai-client';
import { extractJSON } from '@/actions/utils';

export const BLUEPRINT_SPEC_VERSION = 1;

export interface GerarBlueprintResult {
  ok?: true;
  blueprintId?: string;
  error?: string;
}

export interface AuditarBlueprintResult {
  ok?: true;
  relatorio?: BlueprintAuditReport;
  error?: string;
}

/**
 * Gera e persiste o Development Blueprint de UM colaborador. SEM gate — o caller
 * autoriza e passa o client. `empresaIdEsperado` revalida o tenant do colaborador.
 */
export async function gerarBlueprintCore(
  sbRaw: ReturnType<typeof createSupabaseAdmin>,
  { colaboradorId, aiConfig, empresaIdEsperado }: {
    colaboradorId: string;
    aiConfig?: AIConfig;
    empresaIdEsperado?: string;
  },
): Promise<GerarBlueprintResult> {
  if (!colaboradorId) return { error: 'colaboradorId obrigatório' };
  try {
    const { data: colab } = await sbRaw.from('colaboradores')
      .select('id, empresa_id, nome_completo, cargo, d_natural, i_natural, s_natural, c_natural, perfil_dominante, lid_executivo, lid_motivador, lid_metodico, lid_sistematico')
      .eq('id', colaboradorId).maybeSingle();
    if (!colab) return { error: 'Colaborador não encontrado' };

    if (empresaIdEsperado && colab.empresa_id !== empresaIdEsperado) {
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

/**
 * Auditoria de coerência (Fase 1, Estágio 4): roda os checks ESTRUTURAIS
 * (código, por presença nominal) + um passe SEMÂNTICO da 2ª IA (adversarial),
 * funde num relatório e PERSISTE o drift no blueprint (`auditoria`/`auditado_em`).
 *
 * ADITIVO: não muda a geração nem o consumo do blueprint — é um selo de qualidade.
 * SEM gate, mesma razão de `gerarBlueprintCore`.
 */
export async function auditarBlueprintCore(
  sbRaw: ReturnType<typeof createSupabaseAdmin>,
  { colaboradorId, aiConfig, empresaIdEsperado }: {
    colaboradorId: string;
    aiConfig?: AIConfig;
    empresaIdEsperado?: string;
  },
): Promise<AuditarBlueprintResult> {
  if (!colaboradorId) return { error: 'colaboradorId obrigatório' };
  try {
    const { data: colab } = await sbRaw.from('colaboradores')
      .select('id, empresa_id').eq('id', colaboradorId).maybeSingle();
    if (!colab) return { error: 'Colaborador não encontrado' };
    if (empresaIdEsperado && colab.empresa_id !== empresaIdEsperado) {
      return { error: 'Colaborador de outro tenant — acesso negado' };
    }
    const empresaId: string = colab.empresa_id;
    if (!empresaId) return { error: 'Colaborador sem empresa_id' };
    const tdb = tenantDb(empresaId);

    const { data: bpRow } = await tdb.from('development_blueprints')
      .select('id, blueprint')
      .eq('colaborador_id', colaboradorId)
      .order('gerado_em', { ascending: false })
      .limit(1).maybeSingle();
    if (!bpRow?.blueprint) return { error: 'Blueprint não encontrado — gere o blueprint antes de auditar.' };
    const blueprint = bpRow.blueprint as DevelopmentBlueprint;

    // 1) Estrutural (determinístico). Parâmetros = Regular DUO (mesma régua da geração).
    const cfg = PROGRAMA_REGULAR_DUO;
    const estrutural = auditEstrutural(blueprint, {
      duracaoSemanas: cfg.semanas,
      semanasMissao: cfg.semanasMissao,
      semanasAvaliacao: cfg.semanasAvaliacao,
    });

    // 2) Semântico (2ª IA, adversarial). Falha da IA não derruba a auditoria —
    //    o estrutural sozinho já é um relatório válido.
    let semantico = { checks: [] as BlueprintAuditReport['checks'], resumo: '' };
    try {
      const { system, user } = buildBlueprintAuditPrompt(blueprint);
      const resp = await callAI(system, user, aiConfig || {}, 4000);
      const parsed = await extractJSON(resp);
      if (parsed) semantico = parseAuditResponse(parsed);
    } catch (err: any) {
      console.warn('[auditarBlueprint] passe semântico falhou — relatório só com estrutural:', err?.message ?? err);
    }

    const relatorio = montarRelatorioAuditoria(estrutural, semantico, new Date().toISOString());

    const { error: saveErr } = await tdb.from('development_blueprints')
      .update({ auditoria: relatorio, auditado_em: relatorio.auditado_em })
      .eq('id', bpRow.id);
    if (saveErr) return { error: saveErr.message };

    return { ok: true, relatorio };
  } catch (err: any) {
    return { error: err.message };
  }
}

