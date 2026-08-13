/**
 * Portfólio de turmas de uma empresa — núcleo headless (sem gate; o `'use
 * server'` fica na action).
 *
 * Núcleo em `lib/` porque tem DOIS consumidores: a action `listarTurmas`
 * (gatada) e o workspace do admin-v2. Duplicar a agregação faria as duas telas
 * divergirem sobre o mesmo cliente — que é exatamente o defeito que as turmas
 * vieram corrigir, um nível acima.
 *
 * ── A regra que este arquivo carrega ────────────────────────────────────────
 * **Nenhum número sem denominador.** O painel de hoje diz "80 respostas" para
 * uma empresa de 283 pessoas: some o denominador e some a informação. Aqui todo
 * contador vem com `membros` ao lado, e a distribuição é POR TURMA — a média
 * entre uma safra fechada e outra recém-aberta não descreve nenhuma das duas.
 */

import { TURMA_MEMBRO, type TurmaStatus } from '@/lib/status';

export interface TurmaResumo {
  id: string;
  nome: string;
  status: TurmaStatus;
  dataInicio: string | null;
  programaModo: string | null;
  /** Denominador de tudo abaixo. */
  membros: number;
  comResposta: number;
  comIa4: number;
  comTrilha: number;
  /** Semana da jornada por pessoa — distribuição, nunca média. */
  semanas: Array<{ semana: number; pessoas: number }>;
  /** A única próxima ação da turma, ou null quando não há nada a fazer. */
  proximaAcao: string | null;
}

export interface PortfolioTurmas {
  turmas: TurmaResumo[];
  /** Pessoas da empresa sem participação ativa — pendência VISÍVEL. */
  semTurma: number;
  totalPessoas: number;
}

/** Semana da jornada a partir do início da trilha (mesma régua do week-gating). */
export function semanaDaTrilha(dataInicio: string | null | undefined, hoje: Date = new Date()): number | null {
  if (!dataInicio) return null;
  const [y, m, d] = String(dataInicio).slice(0, 10).split('-').map(Number);
  const inicio = Date.UTC(y, m - 1, d);
  const dias = Math.floor((hoje.getTime() - inicio) / 86_400_000);
  if (dias < 0) return null;                     // safra ainda não começou
  return Math.floor(dias / 7) + 1;
}

export async function levantarPortfolioTurmas(
  sb: any,
  empresaId: string,
  agora: Date = new Date(),
): Promise<PortfolioTurmas> {
  const { data: turmas } = await sb.from('turmas')
    .select('id, nome, status, data_inicio, sys_config')
    .eq('empresa_id', empresaId)
    .order('created_at');

  const [membrosRes, colabsRes, respostasRes, trilhasRes] = await Promise.all([
    sb.from('turma_membros').select('turma_id, colaborador_id, status').eq('empresa_id', empresaId),
    sb.from('colaboradores').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId),
    sb.from('respostas').select('colaborador_id, nivel_ia4').eq('empresa_id', empresaId),
    sb.from('trilhas').select('colaborador_id, data_inicio, status').eq('empresa_id', empresaId),
  ]);

  const comResposta = new Set<string>();
  const comIa4 = new Set<string>();
  for (const r of respostasRes.data || []) {
    if (!r.colaborador_id) continue;
    comResposta.add(r.colaborador_id);
    if (r.nivel_ia4 !== null && r.nivel_ia4 !== undefined) comIa4.add(r.colaborador_id);
  }

  const trilhaDe = new Map<string, { data_inicio: string | null }>();
  for (const t of trilhasRes.data || []) {
    if (t.colaborador_id) trilhaDe.set(t.colaborador_id, { data_inicio: t.data_inicio });
  }

  const ativosPorTurma = new Map<string, string[]>();
  const comParticipacao = new Set<string>();
  for (const m of membrosRes.data || []) {
    if (m.status !== TURMA_MEMBRO.ATIVO) continue;
    comParticipacao.add(m.colaborador_id);
    const lista = ativosPorTurma.get(m.turma_id) || [];
    lista.push(m.colaborador_id);
    ativosPorTurma.set(m.turma_id, lista);
  }

  const resumos: TurmaResumo[] = (turmas || []).map((t: any) => {
    const ids = ativosPorTurma.get(t.id) || [];
    const nResposta = ids.filter((id) => comResposta.has(id)).length;
    const nIa4 = ids.filter((id) => comIa4.has(id)).length;
    const comTrilhaIds = ids.filter((id) => trilhaDe.has(id));

    const porSemana = new Map<number, number>();
    for (const id of comTrilhaIds) {
      const semana = semanaDaTrilha(trilhaDe.get(id)?.data_inicio ?? null, agora);
      if (semana === null) continue;
      porSemana.set(semana, (porSemana.get(semana) || 0) + 1);
    }

    return {
      id: t.id,
      nome: t.nome,
      status: t.status,
      dataInicio: t.data_inicio,
      programaModo: (t.sys_config as any)?.programa_modo ?? null,
      membros: ids.length,
      comResposta: nResposta,
      comIa4: nIa4,
      comTrilha: comTrilhaIds.length,
      semanas: [...porSemana.entries()].sort((a, b) => a[0] - b[0]).map(([semana, pessoas]) => ({ semana, pessoas })),
      proximaAcao: proximaAcaoDaTurma({
        membros: ids.length, comResposta: nResposta, comIa4: nIa4, comTrilha: comTrilhaIds.length,
      }),
    };
  });

  const total = colabsRes.count || 0;
  return {
    turmas: resumos,
    semTurma: Math.max(0, total - comParticipacao.size),
    totalPessoas: total,
  };
}

/**
 * UMA próxima ação por turma — e sempre com números.
 *
 * A ordem importa: o gargalo real é o que está pronto e parado, não o que falta
 * mobilizar. Com 38 diretores avaliados e 0 trilhas, a ação é *gerar trilha para
 * os 38* — hoje o painel mostra a pendência dos professores e some com isso.
 */
export function proximaAcaoDaTurma(t: {
  membros: number; comResposta: number; comIa4: number; comTrilha: number;
}): string | null {
  if (t.membros === 0) return 'turma vazia — atribua pessoas';

  const prontosSemTrilha = Math.max(0, t.comIa4 - t.comTrilha);
  if (prontosSemTrilha > 0) return `gerar trilha para ${prontosSemTrilha} elegível(is)`;

  const semAvaliar = t.comResposta - t.comIa4;
  if (semAvaliar > 0) return `avaliar ${semAvaliar} resposta(s) na IA4`;

  if (t.comResposta === 0) return `mobilizar: 0 de ${t.membros} responderam o diagnóstico`;

  const faltamResponder = t.membros - t.comResposta;
  if (faltamResponder > 0) return `seguir mobilização: faltam ${faltamResponder} de ${t.membros}`;

  return null;
}
