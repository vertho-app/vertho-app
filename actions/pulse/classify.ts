'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { requireAdminSupabase } from '@/lib/admin-supabase';
import { requireUserAction } from '@/lib/auth/action-context';
import {
  classifyOpenText, auditClassification, resolveFinalConfidence,
  applyAuditCorrections,
} from '@/lib/pulse/dual-ai';
import { findTheme, THEMES } from '@/lib/pulse/themes-taxonomy';
import { PULSE_MIN_N } from '@/lib/pulse/anonymity';
import { getModelForTask } from '@/lib/ai-tasks';

/**
 * Processa em lote as respostas abertas do ciclo que ainda não foram
 * classificadas. Idempotente (UK em response_id).
 *
 * Cap pra controlar custo: maxRespostas por chamada (default 50).
 * Admin-only.
 */
export async function classificarRespostasAbertas(
  empresaId: string,
  cicloId: string,
  opts?: { maxRespostas?: number; pulando?: boolean },
): Promise<{ ok: true; processadas: number; erros: number; ja_classificadas: number } | { ok: false; error: string }> {
  const sb = await requireAdminSupabase('ai.audit.regenerate');
  const cap = opts?.maxRespostas || 50;

  const { data: ciclo } = await sb.from('pulse_ciclos')
    .select('id, empresa_id').eq('id', cicloId).single();
  if (!ciclo || (ciclo as any).empresa_id !== empresaId) {
    return { ok: false, error: 'Ciclo não encontrado' };
  }

  // Carrega respostas abertas do ciclo
  const { data: respostas } = await sb.from('pulse_responses')
    .select('id, ciclo_id, pulse_moment, text_answer')
    .eq('ciclo_id', cicloId)
    .not('text_answer', 'is', null);

  if (!respostas?.length) return { ok: true, processadas: 0, erros: 0, ja_classificadas: 0 };

  // Filtra textos não-triviais
  const candidatas = (respostas as any[]).filter(r => (r.text_answer || '').trim().length >= 10);

  // Filtra as que ainda não têm classificação
  const { data: classificadas } = await sb.from('pulse_classifications')
    .select('response_id').eq('ciclo_id', cicloId);
  const jaIds = new Set((classificadas || []).map((c: any) => c.response_id));
  const pendentes = candidatas.filter(r => !jaIds.has(r.id)).slice(0, cap);

  const classifierModel = await getModelForTask(empresaId, 'pulse_classify');
  const auditorModel = await getModelForTask(empresaId, 'pulse_audit')
    || (classifierModel.startsWith('claude') ? 'gemini-3-flash-preview' : 'claude-sonnet-4-6');

  let processadas = 0, erros = 0;
  for (const r of pendentes) {
    try {
      // 1. Classifica
      const c = await classifyOpenText(r.text_answer, classifierModel);

      // 2. Audita (best-effort — se falhar, mantém só classifier)
      let a;
      try {
        a = await auditClassification(r.text_answer, c, auditorModel);
      } catch (e: any) {
        a = {
          agrees: true, divergences: [], confidence_adjusted: c.confidence,
          notes: `falha auditor: ${e.message || e}`, raw: '',
        };
      }

      const finalThemes = applyAuditCorrections(c, a);
      const finalConfidence = resolveFinalConfidence(c, a);

      // 3. Salva (NÃO armazena text_answer aqui — fica em pulse_responses)
      await sb.from('pulse_classifications').upsert({
        empresa_id: empresaId,
        ciclo_id: cicloId,
        response_id: r.id,
        pulse_moment: r.pulse_moment,
        classifier_model: classifierModel,
        classifier_themes: finalThemes,
        classifier_sentiment: c.sentiment,
        classifier_evidence: c.evidence,
        classifier_confidence: c.confidence,
        classifier_raw_response: c.raw.slice(0, 4000),
        classifier_called_at: new Date().toISOString(),
        auditor_model: auditorModel,
        auditor_agrees: a.agrees,
        auditor_divergences: a.divergences,
        auditor_confidence_adjusted: a.confidence_adjusted,
        auditor_notes: a.notes,
        auditor_called_at: new Date().toISOString(),
        final_confidence: finalConfidence,
        updated_at: new Date().toISOString(),
      } as any, { onConflict: 'response_id' });

      processadas++;
    } catch (e: any) {
      erros++;
      console.error(`[classificarRespostasAbertas] resposta ${r.id}: ${e.message || e}`);
    }
  }

  return { ok: true, processadas, erros, ja_classificadas: jaIds.size };
}

// ─── Leitura agregada de temas pro dashboard ─────────────────────────────

export interface ThemeAggregate {
  theme_key: string;
  theme_label: string;
  polarity: 'positive' | 'negative' | 'neutral';
  count: number;
  pct: number;             // % dos respondentes que mencionaram esse tema
  dimensions: string[];
}

export async function obterTemasCiclo(
  empresaId: string,
  cicloId: string,
  filter?: { group_type: 'company' | 'area' | 'cargo'; group_key: string; pulse_moment?: 'T0' | 'T2' },
): Promise<
  | { ok: true; data: { themes: ThemeAggregate[]; total_respostas: number; confidence_summary: { high: number; medium: number; low: number } } }
  | { ok: false; error: string }
  | { ok: 'masked'; n: number; threshold: number }
> {
  const ctx = await requireUserAction();
  const canSee = ctx.isPlatformAdmin || ctx.role === 'rh' || ctx.role === 'gestor';
  if (!canSee) return { ok: false, error: 'Sem permissão' };
  if (ctx.role === 'gestor' && !ctx.isPlatformAdmin) {
    const area = ctx.colaborador?.area_depto;
    const cargo = ctx.colaborador?.cargo;
    const allowed =
      (filter?.group_type === 'area' && !!area && filter.group_key === area) ||
      (filter?.group_type === 'cargo' && !!cargo && filter.group_key === cargo);
    if (!allowed) return { ok: false, error: 'Gestor só pode ver recortes da própria área ou cargo' };
  }

  const sb = createSupabaseAdmin();

  // Join classifications × responses × colaboradores pra filtrar por grupo
  let q = sb.from('pulse_classifications')
    .select('id, response_id, pulse_moment, classifier_themes, classifier_sentiment, final_confidence, pulse_responses!inner(colaborador_id, colaboradores!inner(cargo, area_depto))')
    .eq('ciclo_id', cicloId)
    .eq('empresa_id', empresaId);

  if (filter?.pulse_moment) q = q.eq('pulse_moment', filter.pulse_moment);

  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: true, data: { themes: [], total_respostas: 0, confidence_summary: { high: 0, medium: 0, low: 0 } } };

  // Filtra por grupo se necessário
  let registros = data as any[];
  if (filter?.group_type === 'area') {
    registros = registros.filter(r => (r.pulse_responses?.colaboradores?.area_depto || 'Sem área') === filter.group_key);
  } else if (filter?.group_type === 'cargo') {
    registros = registros.filter(r => (r.pulse_responses?.colaboradores?.cargo || 'Sem cargo') === filter.group_key);
  }

  if (registros.length === 0) return { ok: 'masked', n: 0, threshold: PULSE_MIN_N };
  if (registros.length < PULSE_MIN_N) {
    return { ok: 'masked', n: registros.length, threshold: PULSE_MIN_N };
  }

  // Considera apenas classificações com confidence >= medium (regra da spec)
  const confiaveis = registros.filter(r => r.final_confidence !== 'low');

  // Conta temas
  const counter = new Map<string, number>();
  for (const r of confiaveis) {
    const themes = Array.isArray(r.classifier_themes) ? r.classifier_themes : [];
    for (const t of themes) {
      counter.set(t, (counter.get(t) || 0) + 1);
    }
  }

  const total = registros.length;
  const themes: ThemeAggregate[] = THEMES
    .filter(t => counter.has(t.key))
    .map(t => ({
      theme_key: t.key,
      theme_label: t.label,
      polarity: t.polarity,
      count: counter.get(t.key) || 0,
      pct: total > 0 ? Math.round(((counter.get(t.key) || 0) / total) * 100) : 0,
      dimensions: t.dimensions.map(d => d),
    }))
    .sort((a, b) => b.count - a.count);

  const confidence_summary = {
    high: registros.filter(r => r.final_confidence === 'high').length,
    medium: registros.filter(r => r.final_confidence === 'medium').length,
    low: registros.filter(r => r.final_confidence === 'low').length,
  };

  return { ok: true, data: { themes, total_respostas: total, confidence_summary } };
}
