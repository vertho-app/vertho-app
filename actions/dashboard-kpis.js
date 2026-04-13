'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { findColabByEmail } from '@/lib/authz';

const TOTAL_SEMANAS_TRILHA = 14;

/**
 * Carrega os 4 KPIs da home do colaborador:
 * 1. Fit ao cargo  (fit_resultados.fit_final)
 * 2. Gaps prioritários (top_gaps.length do mesmo registro)
 * 3. Trilha — semana atual (fase4_progresso.semana_atual)
 * 4. Pontos de evidência (SUM(capacitacao.pontos))
 *
 * Cada KPI retorna `null` quando ainda não há dados — a UI mostra estado vazio.
 */
export async function loadHomeKpis(email) {
  try {
    if (!email) return { error: 'Não autenticado' };

    const colab = await findColabByEmail(email, 'id, empresa_id, cargo');
    if (!colab) return { error: 'Colaborador não encontrado' };

    const sb = createSupabaseAdmin();

    // ── 1. Fit ao cargo + 2. Gaps (vêm do mesmo registro) ─────────────────
    const { data: fit } = await sb.from('fit_resultados')
      .select('fit_final, classificacao, resultado_json')
      .eq('empresa_id', colab.empresa_id)
      .eq('colaborador_id', colab.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let gapsTop = null;
    if (fit?.resultado_json) {
      const json = typeof fit.resultado_json === 'string'
        ? (() => { try { return JSON.parse(fit.resultado_json); } catch { return null; } })()
        : fit.resultado_json;
      gapsTop = json?.gap_analysis?.top_gaps?.length ?? 0;
    }

    // ── 3. Trilha — semana atual ──────────────────────────────────────────
    const { data: progresso } = await sb.from('fase4_progresso')
      .select('semana_atual, status')
      .eq('colaborador_id', colab.id)
      .eq('empresa_id', colab.empresa_id)
      .maybeSingle();

    // ── 4. Pontos de evidência ────────────────────────────────────────────
    const { data: pontosRows } = await sb.from('capacitacao')
      .select('pontos')
      .eq('colaborador_id', colab.id)
      .eq('empresa_id', colab.empresa_id);
    const pontos = (pontosRows || []).reduce(
      (acc, r) => acc + (Number(r.pontos) || 0),
      0
    );

    return {
      fit: fit ? {
        score: Number(fit.fit_final),
        classificacao: fit.classificacao || null,
      } : null,
      gaps: fit ? (gapsTop ?? 0) : null,
      trilha: progresso ? {
        semana: progresso.semana_atual || 0,
        total: TOTAL_SEMANAS_TRILHA,
      } : null,
      pontos,
      cargoNome: colab.cargo || null,
    };
  } catch (err) {
    console.error('[loadHomeKpis]', err);
    return { error: err?.message || 'Erro ao carregar KPIs' };
  }
}
