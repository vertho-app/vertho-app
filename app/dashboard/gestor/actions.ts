'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { getUserContext } from '@/lib/authz';
import { TURMA_MEMBRO } from '@/lib/status';
import { getProgramaConfigDaTrilha } from '@/lib/season-engine/programa-config';

/**
 * Home do gestor — dados consolidados em uma única chamada:
 * - 4 KPIs (liderados, em andamento, checkpoints, atividade)
 * - Alertas (checkpoints atrasados, sem perfil, estagnados)
 * - Checkpoints pendentes detalhados
 */

export type GestorKpi = {
  liderados: { total: number; em_trilha: number; sem_trilha: number };
  /**
   * ⚠️ `semana_media` SAIU (13/08/2026, mig 210). A média entre alguém na
   * semana 1 e alguém na semana 5 é 3 — que não descreve NINGUÉM, e num tenant
   * com duas safras é a regra, não a exceção. Distribuição no lugar.
   */
  em_andamento: { count: number; distribuicao_semanas: Array<{ semana: number; pessoas: number }> };
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

export type EquipeRow = {
  colabId: string;
  colab: string;
  cargo: string | null;
  status: 'em_andamento' | 'pausada' | 'concluida' | 'sem_trilha' | 'arquivada';
  competenciaFoco: string | null;
  semana: number | null; // 1..14 ou null
  delta: number | null; // só quando concluida
  perfilDominante: string | null;
  fontePerfilExterno: string | null;
  /** Turma da participação ativa (mig 210). O gestor pensa em pessoas, então a
   *  visão segue consolidada — a turma é COLUNA, não filtro obrigatório. */
  turma: string | null;
};

export type PerfilColab = {
  colabId: string;
  colab: string;
  cargo: string | null;
  fonte: 'disc' | 'opq32' | 'sem_perfil';
  /** Tem PDF original no bucket — só então o card vira clicável. */
  temPdf?: boolean;
  // DISC
  letraDom?: string | null;
  d?: number | null; i?: number | null; s?: number | null; c?: number | null;
  // OPQ32
  altas?: { codigo: string; nome: string; sten: number }[];
  baixas?: { codigo: string; nome: string; sten: number }[];
};

export type TimelineEvento = {
  data: string; // ISO
  tipo: 'checkpoint' | 'fim_trilha';
  colab: string;
  cargo: string | null;
  detalhe: string;
  trilhaId?: string;
  semana?: number;
};

export type GestorHomeData = {
  ok: boolean;
  error?: string;
  scope?: 'gestor' | 'rh' | 'tutor';
  kpis?: GestorKpi;
  alertas?: GestorAlerta[];
  checkpointsPendentes?: CheckpointPendenteDetalhado[];
  equipe?: EquipeRow[];
  perfis?: PerfilColab[];
  timeline?: TimelineEvento[];
  empresaPerfilExternoFonte?: string | null;
};

/**
 * URL assinada do PDF original do perfil externo (OPQ32/Hogan) de um liderado.
 *
 * ⚠️ `colabId` vem do CLIENTE — este arquivo é `'use server'`, então cada export
 * é um endpoint HTTP e sessão válida NÃO é autorização. O gate de POSSE abaixo
 * repete exatamente o escopo da listagem (gestor → `gestor_email`; tutor →
 * `tutorados_ids`; RH/admin → a empresa toda) para que ver e abrir tenham a
 * mesma régua. Sem ele, qualquer gestor autenticado leria o PDF de qualquer
 * pessoa da base — PII pesada (relatório psicométrico nominal).
 */
export async function getPerfilExternoPdfUrl(colabId: string): Promise<{ url?: string; error?: string }> {
  const { getAuthenticatedEmailFromAction } = await import('@/lib/auth/action-context');
  const email = await getAuthenticatedEmailFromAction();
  if (!email) return { error: 'Não autenticado' };
  const ctx = await getUserContext(email);
  if (!ctx?.colaborador) return { error: 'Não autenticado' };

  const isGestor = ctx.role === 'gestor';
  const isRH = ctx.role === 'rh' || ctx.isPlatformAdmin;
  const isTutor = ctx.role === 'tutor';
  if (!isGestor && !isRH && !isTutor) return { error: 'Acesso restrito a gestor/tutor/RH' };
  if (!colabId || typeof colabId !== 'string') return { error: 'Colaborador inválido' };

  const sb = createSupabaseAdmin();
  const empresaId = ctx.colaborador.empresa_id;

  const { data: colab, error: colabErr } = await sb.from('colaboradores')
    .select('id, gestor_email, perfil_externo_pdf_path')
    .eq('id', colabId)
    .eq('empresa_id', empresaId) // tenant: nunca cruza empresa
    .maybeSingle();
  if (colabErr) return { error: colabErr.message };
  if (!colab) return { error: 'Colaborador não encontrado' };

  // Gate de POSSE (≠ gate de sessão): o alvo tem que estar no escopo de quem pede.
  const meuEmail = ctx.colaborador.email?.toLowerCase().trim();
  const tutoradosIds: string[] = (ctx.colaborador as any)?.tutorados_ids || [];
  const noEscopo = isRH
    ? true
    : isGestor
      ? !!meuEmail && (colab.gestor_email || '').toLowerCase().trim() === meuEmail
      : tutoradosIds.includes(colabId);
  if (!noEscopo) return { error: 'Colaborador fora do seu escopo' };

  if (!colab.perfil_externo_pdf_path) return { error: 'Sem PDF carregado para este colaborador' };

  const { data, error } = await sb.storage
    .from('perfis-externos')
    .createSignedUrl(colab.perfil_externo_pdf_path, 60 * 10); // 10 min
  if (error || !data?.signedUrl) return { error: error?.message || 'Falha gerando o link do PDF' };
  return { url: data.signedUrl };
}

export async function getGestorHomeData(): Promise<GestorHomeData> {
  const { getAuthenticatedEmailFromAction } = await import('@/lib/auth/action-context');
  const email = await getAuthenticatedEmailFromAction();
  if (!email) return { ok: false, error: 'Não autenticado' };
  const ctx = await getUserContext(email);
  if (!ctx?.colaborador) return { ok: false, error: 'Não autenticado' };
  const isGestor = ctx.role === 'gestor';
  const isRH = ctx.role === 'rh' || ctx.isPlatformAdmin;
  const isTutor = ctx.role === 'tutor';
  if (!isGestor && !isRH && !isTutor) return { ok: false, error: 'Acesso restrito a gestor/tutor/RH' };

  const sb = createSupabaseAdmin();
  const empresaId = ctx.colaborador.empresa_id;
  const meuId = ctx.colaborador.id;
  const tutoradosIds: string[] = (ctx.colaborador as any)?.tutorados_ids || [];

  // Detecta se a empresa tem fonte externa de perfil (OPQ32, Hogan, etc.)
  // Quando tem, ela NÃO usa DISC — então "sem perfil" só conta quem está
  // sem perfil_externo_dados (e ignora a ausência de DISC).
  const { data: empCfg } = await sb.from('empresas')
    .select('sys_config')
    .eq('id', empresaId)
    .maybeSingle();
  const fonteExterna = (empCfg?.sys_config as any)?.perfil_externo_fonte ?? null;

  // ── 1. Liderados ──
  // Vínculo gestor→liderado é por colaboradores.gestor_email (string).
  // (NÃO existe coluna gestor_id na tabela — type em types/index.d.ts
  // está aspiracional/errado.)
  // Gestor: filtra por gestor_email ilike self.email. RH/admin: empresa toda.
  // Fail-closed: se zero match, retorna lista vazia.
  const meuEmail = ctx.colaborador.email?.toLowerCase().trim();
  let colabQ = sb.from('colaboradores')
    .select('id, nome_completo, cargo, email, area_depto, perfil_dominante, perfil_externo_dados, perfil_externo_pdf_path, foto_url, gestor_email')
    .eq('empresa_id', empresaId)
    .neq('id', meuId);
  if (isGestor && meuEmail) {
    colabQ = colabQ.ilike('gestor_email', meuEmail);
  } else if (isTutor) {
    if (tutoradosIds.length === 0) {
      // Fail-closed: tutor sem tutorados não vê ninguém.
      return {
        ok: true, scope: 'tutor',
        kpis: { liderados: { total: 0, em_trilha: 0, sem_trilha: 0 }, em_andamento: { count: 0, distribuicao_semanas: [] }, checkpoints: { pendentes: 0, respondidos: 0 }, atividade_semana: { ativos: 0, total: 0 } },
        alertas: [], checkpointsPendentes: [],
      };
    }
    colabQ = colabQ.in('id', tutoradosIds);
  }
  const { data: colabs } = await colabQ;
  // `ilike` trata `_` e `%` como curinga — e-mail com underscore (comum) faria a
  // listagem casar gestores que NÃO são o mesmo. Refina em código com igualdade
  // exata (case-insensitive): é a MESMA régua do gate de posse em
  // getPerfilExternoPdfUrl, então ver e abrir nunca divergem.
  const liderados = (colabs || []).filter((c: any) =>
    !isGestor || !meuEmail || (c.gestor_email || '').toLowerCase().trim() === meuEmail,
  );
  const liderId2obj = new Map(liderados.map((c: any) => [c.id, c]));
  const liderIds = liderados.map((c: any) => c.id);

  if (liderIds.length === 0) {
    return {
      ok: true,
      scope: isTutor ? 'tutor' : (isGestor ? 'gestor' : 'rh'),
      kpis: {
        liderados: { total: 0, em_trilha: 0, sem_trilha: 0 },
        em_andamento: { count: 0, distribuicao_semanas: [] },
        checkpoints: { pendentes: 0, respondidos: 0 },
        atividade_semana: { ativos: 0, total: 0 },
      },
      alertas: [],
      checkpointsPendentes: [],
    };
  }

  // ── 2. Trilhas mais recentes por liderado ──
  const { data: trilhas } = await sb.from('trilhas')
    // D1: `programa_modo` entra para a duração sair do literal 14. É coluna de
    // TEXTO — `temporada_plano` seria o jsonb inteiro de cada trilha do gestor.
    .select('id, colaborador_id, competencia_foco, numero_temporada, status, evolution_report, criado_em, data_inicio, programa_modo')
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

  // DISTRIBUIÇÃO por semana (mig 210) — não média. Ver o comentário no tipo.
  const porSemana = new Map<number, number>();
  for (const t of ativas) {
    if (!t.data_inicio) continue;
    const inicio = new Date(t.data_inicio).getTime();
    const dias = Math.max(1, Math.floor((Date.now() - inicio) / (24 * 3600 * 1000)));
    // D1: o teto é o do PROGRAMA da pessoa (jornada 7, onboarding 10, piloto 3),
    // não o 14 do formato regular.
    const semana = Math.min(getProgramaConfigDaTrilha(t).semanas, Math.ceil(dias / 7));
    porSemana.set(semana, (porSemana.get(semana) || 0) + 1);
  }
  const distribuicaoSemanas = [...porSemana.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([semana, pessoas]) => ({ semana, pessoas }));

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
  // Quando empresa usa fonte externa (OPQ32 etc.), DISC é ignorado:
  // 'sem perfil' = sem perfil_externo_dados (PDF não foi extraído).
  // Caso contrário, conta DISC como antes.
  const semPerfil = fonteExterna
    ? liderados.filter((c: any) => !c.perfil_externo_dados).length
    : liderados.filter((c: any) => !c.perfil_dominante && !c.perfil_externo_dados).length;
  if (semPerfil > 0) {
    const fonteLabel = fonteExterna === 'opq32' ? 'OPQ32' : fonteExterna || 'comportamental';
    alertas.push({
      tipo: 'sem_perfil',
      count: semPerfil,
      mensagem: fonteExterna
        ? `${semPerfil} liderado${semPerfil === 1 ? ' ainda não tem' : 's ainda não têm'} ${fonteLabel} carregado`
        : `${semPerfil} liderado${semPerfil === 1 ? '' : 's'} sem perfil comportamental mapeado`,
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

  // ── 7. Equipe (com trilha info por colab) ──
  const colabsTodasTrilhas = new Map<string, any[]>();
  for (const t of (trilhas || [])) {
    if (!colabsTodasTrilhas.has(t.colaborador_id)) colabsTodasTrilhas.set(t.colaborador_id, []);
    colabsTodasTrilhas.get(t.colaborador_id)!.push(t);
  }
  // Turma de cada liderado (mig 210). Duas queries pequenas: o gestor pode ter
  // gente em safras diferentes, e sem a coluna a lista mistura sem avisar.
  const turmaPorColab = new Map<string, string>();
  {
    const { data: membros } = await sb.from('turma_membros')
      .select('colaborador_id, turma_id')
      .eq('empresa_id', empresaId)
      .eq('status', TURMA_MEMBRO.ATIVO)
      .in('colaborador_id', liderIds);
    const turmaIds = [...new Set((membros || []).map((m: any) => m.turma_id))];
    if (turmaIds.length) {
      const { data: turmas } = await sb.from('turmas')
        .select('id, nome').eq('empresa_id', empresaId).in('id', turmaIds);
      const nomeDe = new Map<string, string>((turmas || []).map((t: any) => [t.id, t.nome]));
      for (const m of membros || []) {
        const nome = nomeDe.get(m.turma_id);
        if (nome) turmaPorColab.set(m.colaborador_id, nome);
      }
    }
  }

  const equipe: EquipeRow[] = liderados.map((c: any) => {
    const t = trilhaPorColab.get(c.id);
    let semana: number | null = null;
    if (t?.data_inicio && (t.status === 'ativa' || t.status === 'pausada')) {
      const dias = Math.max(1, Math.floor((Date.now() - new Date(t.data_inicio).getTime()) / (24 * 3600 * 1000)));
      semana = Math.min(getProgramaConfigDaTrilha(t).semanas, Math.ceil(dias / 7));
    }
    let delta: number | null = null;
    if (t?.status === 'concluida' && t.evolution_report) {
      const rep = t.evolution_report as any;
      const desc = rep?.descritores || [];
      const mPos = rep?.nota_media_pos != null ? Number(rep.nota_media_pos) : null;
      const mPre = desc.length ? desc.reduce((a: number, d: any) => a + (d.nota_pre || 0), 0) / desc.length : null;
      delta = (mPos != null && mPre != null) ? Number((mPos - mPre).toFixed(2)) : null;
    }
    const status: EquipeRow['status'] = !t ? 'sem_trilha'
      : t.status === 'ativa' ? 'em_andamento'
      : t.status === 'pausada' ? 'pausada'
      : t.status === 'concluida' ? 'concluida'
      : 'arquivada';
    return {
      colabId: c.id,
      colab: c.nome_completo,
      cargo: c.cargo,
      status,
      competenciaFoco: t?.competencia_foco || null,
      semana,
      delta,
      perfilDominante: c.perfil_dominante || null,
      fontePerfilExterno: c.perfil_externo_fonte || null,
      turma: turmaPorColab.get(c.id) || null,
    };
  });

  // ── 8. Perfis comportamentais (DISC ou OPQ32) ──
  const perfis: PerfilColab[] = liderados.map((c: any) => {
    // O PDF pode existir sem extração concluída (fonte 'sem_perfil' na UI) —
    // e nesse caso ele é justamente o que o gestor precisa ver.
    const temPdf = !!c.perfil_externo_pdf_path;
    if (c.perfil_externo_dados) {
      const dados = c.perfil_externo_dados as any;
      return {
        colabId: c.id,
        colab: c.nome_completo,
        cargo: c.cargo,
        fonte: 'opq32',
        temPdf,
        altas: dados?.resumo?.altas?.slice(0, 3) || [],
        baixas: dados?.resumo?.baixas?.slice(0, 3) || [],
      };
    }
    if (c.perfil_dominante) {
      return {
        colabId: c.id,
        colab: c.nome_completo,
        cargo: c.cargo,
        fonte: 'disc',
        temPdf,
        letraDom: c.perfil_dominante,
        // disc_d/i/s/c não estão no select inicial; ficam null aqui (UI handle)
      };
    }
    return {
      colabId: c.id,
      colab: c.nome_completo,
      cargo: c.cargo,
      fonte: 'sem_perfil',
      temPdf,
    };
  });

  // ── 9. Timeline próximos eventos (checkpoints futuros + fins de trilha) ──
  const timeline: TimelineEvento[] = [];
  for (const t of ativas) {
    if (!t.data_inicio) continue;
    const inicio = new Date(t.data_inicio).getTime();
    const colab: any = liderId2obj.get(t.colaborador_id);
    if (!colab) continue;
    // Checkpoints sem 5 e 10
    for (const sem of [5, 10] as const) {
      const dataCp = new Date(inicio + sem * 7 * 24 * 3600 * 1000);
      // Só inclui se ainda está no futuro próximo (próximas 4 semanas)
      const diasAte = (dataCp.getTime() - Date.now()) / (24 * 3600 * 1000);
      if (diasAte > 0 && diasAte <= 28) {
        // Também checa se já tem checkpoint respondido pra essa semana
        const jaRespondeu = checkpoints.find((cp: any) => cp.trilha_id === t.id && cp.semana === sem && cp.status !== 'pendente');
        if (jaRespondeu) continue;
        timeline.push({
          data: dataCp.toISOString(),
          tipo: 'checkpoint',
          colab: colab.nome_completo,
          cargo: colab.cargo,
          detalhe: `Checkpoint semana ${sem} · ${t.competencia_foco || 'sem competência foco'}`,
          trilhaId: t.id,
          semana: sem,
        });
      }
    }
    // Fim da trilha — na semana em que o PROGRAMA dela acaba.
    //
    // D1: com 14 cravado, o alerta de fim NUNCA disparava no fim real de uma
    // jornada de 7 semanas, e disparava ~7 semanas depois, quando já não há o
    // que fazer a respeito.
    const semanasDoPrograma = getProgramaConfigDaTrilha(t).semanas;
    const fimTrilha = new Date(inicio + semanasDoPrograma * 7 * 24 * 3600 * 1000);
    const diasFim = (fimTrilha.getTime() - Date.now()) / (24 * 3600 * 1000);
    if (diasFim > 0 && diasFim <= 28) {
      timeline.push({
        data: fimTrilha.toISOString(),
        tipo: 'fim_trilha',
        colab: colab.nome_completo,
        cargo: colab.cargo,
        detalhe: `Fim de trilha · ${t.competencia_foco || 'sem competência foco'}`,
        trilhaId: t.id,
      });
    }
  }
  timeline.sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());

  return {
    ok: true,
    scope: isGestor ? 'gestor' : 'rh',
    kpis: {
      liderados: {
        total: liderados.length,
        em_trilha: ativasIds.length,
        sem_trilha: liderados.length - ativasIds.length,
      },
      em_andamento: { count: ativasIds.length, distribuicao_semanas: distribuicaoSemanas },
      checkpoints: { pendentes: cpPendentes.length, respondidos: cpRespondidos },
      atividade_semana: { ativos: ativosSet.size, total: liderados.length },
    },
    alertas,
    checkpointsPendentes,
    equipe,
    perfis,
    timeline: timeline.slice(0, 10),
    empresaPerfilExternoFonte: fonteExterna,
  };
}
