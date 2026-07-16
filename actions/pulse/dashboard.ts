'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { requireAdminSupabase } from '@/lib/admin-supabase';
import { tenantDb } from '@/lib/tenant-db';
import { requireUserAction } from '@/lib/auth/action-context';
import { getUserContext } from '@/lib/authz';
import { DIMENSIONS, type DimensionKey, type PulseMoment } from '@/lib/pulse/template';
import { PULSE_MIN_N, classifyScore, type GuardedAggregate } from '@/lib/pulse/anonymity';
import { isInternalEmail } from '@/lib/internal-emails';

export type GroupType = 'company' | 'area' | 'cargo';

export interface DimensionRow {
  dimension_key: DimensionKey | '_geral';
  dimension_name: string;
  t0: number | null;
  t2: number | null;
  delta: number | null;
  n_t0: number;
  n_t2: number;
}

export interface PulseDashboardData {
  ciclo: { id: string; nome: string; status: string };
  group_type: GroupType;
  group_key: string;
  n_t0: number;
  n_t2: number;
  taxa_conclusao_t0: number;   // 0-100
  taxa_conclusao_t2: number;
  indice_geral: { t0: number | null; t2: number | null; delta: number | null };
  classificacao: { band: string; label: string; color: string } | null;
  dimensions: DimensionRow[];
  dimensao_forte: DimensionRow | null;
  dimensao_critica: DimensionRow | null;
  grupos_disponiveis: { group_type: GroupType; group_key: string; n: number }[];
}

const DIM_NAME_MAP: Record<string, string> = {
  ...Object.fromEntries(DIMENSIONS.map(d => [d.key, d.name])),
  _geral: 'Índice Geral',
};

/**
 * Carrega o dashboard agregado de um ciclo de pulso.
 * - Aplica guard n>=7 em todos os recortes
 * - Registra audit log
 * - Permissão: admin, RH ou gestor (escopo da área/cargo dele)
 */
export async function loadPulseDashboard(
  empresaId: string,
  cicloId: string,
  groupType: GroupType = 'company',
  groupKey: string = 'all',
): Promise<{ ok: true; data: PulseDashboardData } | { ok: false; error: string } | { ok: 'masked'; n: number; threshold: number }> {
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
      (groupType === 'area' && !!area && groupKey === area) ||
      (groupType === 'cargo' && !!cargo && groupKey === cargo);
    if (!allowed) return { ok: false, error: 'Gestor só pode ver recortes da própria área ou cargo' };
  }

  const sb = createSupabaseAdmin();

  // Ciclo
  const { data: ciclo } = await sb.from('pulse_ciclos')
    .select('id, nome, status, empresa_id').eq('id', cicloId).single();
  if (!ciclo || (ciclo as any).empresa_id !== empresaId) {
    return { ok: false, error: 'Ciclo não encontrado' };
  }

  // Agregados da MV — todos os group_type pra esse ciclo (pra listar grupos disponíveis)
  const { data: agregados } = await sb.from('pulse_mv_aggregates')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('ciclo_id', cicloId);

  if (!agregados?.length) {
    return { ok: false, error: 'Sem dados — refresh a MV ou aguarde respostas.' };
  }

  // Filtra recorte solicitado
  const recorte = agregados.filter((a: any) =>
    a.group_type === groupType && a.group_key === groupKey,
  );

  if (!recorte.length) return { ok: false, error: 'Recorte não tem respondentes' };

  // n efetivo do recorte por momento. Cada momento é mascarado de forma
  // independente para não expor T2 pequeno só porque T0 atingiu o limiar.
  const nT0 = Math.max(...recorte.filter((r: any) => r.pulse_moment === 'T0').map((r: any) => r.respondent_count), 0);
  const nT2 = Math.max(...recorte.filter((r: any) => r.pulse_moment === 'T2').map((r: any) => r.respondent_count), 0);
  const maxN = Math.max(nT0, nT2);

  if (maxN < PULSE_MIN_N) {
    // Log do acesso bloqueado também (com motivo)
    await sb.from('pulse_audit_logs').insert({
      empresa_id: empresaId, actor_email: ctx.email,
      actor_role: ctx.isPlatformAdmin ? 'admin' : ctx.role,
      action_type: 'view_dashboard_blocked',
      ciclo_id: cicloId, group_key: `${groupType}:${groupKey}`,
      metadata_json: { n_t0: nT0, n_t2: nT2, threshold: PULSE_MIN_N },
    } as any);
    return { ok: 'masked', n: maxN, threshold: PULSE_MIN_N };
  }

  // Audit log de acesso permitido
  await sb.from('pulse_audit_logs').insert({
    empresa_id: empresaId, actor_email: ctx.email,
    actor_role: ctx.isPlatformAdmin ? 'admin' : ctx.role,
    action_type: 'view_dashboard',
    ciclo_id: cicloId, group_key: `${groupType}:${groupKey}`,
    metadata_json: { n_t0: nT0, n_t2: nT2 },
  } as any);

  // Monta linhas por dimensão (inclusive '_geral')
  const dimsOrder: (DimensionKey | '_geral')[] = ['_geral', ...DIMENSIONS.map(d => d.key)];
  const dimensions: DimensionRow[] = dimsOrder.map(dk => {
    const t0Row = recorte.find((r: any) => r.dimension_key === dk && r.pulse_moment === 'T0') as any;
    const t2Row = recorte.find((r: any) => r.dimension_key === dk && r.pulse_moment === 'T2') as any;
    const t0n = t0Row?.respondent_count || 0;
    const t2n = t2Row?.respondent_count || 0;
    const t0 = t0n >= PULSE_MIN_N && t0Row?.avg_score != null ? Number(t0Row.avg_score) : null;
    const t2 = t2n >= PULSE_MIN_N && t2Row?.avg_score != null ? Number(t2Row.avg_score) : null;
    const delta = (t0 != null && t2 != null) ? Number((t2 - t0).toFixed(2)) : null;
    return {
      dimension_key: dk,
      dimension_name: DIM_NAME_MAP[dk] || String(dk),
      t0, t2, delta,
      n_t0: t0n,
      n_t2: t2n,
    };
  });

  const geral = dimensions[0];
  const seisDims = dimensions.slice(1);

  // Dimensão mais forte/crítica (preferência: T2 > T0)
  const pick = (sort: (a: DimensionRow, b: DimensionRow) => number) => {
    const ordenadas = [...seisDims].filter(d => (d.t2 ?? d.t0) != null).sort(sort);
    return ordenadas[0] || null;
  };
  const dimensao_forte = pick((a, b) => (b.t2 ?? b.t0!) - (a.t2 ?? a.t0!));
  const dimensao_critica = pick((a, b) => (a.t2 ?? a.t0!) - (b.t2 ?? b.t0!));

  // Taxa de conclusão = completos / total de assignments do momento (no recorte company só)
  let taxa_conclusao_t0 = 0;
  let taxa_conclusao_t2 = 0;
  if (groupType === 'company') {
    // exclui contas internas @vertho.ai da taxa (consistente com a MV de agregados)
    const { data: colabs } = await sb.from('colaboradores')
      .select('id, email').eq('empresa_id', empresaId);
    const internalIds = new Set(
      (colabs || []).filter((c: any) => isInternalEmail(c.email)).map((c: any) => c.id as string),
    );
    const { data: assAll } = await sb.from('pulse_assignments')
      .select('colaborador_id, pulse_moment, status').eq('ciclo_id', cicloId);
    const ass = (assAll || []).filter((a: any) => !internalIds.has(a.colaborador_id));
    const totalT0 = ass.filter((a: any) => a.pulse_moment === 'T0').length;
    const compT0 = ass.filter((a: any) => a.pulse_moment === 'T0' && a.status === 'completed').length;
    const totalT2 = ass.filter((a: any) => a.pulse_moment === 'T2').length;
    const compT2 = ass.filter((a: any) => a.pulse_moment === 'T2' && a.status === 'completed').length;
    taxa_conclusao_t0 = totalT0 ? Math.round((compT0 / totalT0) * 100) : 0;
    taxa_conclusao_t2 = totalT2 ? Math.round((compT2 / totalT2) * 100) : 0;
  }

  // Grupos disponíveis (n efetivo >= threshold pra listar)
  // Pega max(n_t0, n_t2) por (group_type, group_key)
  const groupMap = new Map<string, { group_type: GroupType; group_key: string; n: number }>();
  for (const a of agregados) {
    if ((a as any).dimension_key !== '_geral') continue;
    const k = `${(a as any).group_type}|${(a as any).group_key}`;
    const prev = groupMap.get(k);
    const n = (a as any).respondent_count;
    if (!prev || n > prev.n) {
      groupMap.set(k, { group_type: (a as any).group_type, group_key: (a as any).group_key, n });
    }
  }
  const grupos_disponiveis = Array.from(groupMap.values())
    .filter(g => g.n >= PULSE_MIN_N)
    .sort((a, b) => a.group_type.localeCompare(b.group_type) || a.group_key.localeCompare(b.group_key));

  // Score atual = T2 se houver, senão T0
  const scoreVigente = geral.t2 ?? geral.t0;
  const classificacao = scoreVigente != null ? classifyScore(scoreVigente) : null;

  return {
    ok: true,
    data: {
      ciclo: { id: (ciclo as any).id, nome: (ciclo as any).nome, status: (ciclo as any).status },
      group_type: groupType, group_key: groupKey,
      n_t0: nT0, n_t2: nT2,
      taxa_conclusao_t0, taxa_conclusao_t2,
      indice_geral: { t0: geral.t0, t2: geral.t2, delta: geral.delta },
      classificacao,
      dimensions: seisDims,
      dimensao_forte, dimensao_critica,
      grupos_disponiveis,
    },
  };
}

/**
 * Aciona o refresh da MV de agregados. Admin only.
 */
export async function refreshPulseAggregates(): Promise<{ ok: boolean; error?: string }> {
  const sb = await requireAdminSupabase('ai.audit.regenerate');
  const { error } = await sb.rpc('refresh_pulse_aggregates');
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
