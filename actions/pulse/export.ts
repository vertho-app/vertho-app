'use server';

import { requireAdminSupabase } from '@/lib/admin-supabase';
import { loadPulseDashboard, type GroupType } from './dashboard';
import { loadPulseSignals } from './signals';
import { obterTemasCiclo } from './classify';
import { triangulate } from '@/lib/pulse/triangulation';
import { SIGNAL_LABELS } from '@/lib/pulse/signal-scoring';
import { getAuthenticatedEmailFromAction } from '@/lib/auth/action-context';

export type PulseReportKind = 'pulso_executivo' | 'pulso_complementar_nr1';

const KIND_LABEL: Record<PulseReportKind, string> = {
  pulso_executivo: 'Relatório Executivo',
  pulso_complementar_nr1: 'Subsídios Complementares NR-1',
};

/**
 * Gera o conteúdo consolidado do relatório e cria/atualiza um registro em
 * `relatorios` com tipo='pulso_executivo' ou 'pulso_complementar_nr1'.
 *
 * O PDF em si é renderizado on-demand pelo endpoint /api/relatorios/pdf?id=X
 * (mesmo padrão dos relatórios existentes).
 *
 * Idempotente — UK (empresa_id, colaborador_id, tipo). Como colaborador_id
 * é NULL pra agregados, é necessário trickar: usamos um colaborador_id
 * sintético = `ciclo_id` (precisa que não exista em colaboradores, e há
 * FK pra colaboradores ON DELETE CASCADE — não dá). Solução: deletamos
 * o antigo e inserimos novo. Audit log fica em pulse_audit_logs.
 */
export async function exportarRelatorioPulso(
  empresaId: string,
  cicloId: string,
  kind: PulseReportKind,
  opts?: { group_type?: GroupType; group_key?: string },
): Promise<{ ok: true; relatorio_id: string } | { ok: false; error: string }> {
  const sb = await requireAdminSupabase('ai.audit.regenerate');
  const actorEmail = (await getAuthenticatedEmailFromAction()) || 'desconhecido';

  const groupType: GroupType = opts?.group_type || 'company';
  const groupKey: string = opts?.group_key || 'all';

  // Carrega dashboard, sinais e temas
  const dash = await loadPulseDashboard(empresaId, cicloId, groupType, groupKey);
  if (dash.ok === false) return { ok: false, error: dash.error };
  if (dash.ok === 'masked') return { ok: false, error: 'Recorte sem dados suficientes (n<7)' };

  const sigRes = await loadPulseSignals(empresaId, cicloId, { group_type: groupType, group_key: groupKey });
  const themesRes = await obterTemasCiclo(empresaId, cicloId, { group_type: groupType, group_key: groupKey });

  const signals = sigRes.ok === true
    ? sigRes.data.signals.map(s => ({ label: SIGNAL_LABELS[s.signal], score: s.score, raw: s.raw }))
    : [];

  const themes = themesRes.ok === true
    ? themesRes.data.themes.map(t => ({
        theme_label: t.theme_label, polarity: t.polarity, count: t.count, pct: t.pct,
      }))
    : [];

  const tri = triangulate(
    dash.data.dimensions,
    sigRes.ok === true ? sigRes.data.signals : [],
    { n_t0: dash.data.n_t0, n_t2: dash.data.n_t2 },
  );

  // Empresa info
  const { data: empresa } = await sb.from('empresas').select('nome').eq('id', empresaId).single();

  const groupLabel = groupType === 'company'
    ? 'Empresa toda'
    : `${groupType === 'area' ? 'Área' : 'Cargo'}: ${groupKey}`;

  const conteudo = {
    empresa: { nome: (empresa as any)?.nome || '' },
    ciclo: { nome: dash.data.ciclo.nome },
    group_label: groupLabel,
    generated_at: new Date().toISOString(),
    n_t0: dash.data.n_t0,
    n_t2: dash.data.n_t2,
    indice_geral: dash.data.indice_geral,
    classificacao: dash.data.classificacao,
    dimensions: dash.data.dimensions.map(d => ({
      dimension_name: d.dimension_name, t0: d.t0, t2: d.t2, delta: d.delta,
    })),
    signals,
    themes,
    triangulation: tri,
    kind,
    kind_label: KIND_LABEL[kind],
  };

  // Salva no `pulse_triangulations` (cache) também
  await sb.from('pulse_triangulations').upsert({
    empresa_id: empresaId, ciclo_id: cicloId,
    group_type: groupType, group_key: groupKey,
    respondent_count: Math.max(dash.data.n_t0, dash.data.n_t2),
    summary: tri.summary,
    accelerators_json: tri.accelerators,
    blockers_json: tri.blockers,
    alerts_json: tri.alerts,
    recommendations_json: tri.recommendations,
    divergences_json: tri.divergences,
    themes_json: themes,
    confidence_level: tri.confidence_level,
    updated_at: new Date().toISOString(),
  } as any, { onConflict: 'ciclo_id,group_type,group_key' });

  // Cria um novo registro em `relatorios`, preservando histórico por ciclo/recorte.
  const { data: rel, error } = await sb.from('relatorios')
    .insert({
      empresa_id: empresaId,
      colaborador_id: null,
      tipo: kind,
      conteudo,
      gerado_em: new Date().toISOString(),
    } as any)
    .select('id').single();

  if (error) return { ok: false, error: error.message };

  // Audit log
  await sb.from('pulse_audit_logs').insert({
    empresa_id: empresaId,
    actor_email: actorEmail,
    actor_role: 'admin',
    action_type: kind === 'pulso_executivo' ? 'export_executive_pdf' : 'export_nr1_complementary',
    ciclo_id: cicloId,
    group_key: `${groupType}:${groupKey}`,
    metadata_json: { relatorio_id: (rel as any).id },
  } as any);

  return { ok: true, relatorio_id: (rel as any).id };
}
