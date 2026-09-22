/**
 * Visão da equipe no simulador de vendas (revisão de 18/09/2026, itens 4.1 e 4.4).
 *
 * Até aqui a gestão tinha só a lista de treinos, um por linha: não dava para
 * saber quem ainda não começou, nem onde a equipe está em cada competência, e a
 * pesquisa de experiência (obrigatória, decisão do dono) era gravada e ninguém a
 * lia. Esta agregação é pura (sem I/O) e roda no servidor; a tela só desenha.
 *
 * Réguas:
 *   - nível por pessoa = MAIOR nível alcançado na competência (só avanço, como a
 *     evolução do participante), só de treinos concluídos na escala 1 a 4 nativa;
 *   - a gestão lê o relatório sem depender da pesquisa (como já fazia);
 *   - comentários da pesquisa saem SEM nome: avaliam o simulador, não a pessoa.
 */
import {
  evolucaoPorCompetencia,
  ORDEM_COMPETENCIAS,
  type EvolucaoCompetencia,
  type NotasPorCompetencia,
} from './evolucao';
import type { CodigoCompetencia } from './matriz';
import { VENDAS_SESSAO } from '@/lib/status';
import { distribuicaoPorCompetencia } from '@/lib/simuladores/evolucao';

export const ASPECTOS_PESQUISA = [
  'realismo',
  'desafio',
  'interacao',
  'utilidade',
  'aprendizado',
] as const;
export type AspectoPesquisa = (typeof ASPECTOS_PESQUISA)[number];
export const MAX_COMENTARIOS = 30;

export interface PessoaPainel {
  id: string;
  nome: string;
  cargo: string | null;
}
export interface SessaoPainel {
  colaboradorId: string;
  criadoEm: string;
  status: string;
  /** Notas 1 a 4 por competência; `null` fora da escala nativa ou sem relatório. */
  competencias: NotasPorCompetencia | null;
  feedback:
    | (Partial<Record<AspectoPesquisa, unknown>> & { comentario?: unknown })
    | null;
}
export interface LinhaPessoa extends PessoaPainel {
  treinos: number;
  concluidos: number;
  emAndamento: boolean;
  ultimo: string | null;
  competencias: EvolucaoCompetencia[];
}
export interface PainelVendas {
  resumo: {
    pessoas: number;
    comecaram: number;
    concluiram: number;
    naoComecaram: number;
  };
  competencias: Array<{
    codigo: CodigoCompetencia;
    niveis: [number, number, number, number];
    semNivel: number;
  }>;
  pessoas: LinhaPessoa[];
  naoComecaram: PessoaPainel[];
  pesquisa: {
    respostas: number;
    medias: Record<AspectoPesquisa, number | null>;
    comentarios: Array<{ texto: string; em: string }>;
  };
}

const ABERTOS: string[] = [
  VENDAS_SESSAO.PREPARANDO,
  VENDAS_SESSAO.EM_ANDAMENTO,
];
/** Descartado (abandonada) não conta como treino. */
const CONTAM_COMO_TREINO: string[] = [
  ...ABERTOS,
  VENDAS_SESSAO.CONCLUIDA,
  VENDAS_SESSAO.INTERROMPIDA,
];

export function agregarPainel(
  pessoas: PessoaPainel[],
  sessoes: SessaoPainel[],
): PainelVendas {
  const porPessoa = new Map<string, SessaoPainel[]>();
  for (const s of sessoes) {
    const lista = porPessoa.get(s.colaboradorId) || [];
    lista.push(s);
    porPessoa.set(s.colaboradorId, lista);
  }
  const linhas: LinhaPessoa[] = pessoas.map((p) => {
    // Mais recente primeiro, como o histórico que a evolução espera.
    const minhas = (porPessoa.get(p.id) || [])
      .filter((s) => CONTAM_COMO_TREINO.includes(s.status))
      .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
    const concluidas = minhas.filter(
      (s) => s.status === VENDAS_SESSAO.CONCLUIDA,
    );
    return {
      ...p,
      treinos: minhas.length,
      concluidos: concluidas.length,
      emAndamento: minhas.some((s) => ABERTOS.includes(s.status)),
      ultimo: minhas[0]?.criadoEm ?? null,
      competencias: evolucaoPorCompetencia(concluidas),
    };
  });
  linhas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const avaliadas = new Set(
    sessoes
      .filter(
        (s) => s.status === VENDAS_SESSAO.CONCLUIDA && s.competencias !== null,
      )
      .map((s) => s.colaboradorId),
  );
  const competencias = distribuicaoPorCompetencia(
    linhas.filter((p) => avaliadas.has(p.id)),
    ORDEM_COMPETENCIAS,
  );
  const respostas = sessoes
    .filter((s) => s.feedback && typeof s.feedback === 'object')
    .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  const medias = Object.fromEntries(
    ASPECTOS_PESQUISA.map((aspecto) => {
      const notas = respostas
        .map((s) => s.feedback![aspecto])
        .filter((n): n is number => typeof n === 'number' && n >= 1 && n <= 5);
      return [
        aspecto,
        notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : null,
      ];
    }),
  ) as Record<AspectoPesquisa, number | null>;
  const comentarios = respostas
    .map((s) => ({
      texto:
        typeof s.feedback!.comentario === 'string'
          ? s.feedback!.comentario.trim()
          : '',
      em: s.criadoEm,
    }))
    .filter((c) => c.texto)
    .slice(0, MAX_COMENTARIOS);
  return {
    resumo: {
      pessoas: linhas.length,
      comecaram: linhas.filter((l) => l.treinos > 0).length,
      concluiram: linhas.filter((l) => l.concluidos > 0).length,
      naoComecaram: linhas.filter((l) => l.treinos === 0).length,
    },
    competencias,
    pessoas: linhas,
    naoComecaram: linhas
      .filter((l) => l.treinos === 0)
      .map(({ id, nome, cargo }) => ({ id, nome, cargo })),
    pesquisa: { respostas: respostas.length, medias, comentarios },
  };
}
