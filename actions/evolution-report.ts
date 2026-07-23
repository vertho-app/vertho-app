'use server';

import { tenantDb } from '@/lib/tenant-db';
import { requireAdminAction } from '@/lib/auth/action-context';
import { requireAdminSupabase } from '@/lib/admin-supabase';
import { gerarEvolutionReportCore } from '@/lib/season-engine/evolution-report-core';
import { TRILHA } from '@/lib/status';

/**
 * Action ADMIN do Evolution Report (tela de auditoria sem14) — SEMPRE gatada,
 * sem flag `internal` (dívida quitada do use-server-internal-allowlist: em arquivo
 * 'use server' todo export é endpoint HTTP e a flag era escolhida pelo CLIENTE —
 * `internal: { empresaId: null }` pulava o gate de admin E o recheck de tenant).
 *
 * Os AUTO-TRIGGERS com sessão de colab (rota /api/temporada/evaluation ao finalizar
 * o cenário B) NÃO passam por aqui: importam o núcleo headless de
 * lib/season-engine/evolution-report-core.ts direto, provando o tenant via
 * `opts.empresaId` (B5). Admin gatado é cross-tenant → delega sem `empresaId`.
 */
export async function gerarEvolutionReport(trilhaId: string) {
  await requireAdminSupabase('ai.audit.regenerate');
  return gerarEvolutionReportCore(trilhaId);
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
