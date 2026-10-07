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
import {
  JANELA_ABERTA, janelasDasParticipacoes, participacaoConta, respondeuNaJanela, trilhaDaParticipacao,
  type ParticipacaoLinha, type RespostaDatada, type TrilhaDatada,
} from '@/lib/turmas/janela';

export interface TurmaResumo {
  id: string;
  nome: string;
  status: TurmaStatus;
  dataInicio: string | null;
  programaModo: string | null;
  /** Pessoas com participação ATIVA: o número operacional (lotes, envios, próxima ação). */
  membros: number;
  /** Pessoas cuja participação TERMINOU aqui (passaram para outra turma) e seguem no histórico. */
  encerrados: number;
  /**
   * `membros + encerrados`: o denominador de tudo abaixo. Uma turma que já passou
   * as pessoas adiante continua mostrando os números do período em que elas
   * estiveram nela (o `membros` dela vai a zero).
   */
  participantes: number;
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
    sb.from('turma_membros').select('id, turma_id, colaborador_id, status, created_at, marco_jornada').eq('empresa_id', empresaId),
    sb.from('colaboradores').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId),
    sb.from('respostas').select('colaborador_id, nivel_ia4, timestamp_resposta, created_at').eq('empresa_id', empresaId),
    sb.from('trilhas').select('id, colaborador_id, data_inicio, status, turma_membro_id, criado_em').eq('empresa_id', empresaId),
  ]);

  // Respostas e trilhas por PESSOA; quem decide o que é "desta turma" é a janela
  // da participação (lib/turmas/janela.ts), não a pessoa inteira.
  const respostasPorPessoa = new Map<string, RespostaDatada[]>();
  for (const r of (respostasRes.data || []) as RespostaDatada[]) {
    if (!r.colaborador_id) continue;
    const lista = respostasPorPessoa.get(r.colaborador_id) || [];
    lista.push(r);
    respostasPorPessoa.set(r.colaborador_id, lista);
  }
  const trilhasPorPessoa = new Map<string, TrilhaDatada[]>();
  for (const t of (trilhasRes.data || []) as TrilhaDatada[]) {
    if (!t.colaborador_id) continue;
    const lista = trilhasPorPessoa.get(t.colaborador_id) || [];
    lista.push(t);
    trilhasPorPessoa.set(t.colaborador_id, lista);
  }

  const participacoes = (membrosRes.data || []) as ParticipacaoLinha[];
  const janelas = janelasDasParticipacoes(participacoes);

  const participacoesPorTurma = new Map<string, ParticipacaoLinha[]>();
  const comParticipacao = new Set<string>();
  for (const m of participacoes) {
    if (!participacaoConta(m.status)) continue;       // `removido` não é participante nem histórico
    if (m.status === TURMA_MEMBRO.ATIVO) comParticipacao.add(m.colaborador_id);
    const lista = participacoesPorTurma.get(m.turma_id) || [];
    lista.push(m);
    participacoesPorTurma.set(m.turma_id, lista);
  }

  const resumos: TurmaResumo[] = (turmas || []).map((t: any) => {
    // Uma linha por PESSOA na turma (reentrada na mesma turma não conta duas vezes).
    type Estado = { ativo: boolean; respondeu: boolean; avaliado: boolean; trilha: TrilhaDatada | null };
    const porPessoa = new Map<string, Estado>();
    for (const p of participacoesPorTurma.get(t.id) || []) {
      const janela = janelas.get(p.id) ?? JANELA_ABERTA;
      const { respondeu, avaliado } = respondeuNaJanela(respostasPorPessoa.get(p.colaborador_id) || [], janela);
      const trilha = trilhaDaParticipacao(p.id, janela, trilhasPorPessoa.get(p.colaborador_id) || []);
      const atual = porPessoa.get(p.colaborador_id);
      porPessoa.set(p.colaborador_id, {
        ativo: (atual?.ativo ?? false) || p.status === TURMA_MEMBRO.ATIVO,
        respondeu: (atual?.respondeu ?? false) || respondeu,
        avaliado: (atual?.avaliado ?? false) || avaliado,
        trilha: atual?.trilha ?? trilha,
      });
    }

    const todos = [...porPessoa.values()];
    const ativos = todos.filter((e) => e.ativo);
    const conta = (lista: Estado[]) => ({
      resposta: lista.filter((e) => e.respondeu).length,
      ia4: lista.filter((e) => e.avaliado).length,
      trilha: lista.filter((e) => e.trilha).length,
    });
    const doPeriodo = conta(todos);   // o que a turma mostra: quem está e quem já passou por ela
    const operacional = conta(ativos); // o que ainda se pode fazer: só quem está

    const porSemana = new Map<number, number>();
    for (const e of ativos) {
      if (!e.trilha) continue;
      const semana = semanaDaTrilha(e.trilha.data_inicio ?? null, agora);
      if (semana === null) continue;
      porSemana.set(semana, (porSemana.get(semana) || 0) + 1);
    }

    const encerrados = todos.length - ativos.length;
    return {
      id: t.id,
      nome: t.nome,
      status: t.status,
      dataInicio: t.data_inicio,
      programaModo: (t.sys_config as any)?.programa_modo ?? null,
      membros: ativos.length,
      encerrados,
      participantes: todos.length,
      comResposta: doPeriodo.resposta,
      comIa4: doPeriodo.ia4,
      comTrilha: doPeriodo.trilha,
      semanas: [...porSemana.entries()].sort((a, b) => a[0] - b[0]).map(([semana, pessoas]) => ({ semana, pessoas })),
      proximaAcao: proximaAcaoDaTurma({
        membros: ativos.length, encerrados,
        comResposta: operacional.resposta, comIa4: operacional.ia4, comTrilha: operacional.trilha,
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
  /** Quem já passou por esta turma e seguiu adiante: turma sem ninguém ATIVO mas com histórico não está "vazia". */
  encerrados?: number;
}): string | null {
  if (t.membros === 0) return (t.encerrados ?? 0) > 0 ? null : 'turma vazia — atribua pessoas';

  const prontosSemTrilha = Math.max(0, t.comIa4 - t.comTrilha);
  if (prontosSemTrilha > 0) return `gerar trilha para ${prontosSemTrilha} elegível(is)`;

  const semAvaliar = t.comResposta - t.comIa4;
  if (semAvaliar > 0) return `avaliar ${semAvaliar} resposta(s) na IA4`;

  if (t.comResposta === 0) return `mobilizar: 0 de ${t.membros} responderam o diagnóstico`;

  const faltamResponder = t.membros - t.comResposta;
  if (faltamResponder > 0) return `seguir mobilização: faltam ${faltamResponder} de ${t.membros}`;

  return null;
}
