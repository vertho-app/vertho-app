'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { getUserContext } from '@/lib/authz';
import { PROGRESSO, TRILHA, TURMA_MEMBRO } from '@/lib/status';
import { getProgramaConfigDaTrilha } from '@/lib/season-engine/programa-config';
import { estaAtrasada, semanasDeAtraso } from '@/lib/season-engine/atraso';
import { colaboradoresComMapeamentoCompleto } from '@/lib/mapeamento-competencias';
import {
  normalizeManagerReportInsight,
  type ManagerReportInsight,
} from '@/lib/relatorios/dashboard-insights';

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
  tipo: 'checkpoint_atrasado' | 'sem_perfil' | 'sem_mapeamento' | 'estagnado';
  count: number;
  mensagem: string;
};

export type CheckpointPendenteDetalhado = {
  trilhaId: string;
  colabId: string;
  colab: string;
  cargo: string | null;
  competenciaFoco: string | null;
  /** Semana de checkpoint do PROGRAMA da trilha (jornada 3 e 5, DUO 5 e 10). */
  semana: number;
  diasPendente: number;
  /** Quantas semanas o calendário passou da pessoa; `null` = sem como dizer. */
  semanasAtraso: number | null;
  fonteDISC?: string | null;
};

export type EquipeRow = {
  colabId: string;
  colab: string;
  cargo: string | null;
  status: 'em_andamento' | 'pausada' | 'concluida' | 'sem_trilha' | 'arquivada';
  competenciaFoco: string | null;
  semana: number | null; // 1..N do PROGRAMA dela (jornada 7, onboarding 10…) ou null
  /** Duração do programa DESTA pessoa — o teto da barra de progresso (D1). */
  totalSemanas: number | null;
  delta: number | null; // só quando concluida
  perfilDominante: string | null;
  fontePerfilExterno: string | null;
  /** Turma da participação ativa (mig 210). O gestor pensa em pessoas, então a
   *  visão segue consolidada — a turma é COLUNA, não filtro obrigatório. */
  turma: string | null;
  /**
   * Por que está SEM TRILHA — só preenchido quando `status === 'sem_trilha'`.
   *
   *  · `sem_perfil`        — falta o mapeamento comportamental (ou o PDF da
   *                          fonte externa). É o primeiro portão: sem ele a
   *                          pessoa nem alcança o mapeamento.
   *  · `sem_mapeamento`    — tem perfil, falta a rodada de mapeamento de
   *                          competências (`descriptor_assessments`), que é o
   *                          que o gerador de temporada exige.
   *  · `aguardando_geracao`— fez as duas partes; a trilha é que não foi gerada.
   *                          A pendência é NOSSA, não dela.
   *  · `null`              — não dá para afirmar (consulta indisponível).
   */
  motivoSemTrilha: 'sem_perfil' | 'sem_mapeamento' | 'aguardando_geracao' | null;
  /**
   * Trilha ATIVA cujo calendário já passou da pessoa. `null` = não se aplica
   * (sem trilha ativa) ou não dá para dizer (trilha sem data de início).
   */
  atrasada: boolean | null;
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

export type GestorHomeData = {
  ok: boolean;
  error?: string;
  scope?: 'gestor' | 'rh' | 'tutor';
  kpis?: GestorKpi;
  alertas?: GestorAlerta[];
  checkpointsPendentes?: CheckpointPendenteDetalhado[];
  equipe?: EquipeRow[];
  perfis?: PerfilColab[];
  empresaPerfilExternoFonte?: string | null;
  reportDashboard?: {
    id: string;
    generatedAt: string | null;
    pdfUrl: string;
    insight: ManagerReportInsight;
  } | null;
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

/** Colunas que a home do gestor pede de cada liderado. */
const COLS_LIDERADO = 'id, nome_completo, cargo, email, area_depto, perfil_dominante, d_natural, i_natural, s_natural, c_natural, perfil_externo_dados, perfil_externo_pdf_path, foto_url, gestor_email, role';

/**
 * QUEM cada papel enxerga — a régua de escopo, em um lugar só.
 *
 * Gestor: liderados por `colaboradores.gestor_email` (NÃO existe gestor_id; o
 * type em types/index.d.ts está aspiracional). Tutor: `tutorados_ids`. RH/admin:
 * a empresa toda. Fail-closed em todos: sem match, lista vazia.
 *
 * Existe como função porque a home do gestor e a tela de engajamento do time
 * precisam do MESMO recorte. Duas cópias desta regra divergiriam calado — e o
 * modo de falhar é o pior possível: um gestor vendo gente que não é dele.
 */
export async function resolverEscopoDoGestor(
  sb: any,
  { empresaId, meuId, meuEmail, isGestor, isTutor, tutoradosIds }: {
    empresaId: string; meuId: string; meuEmail?: string | null;
    isGestor: boolean; isTutor: boolean; tutoradosIds: string[];
  },
): Promise<{ liderados: any[]; liderIds: string[] }> {
  const emailNormalizado = meuEmail?.toLowerCase().trim();
  let colabQ = sb.from('colaboradores')
    .select(COLS_LIDERADO)
    .eq('empresa_id', empresaId)
    .neq('id', meuId);
  if (isGestor && emailNormalizado) {
    colabQ = colabQ.ilike('gestor_email', emailNormalizado);
  } else if (isTutor) {
    // Fail-closed: tutor sem tutorados não vê ninguém.
    if (tutoradosIds.length === 0) return { liderados: [], liderIds: [] };
    colabQ = colabQ.in('id', tutoradosIds);
  }
  const { data: colabs, error } = await colabQ;
  if (error) {
    console.error('[gestor] escopo indisponível:', error.message);
    return { liderados: [], liderIds: [] };
  }
  // `ilike` trata `_` e `%` como curinga — e-mail com underscore (comum) faria a
  // listagem casar gestores que NÃO são o mesmo. Refina em código com igualdade
  // exata (case-insensitive): é a MESMA régua do gate de posse em
  // getPerfilExternoPdfUrl, então ver e abrir nunca divergem.
  const liderados = (colabs || []).filter((c: any) =>
    c.role !== 'rh' && (!isGestor || !emailNormalizado || (c.gestor_email || '').toLowerCase().trim() === emailNormalizado),
  );
  return { liderados, liderIds: liderados.map((c: any) => c.id) };
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
  const { data: empCfg, error: empCfgError } = await sb.from('empresas')
    .select('sys_config')
    .eq('id', empresaId)
    .maybeSingle();
  if (empCfgError) console.error('[gestor] configuração da empresa indisponível:', empCfgError.message);
  const fonteExterna = (empCfg?.sys_config as any)?.perfil_externo_fonte ?? null;

  // A leitura narrativa pertence ao próprio gestor. Ela complementa os dados
  // vivos abaixo, mas nunca amplia o escopo: o filtro combina tenant + id do
  // colaborador autenticado, e só então o conteúdo vira dashboard.
  let reportDashboard: GestorHomeData['reportDashboard'] = null;
  if (isGestor) {
    const { data: managerReport, error: managerReportError } = await sb.from('relatorios')
      .select('id,conteudo,gerado_em')
      .eq('empresa_id', empresaId)
      .eq('colaborador_id', meuId)
      .eq('tipo', 'gestor')
      .order('gerado_em', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (managerReportError) {
      console.error('[gestor] leitura executiva indisponível:', managerReportError.message);
    } else if (managerReport) {
      const insight = normalizeManagerReportInsight(managerReport.conteudo);
      if (insight) {
        reportDashboard = {
          id: managerReport.id,
          generatedAt: managerReport.gerado_em || null,
          pdfUrl: `/api/relatorios/pdf?id=${encodeURIComponent(managerReport.id)}`,
          insight,
        };
      }
    }
  }

  // ── 1. Liderados ──
  // Vínculo gestor→liderado é por colaboradores.gestor_email (string).
  // (NÃO existe coluna gestor_id na tabela — type em types/index.d.ts
  // está aspiracional/errado.)
  // Gestor: filtra por gestor_email ilike self.email. RH/admin: empresa toda.
  // Fail-closed: se zero match, retorna lista vazia.
  const escopo = await resolverEscopoDoGestor(sb, {
    empresaId, meuId, meuEmail: ctx.colaborador.email, isGestor, isTutor, tutoradosIds,
  });
  const liderados = escopo.liderados;
  const liderId2obj = new Map(liderados.map((c: any) => [c.id, c]));
  const liderIds = escopo.liderIds;

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
      reportDashboard,
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
  // Quem tem QUALQUER trilha — inclusive concluída. É o denominador do card
  // "liderados", que responde "quantos já entraram no programa".
  let comAlgumaTrilha = 0;
  for (const c of liderados) {
    const t = trilhaPorColab.get(c.id);
    if (t) comAlgumaTrilha++;
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

  // Quando empresa usa fonte externa (OPQ32 etc.), DISC é ignorado:
  // 'sem perfil' = sem perfil_externo_dados (PDF não foi extraído).
  // Caso contrário, conta DISC como antes.
  //
  // 🔑 UMA régua, três consumidores: os dois alertas de "sinais de atenção" e o
  // motivo de cada linha "SEM TRILHA". Enquanto a expressão estava escrita duas
  // vezes, o card podia dizer "12 sem perfil" e as linhas marcarem 13 — e
  // ninguém saberia qual das duas está certa.
  const temPerfil = (c: any) =>
    fonteExterna ? !!c.perfil_externo_dados : (!!c.perfil_dominante || !!c.perfil_externo_dados);

  // ── 7a. POR QUE cada um está sem trilha ──
  //
  // "SEM TRILHA" sozinho não diz o que fazer, e as duas causas pedem ações
  // opostas: quem não tem perfil precisa fazer o mapeamento comportamental;
  // quem já tem precisa da rodada de avaliação. `Medido em 25/08:` das 313
  // pessoas sem trilha na base, 177 param na primeira e 133 na segunda.
  //
  // A régua é a do GERADOR, não um palpite: `gerarTemporadaCoreHeadless` recusa
  // com "Colaborador ainda não tem avaliação (descriptor_assessments)" — é essa
  // tabela que destrava a trilha, não `respostas`. E o perfil vem antes porque
  // sem ele a pessoa nem alcança o mapeamento (é o gate da home).
  //
  // O terceiro caso é o que não se pode chamar de pendência DELA: perfil feito,
  // avaliação feita, trilha não gerada — a bola está com a gente. São 3 pessoas
  // hoje (acme-demo, ibipeba), e rotulá-las como "sem mapeamento" seria cobrar
  // de quem já fez a parte dela.
  const semTrilhaIds = liderados.filter((c: any) => !trilhaPorColab.get(c.id)).map((c: any) => c.id);
  let comMapeamentoCompleto = new Set<string>();
  let assessmentIndisponivel = false;
  if (semTrilhaIds.length > 0) {
    // Só quem está sem trilha: a tabela tem uma linha por DESCRITOR, então
    // varrer a equipe inteira multiplicaria o payload por ~10 sem necessidade.
    const { data: das, error: errDas } = await sb.from('descriptor_assessments')
      .select('colaborador_id, competencia')
      .eq('empresa_id', empresaId)
      .in('colaborador_id', semTrilhaIds);
    const cargosSemTrilha = [...new Set(liderados
      .filter((c: any) => semTrilhaIds.includes(c.id))
      .map((c: any) => c.cargo)
      .filter(Boolean))];
    const { data: cargosMapeamento, error: errCargos } = cargosSemTrilha.length > 0
      ? await sb.from('cargos_empresa')
          .select('nome, top5_workshop')
          .eq('empresa_id', empresaId)
          .in('nome', cargosSemTrilha)
      : { data: [], error: null };
    if (errDas || errCargos) {
      // Consulta falhou → o Set fica vazio → todo mundo com perfil viraria "sem
      // mapeamento". Acusar a pessoa por um erro nosso é pior que não dizer
      // nada, então o motivo some e o rótulo volta a ser só "SEM TRILHA".
      console.error('[gestor] conclusão do mapeamento falhou:', errDas?.message || errCargos?.message);
      assessmentIndisponivel = true;
    } else {
      comMapeamentoCompleto = colaboradoresComMapeamentoCompleto(
        liderados.filter((c: any) => semTrilhaIds.includes(c.id)),
        cargosMapeamento || [],
        das || [],
      );
    }
  }

  // ── 7b. Quem está ATRASADO na jornada ──
  //
  // Estar numa trilha ativa não é estar andando nela: `Medido em 25/08 no macae`,
  // das 38 ativas **30 estão atrasadas** — todas na semana 2 do calendário sem
  // ter concluído a 1. O KPI "38 em andamento" sozinho lia como saúde.
  //
  // A régua vem de `lib/season-engine/atraso.ts`, que cruza as duas metades que
  // já existiam (semana da pessoa = concluídas + 1; semana do calendário =
  // `semanaLiberadaEm`) — inventar uma terceira aqui é como as telas passam a
  // discordar. Pausada não conta: quem pausou não está atrasado, está parado de
  // propósito.
  const atrasoPorColab = new Map<string, boolean | null>();
  const semanasAtrasoPorColab = new Map<string, number | null>();
  // Quantas semanas a pessoa já fechou. Sai do MESMO laço que mede o atraso —
  // uma segunda contagem para a mesma pergunta é como duas partes da tela
  // passam a discordar.
  const concluidasPorColab = new Map<string, number>();
  {
    const emCurso = ativas.filter((t: any) => t.status === TRILHA.ATIVA);
    const concluidasPorTrilha = new Map<string, number>();
    if (emCurso.length > 0) {
      const { data: progs, error: errProg } = await sb.from('temporada_semana_progresso')
        .select('trilha_id, status')
        .in('trilha_id', emCurso.map((t: any) => t.id));
      if (errProg) console.error('[gestor] progresso de semana falhou:', errProg.message);
      for (const p of progs || []) {
        if (p.status !== PROGRESSO.CONCLUIDO) continue;
        concluidasPorTrilha.set(p.trilha_id, (concluidasPorTrilha.get(p.trilha_id) || 0) + 1);
      }
    }
    for (const t of emCurso) {
      const args = {
        dataInicio: t.data_inicio,
        totalSemanas: getProgramaConfigDaTrilha(t).semanas,
        semanasConcluidas: concluidasPorTrilha.get(t.id) || 0,
      };
      concluidasPorColab.set(t.colaborador_id, args.semanasConcluidas);
      atrasoPorColab.set(t.colaborador_id, estaAtrasada(args));
      // O TAMANHO do atraso, e não só o sim/não: o card do checkpoint pinta um
      // semáforo (em dia, uma semana, mais de uma) e um booleano não distingue
      // um dia de um mês.
      semanasAtrasoPorColab.set(t.colaborador_id, semanasDeAtraso(args));
    }
  }

  const motivoSemTrilha = (c: any): EquipeRow['motivoSemTrilha'] => {
    // Quem TEM trilha não tem motivo — e a checagem mora aqui, não em cada
    // chamador: `comAssessment` só foi consultado para quem está sem trilha,
    // então sem esta linha alguém em jornada cairia em "sem mapeamento" só por
    // não estar no Set. Um segundo consumidor (o alerta) quase nasceu com isso.
    if (trilhaPorColab.get(c.id)) return null;
    if (!temPerfil(c)) return 'sem_perfil';
    if (assessmentIndisponivel) return null;
    return comMapeamentoCompleto.has(c.id) ? 'aguardando_geracao' : 'sem_mapeamento';
  };

  // ── 5. Alertas ──
  //
  // "Liderado" é a palavra do GESTOR: ele tem uma equipe. O RH não lidera a
  // empresa inteira — para ele são colaboradores. A mesma frase servindo os dois
  // escopos soava errada em metade das telas, e é a única diferença entre elas.
  const pessoa = (n: number) => (isRH ? (n === 1 ? 'colaborador' : 'colaboradores') : (n === 1 ? 'liderado' : 'liderados'));
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
  const semPerfil = liderados.filter((c: any) => !temPerfil(c)).length;
  if (semPerfil > 0) {
    const fonteLabel = fonteExterna === 'opq32' ? 'OPQ32' : fonteExterna || 'comportamental';
    alertas.push({
      tipo: 'sem_perfil',
      count: semPerfil,
      mensagem: fonteExterna
        ? `${semPerfil} ${pessoa(semPerfil)} ${semPerfil === 1 ? 'ainda não tem' : 'ainda não têm'} ${fonteLabel} carregado`
        : `${semPerfil} ${pessoa(semPerfil)} sem perfil comportamental mapeado`,
    });
  }
  // Etapa SEGUINTE do funil: tem perfil, falta o mapeamento de competências —
  // que é o que o gerador de temporada exige (`descriptor_assessments`).
  //
  // Conta EXATAMENTE quem a lista marca com esse motivo, em vez de refazer a
  // expressão: alerta e linha não podem discordar. Quem ainda não tem perfil
  // fica de fora de propósito — já está no alerta de cima, e a ação dele é
  // outra; somar os dois contaria a mesma pessoa duas vezes.
  const semMapeamento = liderados.filter((c: any) => motivoSemTrilha(c) === 'sem_mapeamento').length;
  if (semMapeamento > 0) {
    alertas.push({
      tipo: 'sem_mapeamento',
      count: semMapeamento,
      mensagem: `${semMapeamento} ${pessoa(semMapeamento)} sem mapeamento de competências`,
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
      mensagem: `${estagnados.length} ${pessoa(estagnados.length)} estagnado${estagnados.length === 1 ? '' : 's'} há 3+ semanas (sem checkpoint respondido)`,
    });
  }

  // ── 6. Checkpoints pendentes detalhados ──
  // 🔴 O CHECKPOINT PENDENTE É DERIVADO, NÃO LIDO DE UMA LINHA.
  //
  // Este card lia `checkpoints_gestor` com status 'pendente' — e a ÚNICA
  // escrita nessa tabela em todo o repositório é `salvarCheckpointGestor`, que
  // roda quando o gestor RESPONDE. Ninguém jamais criava a linha pendente:
  // "Ação esta semana" era estruturalmente inalcançável, e dizia "nada pendente"
  // para um time com gente parada na semana de avaliação.
  //
  // A régua correta já existia na tela de evolução: pendente é quem CHEGOU na
  // semana de checkpoint (progresso registrado e fora de 'pendente') e ainda não
  // teve o checkpoint validado. É essa que passa a valer aqui.
  const progressoCheckpoint = await Promise.all(ativas.map(async (t: any) => {
    const semanas = getProgramaConfigDaTrilha(t).semanasCheckpoint;
    if (!semanas.length) return [] as any[];
    const { data: progs, error: errProg } = await sb.from('temporada_semana_progresso')
      .select('semana, status, concluido_em')
      .eq('trilha_id', t.id).in('semana', semanas);
    if (errProg) {
      console.error('[gestor] progresso do checkpoint:', errProg.message);
      return [] as any[];
    }
    return (progs || []).map((p: any) => ({ trilha: t, ...p }));
  }));

  // ── QUEM PAROU ────────────────────────────────────────────────────────────
  //
  // Esta lista era de CHECKPOINTS — as semanas em que o gestor avalia. Duas
  // coisas a derrubaram (04/09/2026): a jornada de 7 semanas, que é o modelo
  // padrão, não tem checkpoint nenhum; e mesmo onde há (14 semanas), o card
  // ficava vazio a maior parte do tempo, porque só duas semanas em catorze
  // convocam alguém. Um card permanentemente vazio ensina o gestor a não olhar.
  //
  // A régua nova é a MESMA da tela de engajamento: parou quem está atrasado na
  // jornada. `estaAtrasada` cruza a semana da pessoa (concluídas + 1) com a do
  // calendário — não é opinião nem carimbo, e vale para qualquer programa.
  //
  // Trilha PAUSADA fica de fora de propósito: quem pausou não parou, parou de
  // propósito, e cobrar isso do gestor é ruído.
  const checkpointsPendentes: CheckpointPendenteDetalhado[] = ativas
    .filter((t: any) => t.status === TRILHA.ATIVA)
    .filter((t: any) => atrasoPorColab.get(t.colaborador_id) === true)
    .map((t: any) => {
      const colab: any = liderId2obj.get(t.colaborador_id);
      const semanasAtraso = semanasAtrasoPorColab.get(t.colaborador_id) ?? null;
      return {
        trilhaId: t.id,
        colabId: t.colaborador_id || '',
        colab: colab?.nome_completo || '—',
        cargo: colab?.cargo || null,
        competenciaFoco: t.competencia_foco || null,
        // A semana em que a pessoa EMPACOU (a primeira que ela ainda não
        // fechou), não a do calendário: é dessa que a conversa trata.
        semana: (concluidasPorColab.get(t.colaborador_id) || 0) + 1,
        // Dias parada = semanas de atraso × 7. Deriva do mesmo número que o
        // semáforo usa, em vez de uma segunda contagem que poderia divergir.
        diasPendente: Math.max(0, (semanasAtraso ?? 0) * 7),
        semanasAtraso,
      };
    })
    // Quem está parado há mais tempo primeiro: é a ordem das conversas.
    .sort((a, b) => (b.semanasAtraso ?? 0) - (a.semanasAtraso ?? 0));

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
    let totalSemanas: number | null = null;
    if (t?.data_inicio && (t.status === 'ativa' || t.status === 'pausada')) {
      const dias = Math.max(1, Math.floor((Date.now() - new Date(t.data_inicio).getTime()) / (24 * 3600 * 1000)));
      totalSemanas = getProgramaConfigDaTrilha(t).semanas;
      semana = Math.min(totalSemanas, Math.ceil(dias / 7));
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
      totalSemanas,
      delta,
      perfilDominante: c.perfil_dominante || null,
      fontePerfilExterno: c.perfil_externo_fonte || null,
      turma: turmaPorColab.get(c.id) || null,
      atrasada: atrasoPorColab.get(c.id) ?? null,
      motivoSemTrilha: status === 'sem_trilha' ? motivoSemTrilha(c) : null,
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
        d: c.d_natural,
        i: c.i_natural,
        s: c.s_natural,
        c: c.c_natural,
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


  return {
    ok: true,
    scope: isGestor ? 'gestor' : 'rh',
    kpis: {
      liderados: {
        total: liderados.length,
        // 🔴 "SEM TRILHA" É QUEM NUNCA TEVE, NÃO QUEM JÁ TERMINOU.
        //
        // Isto contava só as trilhas ATIVAS, então quem concluiu a jornada caía
        // no balde de "sem trilha". Medido em 04/09/2026 no `acme-demo`: o card
        // dizia "8 liderados · 1 em trilha · 7 sem trilha" enquanto a lista logo
        // abaixo mostrava 5 concluídas, 1 ativa e 2 sem nenhuma. Os dois números
        // saíam da mesma população, e mesmo assim se contradiziam na mesma tela.
        //
        // "Em andamento" continua sendo card próprio, com as ativas — a pergunta
        // "quem está percorrendo AGORA" é outra e continua respondida.
        em_trilha: comAlgumaTrilha,
        sem_trilha: liderados.length - comAlgumaTrilha,
      },
      em_andamento: { count: ativasIds.length, distribuicao_semanas: distribuicaoSemanas },
      checkpoints: { pendentes: checkpointsPendentes.length, respondidos: cpRespondidos },
      atividade_semana: { ativos: ativosSet.size, total: liderados.length },
    },
    alertas,
    checkpointsPendentes,
    equipe,
    perfis,
    empresaPerfilExternoFonte: fonteExterna,
    reportDashboard,
  };
}

/** O que a tela de engajamento do time devolve. */
export type EngajamentoDoTime = {
  ok: boolean;
  error?: string;
  scope?: 'gestor' | 'rh' | 'tutor';
  resumo?: any;
  colaboradores?: any[];
  semanas?: number[];
};

/**
 * Engajamento da trilha, recortado ao time de quem está olhando.
 *
 * Os sinais são os MESMOS de /admin/engajamento — abriu, escolheu formato,
 * terminou o vídeo, marcou consumo, entregou evidência, conversou com o
 * Tira-Dúvidas — porque vêm do mesmo núcleo (`lib/engajamento/roll-up`). O que
 * muda é a população: aqui é o escopo do papel, resolvido pela mesma régua da
 * home do gestor.
 *
 * Para RH o recorte é o tenant inteiro (`null`), e não uma lista com todos os
 * ids: além de ser a mesma coisa, evita um `IN` gigante na empresa grande.
 */
export async function getEngajamentoDoTime(semana?: number | null): Promise<EngajamentoDoTime> {
  const { getAuthenticatedEmailFromAction } = await import('@/lib/auth/action-context');
  const email = await getAuthenticatedEmailFromAction();
  if (!email) return { ok: false, error: 'Não autenticado' };
  const ctx = await getUserContext(email);
  if (!ctx?.colaborador) return { ok: false, error: 'Não autenticado' };

  const isGestor = ctx.role === 'gestor';
  const isRH = ctx.role === 'rh' || ctx.isPlatformAdmin;
  const isTutor = ctx.role === 'tutor';
  if (!isGestor && !isRH && !isTutor) return { ok: false, error: 'Acesso restrito a gestor/tutor/RH' };

  const empresaId = ctx.colaborador.empresa_id;
  if (!empresaId) return { ok: false, error: 'Colaborador sem empresa' };

  // `tenantDb` no lugar do service-role: esta action só precisa ler dentro do
  // próprio tenant, e o cliente com empresa_id embutido dá exatamente isso.
  // Pedir a chave de serviço aqui seria privilégio a mais para o trabalho que
  // é feito — e uma linha a mais na allowlist que ninguém saberia justificar
  // depois.
  const { tenantDb } = await import('@/lib/tenant-db');
  const sb = tenantDb(empresaId);

  const escopo = await resolverEscopoDoGestor(sb, {
    empresaId,
    meuId: ctx.colaborador.id,
    meuEmail: ctx.colaborador.email,
    isGestor,
    isTutor,
    tutoradosIds: (ctx.colaborador as any)?.tutorados_ids || [],
  });

  const { rollUpEngajamento } = await import('@/lib/engajamento/roll-up');
  const recorte = isRH ? null : escopo.liderIds;
  const rollup: any = await rollUpEngajamento(empresaId, semana ?? null, recorte);

  // Quem olha o tenant inteiro precisa saber DE QUEM é cada pessoa.
  //
  // O diretor não conversa com o professor — conversa com o coordenador dele. A
  // lista "Onde apoiar o próximo passo" vinha com as pessoas soltas, e descobrir
  // o vínculo de cada uma era trabalho manual no meio da leitura. Para gestor e
  // tutor o vínculo é constante (são todos dele), então o custo só é pago no
  // escopo em que ele informa algo.
  let colaboradores = rollup.colaboradores;
  if (isRH && colaboradores?.length) {
    const vinculo = await anexarCoordenador(sb, empresaId, colaboradores);
    if (vinculo) colaboradores = vinculo;
  }

  return {
    ok: true,
    scope: isTutor ? 'tutor' : (isGestor ? 'gestor' : 'rh'),
    resumo: rollup.resumo,
    colaboradores,
    semanas: rollup.semanas,
  };
}

/**
 * Resolve `gestor_email` -> nome e devolve a lista com `coordenador` em cada
 * pessoa. Devolve `null` se qualquer leitura falhar: a tela sabe agrupar em
 * "Sem coordenador", mas não sabe distinguir isso de uma consulta que não
 * respondeu — e um agrupamento inventado é pior que nenhum.
 */
async function anexarCoordenador(sb: any, empresaId: string, pessoas: any[]): Promise<any[] | null> {
  const ids = [...new Set(pessoas.map((p: any) => p.colaboradorId).filter(Boolean))];
  if (!ids.length) return null;

  // `empresa_id` explícito nas duas cadeias: `sb` já é o `tenantDb`, mas o
  // filtro escrito aqui é o que torna o escopo legível no call-site — e é o que
  // o guard de leitura de tenant consegue ver.
  const { data: vinculos, error: vincErr } = await sb.from('colaboradores')
    .select('id, gestor_email').eq('empresa_id', empresaId).in('id', ids);
  if (vincErr) { console.error('[engajamento] vinculo com coordenador:', vincErr.message); return null; }

  const emails: string[] = [...new Set((vinculos || [])
    .map((v: any) => String(v.gestor_email || '').trim().toLowerCase())
    .filter(Boolean) as string[])];
  const nomePorEmail = new Map<string, string>();
  if (emails.length) {
    // `.in('email', ...)`, não `ilike`: `_` e `%` são curinga no Postgres, e um
    // e-mail com underscore casaria gente que não é a mesma pessoa. A primeira
    // versão lia a tabela INTEIRA para filtrar em código — funciona com 14
    // pessoas e é uma varredura de tenant com 282.
    //
    // O casamento é exato: se o `gestor_email` estiver gravado com outra
    // caixa, o nome não resolve e o bloco cai para o e-mail — degradação
    // visível na tela, não um agrupamento errado.
    const { data: gestores, error: gestErr } = await sb.from('colaboradores')
      .select('email, nome_completo').eq('empresa_id', empresaId).in('email', emails);
    if (gestErr) { console.error('[engajamento] nomes dos coordenadores:', gestErr.message); return null; }
    for (const g of (gestores || []) as any[]) {
      const e = String(g.email || '').trim().toLowerCase();
      if (e) nomePorEmail.set(e, g.nome_completo || e);
    }
  }

  const emailPorId = new Map<string, string>((vinculos || []).map((v: any) => [
    String(v.id),
    String(v.gestor_email || '').trim().toLowerCase(),
  ] as [string, string]));
  return pessoas.map((p: any) => {
    const email = emailPorId.get(p.colaboradorId) || '';
    return {
      ...p,
      coordenadorEmail: email || null,
      coordenadorNome: email ? (nomePorEmail.get(email) || email) : null,
    };
  });
}
