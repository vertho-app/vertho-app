'use server';

import { tenantDb } from '@/lib/tenant-db';
import { requireAdminAction } from '@/lib/auth/action-context';
import { requireAdminSupabase } from '@/lib/admin-supabase';
import { resolverConfigDaTrilha } from '@/lib/season-engine/trilha-runtime';
import { PILOTO_SPEC_VERSION } from '@/lib/season-engine/piloto-trava';
import { PROGRESSO, TRILHA } from '@/lib/status';

/**
 * Classifica convergência de um descritor comparando nota_pre (início da temporada),
 * nota_pos (cenário sem 14) e nível_percebido (qualitativo sem 13).
 */
function classificarConvergencia({ nota_pre, nota_pos, nivel_percebido }: { nota_pre: number; nota_pos: number; nivel_percebido: number | null }) {
  const delta = nota_pos - nota_pre;
  const qualitativaPositiva = nivel_percebido != null && nivel_percebido > nota_pre;

  if (delta >= 0.5 && qualitativaPositiva) return 'evolucao_confirmada';
  if (delta >= 0.2 || qualitativaPositiva) return 'evolucao_parcial';
  if (delta < -0.2) return 'regressao';
  return 'estagnacao';
}

/**
 * Consolida semana 13 (qualitativa) + semana 14 (quantitativa) num Evolution Report.
 * Salva em trilhas.evolution_report e marca status=TRILHA.CONCLUIDA.
 *
 * Auth: `internal=true` pula o gate de admin — usado pela rota /evaluation ao
 * FINALIZAR o cenário B (a sessão é do PRÓPRIO COLAB; sem o flag o report
 * automático morria em FORBIDDEN silencioso). Mesmo padrão da acumulada.
 * Path restrito a callers no servidor.
 */
export async function gerarEvolutionReport(trilhaId: string, internal: boolean = false) {
  try {
    // Descobre tenant via trilha (raw — query inicial sem tenant conhecido).
    const { createSupabaseAdmin } = await import('@/lib/supabase');
    const sbRaw = internal ? createSupabaseAdmin() : await requireAdminSupabase('ai.audit.regenerate');
    const { data: trilha } = await sbRaw.from('trilhas')
      .select('id, colaborador_id, empresa_id, competencia_foco, competencias_foco, descritores_selecionados, programa_modo')
      .eq('id', trilhaId).maybeSingle();
    if (!trilha) return { success: false, error: 'Trilha não encontrada' };

    const tdb = tenantDb(trilha.empresa_id);

    // Semanas da qualitativa/cenário vêm da config do programa (regular/DUO =
    // 13/14; piloto = 2/3), pela FONTE ÚNICA (carimbo da trilha → sys_config).
    const programaConfig = await resolverConfigDaTrilha(sbRaw, trilha);
    const isPiloto = programaConfig.modo === 'piloto';

    const { data: prog13 } = await tdb.from('temporada_semana_progresso')
      .select('reflexao').eq('trilha_id', trilhaId).eq('semana', programaConfig.semanaAcumulada).maybeSingle();
    const { data: prog14 } = await tdb.from('temporada_semana_progresso')
      .select('feedback, status').eq('trilha_id', trilhaId).eq('semana', programaConfig.semanaCenarioB).maybeSingle();

    const qualitativa = prog13?.reflexao?.evolucao_percebida || [];
    const quantitativa = prog14?.feedback?.avaliacao_por_descritor || [];
    const descritores = Array.isArray(trilha.descritores_selecionados) ? trilha.descritores_selecionados : [];

    // GUARDS — o report é o ato que marca a trilha como TRILHA.CONCLUIDA; nunca
    // concluir sobre fechamento inexistente/incompleto (generate_report é
    // chamável a qualquer momento pela rota):
    if (prog14?.status !== PROGRESSO.CONCLUIDO) {
      return { success: false, error: `Fechamento (semana ${programaConfig.semanaCenarioB}) ainda não concluído — report não gerado.` };
    }
    if (!Array.isArray(quantitativa) || quantitativa.length === 0) {
      return { success: false, error: 'Fechamento sem avaliação por descritor (scorer não persistiu) — report não gerado.' };
    }
    if (isPiloto && prog14?.feedback?.spec_version !== PILOTO_SPEC_VERSION) {
      return { success: false, error: `Fechamento do piloto sem spec_version='${PILOTO_SPEC_VERSION}' (trava não aplicada?) — report não gerado.` };
    }
    if (isPiloto && quantitativa.length < descritores.length) {
      return { success: false, error: `Fechamento do piloto avaliou ${quantitativa.length}/${descritores.length} descritores — report não gerado.` };
    }

    // ── Piloto: relatório SEM delta/evolução ─────────────────────────────
    // 2 semanas não medem evolução. A competência entra como PONTO DE
    // PARTIDA (baseline) e o fechamento como DEMONSTRAÇÃO da avaliação.
    // nota_avaliacao já vem TRAVADA do fechamento (piso >= baseline), com
    // bruto + piso_aplicado preservados — nunca mutação silenciosa.
    if (isPiloto) {
      const consolidadoPiloto = descritores.map((d: any) => {
        const n = quantitativa.find((x: any) => x.descritor === d.descritor) || {};
        return {
          competencia: d.competencia || trilha.competencia_foco,
          descritor: d.descritor,
          baseline: n.nota_pre ?? d.nota_atual ?? null,
          nota_avaliacao: n.nota_pos ?? null,
          nota_avaliacao_bruta: n.nota_pos_bruto ?? n.nota_pos ?? null,
          piso_aplicado: !!n.piso_aplicado,
          justificativa_cenario: n.justificativa || null,
        };
      });
      const evolution_report = {
        modo: 'piloto',
        spec_version: prog14?.feedback?.spec_version || PILOTO_SPEC_VERSION,
        descritores: consolidadoPiloto,
        resumo_avaliacao: prog14?.feedback?.resumo_avaliacao || null,
        nota_media_pos: prog14?.feedback?.nota_media_pos ?? null,
        piso_aplicado: !!prog14?.feedback?.piso_aplicado,
      };
      await tdb.from('trilhas').update({
        evolution_report,
        evolution_generated_at: new Date().toISOString(),
        status: TRILHA.CONCLUIDA,
      }).eq('id', trilhaId);
      return { success: true, evolution_report };
    }

    const consolidado = descritores.map((d: any) => {
      const q = qualitativa.find((x: any) => x.descritor === d.descritor) || {};
      const n = quantitativa.find((x: any) => x.descritor === d.descritor) || {};
      const nota_pre = n.nota_pre ?? d.nota_atual ?? 1.5;
      const nota_pos = n.nota_pos ?? q.nivel_percebido ?? nota_pre;
      return {
        competencia: d.competencia || trilha.competencia_foco,
        descritor: d.descritor,
        nota_pre, nota_pos,
        nivel_percebido: q.nivel_percebido ?? null,
        antes: q.antes || null,
        depois: q.depois || null,
        justificativa_cenario: n.justificativa || null,
        convergencia: classificarConvergencia({ nota_pre, nota_pos, nivel_percebido: q.nivel_percebido }),
      };
    });

    const evolution_report = {
      descritores: consolidado,
      insight_geral: prog13?.reflexao?.insight_geral || null,
      proximo_passo: prog13?.reflexao?.proximo_passo || null,
      resumo_avaliacao: prog14?.feedback?.resumo_avaliacao || null,
      nota_media_pos: prog14?.feedback?.nota_media_pos || null,
      resumo: {
        confirmadas: consolidado.filter(c => c.convergencia === 'evolucao_confirmada').length,
        parciais: consolidado.filter(c => c.convergencia === 'evolucao_parcial').length,
        estagnacoes: consolidado.filter(c => c.convergencia === 'estagnacao').length,
        regressoes: consolidado.filter(c => c.convergencia === 'regressao').length,
      },
    };

    await tdb.from('trilhas').update({
      evolution_report,
      evolution_generated_at: new Date().toISOString(),
      status: TRILHA.CONCLUIDA,
    }).eq('id', trilhaId);

    return { success: true, evolution_report };
  } catch (err) {
    console.error('[VERTHO] gerarEvolutionReport:', err);
    return { success: false, error: err?.message };
  }
}

/**
 * Agrega Evolution Reports de todos os colabs de uma empresa.
 * Usado pelo gestor pra ver distribuição de convergências por descritor
 * e decidir próximo ciclo de treinamento.
 */
export async function loadEvolutionReportsEmpresa(empresaId: string) {
  await requireAdminAction();
  try {
    if (!empresaId) return { error: 'empresaId obrigatório' };
    const tdb = tenantDb(empresaId);
    const { data: trilhasRaw } = await tdb.from('trilhas')
      .select('id, colaborador_id, competencia_foco, evolution_report, evolution_generated_at')
      .eq('status', TRILHA.CONCLUIDA)
      .not('evolution_report', 'is', null);
    // exclui trilhas de colaboradores internos @vertho.ai da agregação
    // + relatórios de PILOTO (demonstração da avaliação, não medem evolução —
    // entrariam sem convergência e poluiriam a distribuição do gestor)
    const { data: internosEv } = await tdb.from('colaboradores').select('id').ilike('email', '%@vertho.ai');
    const internosEvSet = new Set((internosEv || []).map((c: any) => c.id));
    const trilhas = (trilhasRaw || []).filter((t: any) =>
      !internosEvSet.has(t.colaborador_id) && t.evolution_report?.modo !== 'piloto');

    const ids = (trilhas || []).map(t => t.colaborador_id);
    const { data: colabs } = await tdb.from('colaboradores')
      .select('id, nome_completo, cargo, area_depto').in('id', ids);
    const colabMap = Object.fromEntries((colabs || []).map(c => [c.id, c]));

    const trilhasComColab = (trilhas || []).map(t => ({ ...t, colab: colabMap[t.colaborador_id] || null }));

    // Agrega por competência → descritor → { confirmadas, parciais, estagnacoes, regressoes }
    const porCompetencia: Record<string, Record<string, any>> = {};
    for (const t of trilhasComColab) {
      const descs = t.evolution_report?.descritores || [];
      for (const d of descs) {
        const comp = d.competencia || t.competencia_foco || 'Sem foco';
        if (!porCompetencia[comp]) porCompetencia[comp] = {};
        if (!porCompetencia[comp][d.descritor]) {
          porCompetencia[comp][d.descritor] = {
            evolucao_confirmada: 0, evolucao_parcial: 0, estagnacao: 0, regressao: 0,
            notas_pre: [], notas_pos: [],
          };
        }
        const bucket = porCompetencia[comp][d.descritor];
        bucket[d.convergencia] = (bucket[d.convergencia] || 0) + 1;
        if (d.nota_pre != null) bucket.notas_pre.push(d.nota_pre);
        if (d.nota_pos != null) bucket.notas_pos.push(d.nota_pos);
      }
    }

    // Converte notas em médias
    for (const comp of Object.values(porCompetencia)) {
      for (const d of Object.values(comp)) {
        d.media_pre = d.notas_pre.length ? d.notas_pre.reduce((a, b) => a + b, 0) / d.notas_pre.length : null;
        d.media_pos = d.notas_pos.length ? d.notas_pos.reduce((a, b) => a + b, 0) / d.notas_pos.length : null;
        delete d.notas_pre; delete d.notas_pos;
      }
    }

    return {
      success: true,
      total: trilhasComColab.length,
      por_competencia: porCompetencia,
      trilhas: trilhasComColab,
    };
  } catch (err) {
    console.error('[VERTHO] loadEvolutionReportsEmpresa:', err);
    return { error: err?.message };
  }
}
