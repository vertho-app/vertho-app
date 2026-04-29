'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { getUserContext } from '@/lib/authz';

/**
 * Home do gestor — dados consolidados em uma única chamada:
 * - 4 KPIs (liderados, em andamento, checkpoints, atividade)
 * - Alertas (checkpoints atrasados, sem perfil, estagnados)
 * - Checkpoints pendentes detalhados
 */

export type GestorKpi = {
  liderados: { total: number; em_trilha: number; sem_trilha: number };
  em_andamento: { count: number; semana_media: number | null };
  checkpoints: { pendentes: number; respondidos: number };
  atividade_semana: { ativos: number; total: number };
};

export type GestorAlerta = {
  tipo: 'checkpoint_atrasado' | 'sem_perfil' | 'estagnado';
  count: number;
  mensagem: string;
};

export type CheckpointPendenteDetalhado = {
  trilhaId: string;
  colabId: string;
  colab: string;
  cargo: string | null;
  competenciaFoco: string | null;
  semana: 5 | 10;
  diasPendente: number;
  fonteDISC?: string | null;
};

export type GestorHomeData = {
  ok: boolean;
  error?: string;
  scope?: 'gestor' | 'rh';
  kpis?: GestorKpi;
  alertas?: GestorAlerta[];
  checkpointsPendentes?: CheckpointPendenteDetalhado[];
};

export async function getGestorHomeData(): Promise<GestorHomeData> {
  const { getAuthenticatedEmailFromAction } = await import('@/lib/auth/action-context');
  const email = await getAuthenticatedEmailFromAction();
  if (!email) return { ok: false, error: 'Não autenticado' };
  const ctx = await getUserContext(email);
  if (!ctx?.colaborador) return { ok: false, error: 'Não autenticado' };
  const isGestor = ctx.role === 'gestor';
  const isRH = ctx.role === 'rh' || ctx.isPlatformAdmin;
  if (!isGestor && !isRH) return { ok: false, error: 'Acesso restrito a gestor/RH' };

  const sb = createSupabaseAdmin();
  const empresaId = ctx.colaborador.empresa_id;
  const meuId = ctx.colaborador.id;

  // ── 1. Liderados ──
  let colabQ = sb.from('colaboradores')
    .select('id, nome_completo, cargo, email, area_depto, perfil_dominante, perfil_externo_dados, foto_url')
    .eq('empresa_id', empresaId)
    .neq('id', meuId); // gestor não aparece como liderado de si mesmo
  if (isGestor && ctx.colaborador.area_depto) {
    colabQ = colabQ.eq('area_depto', ctx.colaborador.area_depto);
  }
  const { data: colabs } = await colabQ;
  const liderados = colabs || [];
  const liderId2obj = new Map(liderados.map((c: any) => [c.id, c]));
  const liderIds = liderados.map((c: any) => c.id);

  if (liderIds.length === 0) {
    return {
      ok: true,
      scope: isGestor ? 'gestor' : 'rh',
      kpis: {
        liderados: { total: 0, em_trilha: 0, sem_trilha: 0 },
        em_andamento: { count: 0, semana_media: null },
        checkpoints: { pendentes: 0, respondidos: 0 },
        atividade_semana: { ativos: 0, total: 0 },
      },
      alertas: [],
      checkpointsPendentes: [],
    };
  }

  // ── 2. Trilhas mais recentes por liderado ──
  const { data: trilhas } = await sb.from('trilhas')
    .select('id, colaborador_id, competencia_foco, numero_temporada, status, evolution_report, criado_em, data_inicio')
    .in('colaborador_id', liderIds)
    .order('criado_em', { ascending: false });
  const trilhaPorColab = new Map<string, any>();
  for (const t of (trilhas || [])) {
    if (!trilhaPorColab.has(t.colaborador_id)) trilhaPorColab.set(t.colaborador_id, t);
  }

  const ativasIds: string[] = [];
  const ativas: any[] = [];
  for (const c of liderados) {
    const t = trilhaPorColab.get(c.id);
    if (t && (t.status === 'ativa' || t.status === 'pausada')) {
      ativasIds.push(t.id);
      ativas.push(t);
    }
  }

  // Semana média (proxy: dias desde data_inicio dividido por 7, capado em 14)
  const semanas: number[] = [];
  for (const t of ativas) {
    if (!t.data_inicio) continue;
    const inicio = new Date(t.data_inicio).getTime();
    const dias = Math.max(1, Math.floor((Date.now() - inicio) / (24 * 3600 * 1000)));
    semanas.push(Math.min(14, Math.ceil(dias / 7)));
  }
  const semanaMedia = semanas.length ? Math.round((semanas.reduce((a, b) => a + b, 0) / semanas.length) * 10) / 10 : null;

  // ── 3. Checkpoints (pendentes + respondidos) ──
  const { data: cps } = await sb.from('checkpoints_gestor')
    .select('id, trilha_id, semana, status, avaliacao_gestor, criado_em, atualizado_em')
    .in('trilha_id', ativas.map(t => t.id));
  const checkpoints = cps || [];
  const cpPendentes = checkpoints.filter((cp: any) => cp.status === 'pendente');
  const cpRespondidos = checkpoints.filter((cp: any) => cp.status !== 'pendente').length;

  // ── 4. Atividade nos últimos 7 dias ──
  const seteDiasAtras = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  // União de várias fontes — colaborador é "ativo" se aparece em qualquer
  const ativosSet = new Set<string>();

  // Respostas
  const { data: resp } = await sb.from('respostas')
    .select('colaborador_id')
    .in('colaborador_id', liderIds)
    .gte('created_at', seteDiasAtras);
  for (const r of (resp || [])) ativosSet.add(r.colaborador_id);

  // Reavaliação
  const { data: reav } = await sb.from('reavaliacao_sessoes')
    .select('colaborador_id')
    .in('colaborador_id', liderIds)
    .gte('criado_em', seteDiasAtras);
  for (const r of (reav || [])) ativosSet.add(r.colaborador_id);

  // Acessos a conteúdo (fase4_progresso.ultimo_acesso)
  try {
    const { data: cont } = await sb.from('fase4_progresso')
      .select('colaborador_id, ultimo_acesso')
      .in('colaborador_id', liderIds)
      .gte('ultimo_acesso', seteDiasAtras);
    for (const r of (cont || [])) ativosSet.add(r.colaborador_id);
  } catch { /* tabela pode não existir em ambientes legacy */ }

  // ── 5. Alertas ──
  const alertas: GestorAlerta[] = [];
  const cpAtrasados = cpPendentes.filter((cp: any) => {
    const dias = (Date.now() - new Date(cp.criado_em).getTime()) / (24 * 3600 * 1000);
    return dias > 7;
  });
  if (cpAtrasados.length > 0) {
    alertas.push({
      tipo: 'checkpoint_atrasado',
      count: cpAtrasados.length,
      mensagem: `${cpAtrasados.length} checkpoint${cpAtrasados.length === 1 ? '' : 's'} pendente${cpAtrasados.length === 1 ? '' : 's'} há mais de 7 dias`,
    });
  }
  const semPerfil = liderados.filter((c: any) => !c.perfil_dominante && !c.perfil_externo_dados).length;
  if (semPerfil > 0) {
    alertas.push({
      tipo: 'sem_perfil',
      count: semPerfil,
      mensagem: `${semPerfil} liderado${semPerfil === 1 ? '' : 's'} sem perfil comportamental mapeado`,
    });
  }
  // Estagnado: trilha ativa criada há >21 dias mas sem evolution_report e sem checkpoint respondido
  const estagnados = ativas.filter((t: any) => {
    if (t.evolution_report) return false;
    const dias = (Date.now() - new Date(t.criado_em).getTime()) / (24 * 3600 * 1000);
    if (dias < 21) return false;
    const tcps = checkpoints.filter((cp: any) => cp.trilha_id === t.id && cp.status !== 'pendente');
    return tcps.length === 0;
  });
  if (estagnados.length > 0) {
    alertas.push({
      tipo: 'estagnado',
      count: estagnados.length,
      mensagem: `${estagnados.length} liderado${estagnados.length === 1 ? '' : 's'} estagnado${estagnados.length === 1 ? '' : 's'} há 3+ semanas (sem checkpoint respondido)`,
    });
  }

  // ── 6. Checkpoints pendentes detalhados ──
  const checkpointsPendentes: CheckpointPendenteDetalhado[] = cpPendentes.map((cp: any) => {
    const trilha = ativas.find((t: any) => t.id === cp.trilha_id);
    const colab: any = trilha ? liderId2obj.get(trilha.colaborador_id) : null;
    const dias = Math.max(0, Math.floor((Date.now() - new Date(cp.criado_em).getTime()) / (24 * 3600 * 1000)));
    return {
      trilhaId: cp.trilha_id,
      colabId: trilha?.colaborador_id || '',
      colab: colab?.nome_completo || '—',
      cargo: colab?.cargo || null,
      competenciaFoco: trilha?.competencia_foco || null,
      semana: cp.semana,
      diasPendente: dias,
    };
  })
  // Ordena: atrasados primeiro, mais antigos depois
  .sort((a, b) => b.diasPendente - a.diasPendente);

  return {
    ok: true,
    scope: isGestor ? 'gestor' : 'rh',
    kpis: {
      liderados: {
        total: liderados.length,
        em_trilha: ativasIds.length,
        sem_trilha: liderados.length - ativasIds.length,
      },
      em_andamento: { count: ativasIds.length, semana_media: semanaMedia },
      checkpoints: { pendentes: cpPendentes.length, respondidos: cpRespondidos },
      atividade_semana: { ativos: ativosSet.size, total: liderados.length },
    },
    alertas,
    checkpointsPendentes,
  };
}
