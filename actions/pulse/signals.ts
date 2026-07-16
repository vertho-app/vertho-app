'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { requireUserAction } from '@/lib/auth/action-context';
import {
  scoreEngagement, scoreResponseDepth, scoreRate,
  SIGNAL_DIMENSIONS, SIGNAL_LABELS, type SignalKey, type SignalScore,
} from '@/lib/pulse/signal-scoring';
import { PULSE_MIN_N } from '@/lib/pulse/anonymity';

interface ColabSnapshot {
  colaborador_id: string;
  cargo: string | null;
  area_depto: string | null;
  ia_interactions: number;
  resposta_chars: number;
  resposta_count: number;
  pulse_completed: boolean;
}

/**
 * Calcula sinais comportamentais agregados pra um ciclo.
 * Janela: [ciclo.t0_aberto_em, COALESCE(ciclo.t2_fechado_em, now())].
 *
 * Aplica n>=7 — retorna { masked: true } se o recorte for muito pequeno.
 */
export async function loadPulseSignals(
  empresaId: string,
  cicloId: string,
  filter?: { group_type: 'company' | 'area' | 'cargo'; group_key: string },
): Promise<
  | { ok: true; data: { signals: SignalScore[]; n: number; janela: { inicio: string | null; fim: string } } }
  | { ok: false; error: string }
  | { ok: 'masked'; n: number; threshold: number }
> {
  const ctx = await requireUserAction();
  const canSee = ctx.isPlatformAdmin || ctx.role === 'rh' || ctx.role === 'gestor';
  if (!canSee) return { ok: false, error: 'Sem permissão' };
  // `empresaId` vem do CLIENTE. A checagem `ciclo.empresa_id !== empresaId`
  // logo abaixo compara o pedido com o próprio pedido — prova consistência, não
  // autorização. Sem amarrar ao tenant do usuário, um RH do tenant A lê o clima
  // do tenant B inteiro. Platform admin é global por definição.
  if (!ctx.isPlatformAdmin && ctx.empresaId !== empresaId) {
    return { ok: false, error: 'Sem permissão' };
  }
  if (ctx.role === 'gestor' && !ctx.isPlatformAdmin) {
    const area = ctx.colaborador?.area_depto;
    const cargo = ctx.colaborador?.cargo;
    const allowed =
      (filter?.group_type === 'area' && !!area && filter.group_key === area) ||
      (filter?.group_type === 'cargo' && !!cargo && filter.group_key === cargo);
    if (!allowed) return { ok: false, error: 'Gestor só pode ver recortes da própria área ou cargo' };
  }

  const sb = createSupabaseAdmin();

  const { data: ciclo } = await sb.from('pulse_ciclos')
    .select('id, t0_aberto_em, t2_fechado_em, empresa_id').eq('id', cicloId).single();
  if (!ciclo || (ciclo as any).empresa_id !== empresaId) {
    return { ok: false, error: 'Ciclo não encontrado' };
  }
  const inicio: string | null = (ciclo as any).t0_aberto_em;
  const fim: string = (ciclo as any).t2_fechado_em || new Date().toISOString();

  // Colabs envolvidos (têm assignment OU completaram pulso)
  const { data: assignments } = await sb.from('pulse_assignments')
    .select('colaborador_id, pulse_moment, status').eq('ciclo_id', cicloId);
  if (!assignments?.length) return { ok: false, error: 'Sem assignments no ciclo' };

  const colabIds = [...new Set(assignments.map((a: any) => a.colaborador_id))];
  const { data: colabsRaw } = await sb.from('colaboradores')
    .select('id, cargo, area_depto').in('id', colabIds)
    .not('email', 'ilike', '%@vertho.ai'); // exclui internos das métricas de pulso

  let colabs = (colabsRaw || []) as any[];
  if (filter && filter.group_type === 'area') {
    colabs = colabs.filter(c => (c.area_depto || 'Sem área') === filter.group_key);
  } else if (filter && filter.group_type === 'cargo') {
    colabs = colabs.filter(c => (c.cargo || 'Sem cargo') === filter.group_key);
  }
  if (!colabs.length) return { ok: 'masked', n: 0, threshold: PULSE_MIN_N };

  const colabIdsFiltro = colabs.map(c => c.id);

  // Sinal 1: ia_usage_log no intervalo
  const { data: iaLog } = await sb.from('ia_usage_log')
    .select('colaborador_id')
    .in('colaborador_id', colabIdsFiltro)
    .gte('created_at', inicio || '1970-01-01')
    .lte('created_at', fim);

  // Sinal 2: respostas (r1..r4) — caracteres médios
  const { data: respostas } = await sb.from('respostas')
    .select('colaborador_id, r1, r2, r3, r4')
    .in('colaborador_id', colabIdsFiltro)
    .eq('empresa_id', empresaId);

  // Sinal 3: pulse completion (pelos assignments)
  const completedSet = new Set(
    (assignments as any[])
      .filter(a => a.status === 'completed')
      .map(a => a.colaborador_id),
  );

  const totalAssignments = (assignments as any[]).filter(a => colabIdsFiltro.includes(a.colaborador_id));
  const completosAssig = totalAssignments.filter(a => a.status === 'completed').length;

  // Snapshots por colab
  const snaps: ColabSnapshot[] = colabs.map(c => {
    const iaCount = (iaLog || []).filter((x: any) => x.colaborador_id === c.id).length;
    const respColab = (respostas || []).filter((r: any) => r.colaborador_id === c.id);
    const totalChars = respColab.reduce((acc: number, r: any) =>
      acc + (r.r1?.length || 0) + (r.r2?.length || 0) + (r.r3?.length || 0) + (r.r4?.length || 0), 0);
    return {
      colaborador_id: c.id,
      cargo: c.cargo,
      area_depto: c.area_depto,
      ia_interactions: iaCount,
      resposta_chars: totalChars,
      resposta_count: respColab.length,
      pulse_completed: completedSet.has(c.id),
    };
  });

  const n = snaps.length;
  if (n < PULSE_MIN_N) {
    return { ok: 'masked', n, threshold: PULSE_MIN_N };
  }

  // Janela em semanas (pra normalizar engagement)
  const semanas = inicio
    ? Math.max(1, Math.round((new Date(fim).getTime() - new Date(inicio).getTime()) / (7 * 24 * 3600 * 1000)))
    : 1;

  const avgEngagementPerWeek = snaps.reduce((acc, s) => acc + (s.ia_interactions / semanas), 0) / n;
  const avgDepth = snaps.reduce((acc, s) =>
    acc + (s.resposta_count > 0 ? s.resposta_chars / s.resposta_count : 0), 0) / n;
  const pctCompletionAssig = totalAssignments.length > 0
    ? (completosAssig / totalAssignments.length) * 100
    : 0;
  // Completude geral de "tarefas" — proxy: % de colabs com pelo menos 1 resposta gravada
  const pctRespostasGravadas = (snaps.filter(s => s.resposta_count > 0).length / n) * 100;

  const signals: SignalScore[] = [
    {
      signal: 'engagement_ia',
      raw: Number(avgEngagementPerWeek.toFixed(2)),
      score: scoreEngagement(avgEngagementPerWeek),
      n,
      dimensions: SIGNAL_DIMENSIONS.engagement_ia,
    },
    {
      signal: 'response_depth',
      raw: Math.round(avgDepth),
      score: scoreResponseDepth(avgDepth),
      n,
      dimensions: SIGNAL_DIMENSIONS.response_depth,
    },
    {
      signal: 'completion_rate',
      raw: Math.round(pctRespostasGravadas),
      score: scoreRate(pctRespostasGravadas),
      n,
      dimensions: SIGNAL_DIMENSIONS.completion_rate,
    },
    {
      signal: 'pulse_completion',
      raw: Math.round(pctCompletionAssig),
      score: scoreRate(pctCompletionAssig),
      n,
      dimensions: SIGNAL_DIMENSIONS.pulse_completion,
    },
  ];

  return { ok: true, data: { signals, n, janela: { inicio, fim } } };
}
