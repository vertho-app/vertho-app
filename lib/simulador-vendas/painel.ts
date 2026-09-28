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
 *
 * 🔑 Comentários anônimos de verdade (decisão do dono D3, 27/09/2026). Até aqui
 * cada comentário saía com a data do treino, que é o mesmo valor da coluna
 * "Último treino" da pessoa na mesma tela: em equipe pequena, "sem nome" não
 * anonimizava ninguém. Agora: sem data, em ordem aleatória, com dados pessoais
 * mascarados e só a partir de `MIN_RESPONDENTES_COMENTARIOS` pessoas que
 * responderam à pesquisa no que o painel lê (a janela de retenção). Abaixo
 * disso a tela diz que os comentários existem só a partir desse número.
 */
import { maskTextPII } from '@/lib/pii-masker';
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
/** Com menos pessoas que isso respondendo, um comentário aponta quem o escreveu. */
export const MIN_RESPONDENTES_COMENTARIOS = 5;

export interface PessoaPainel {
  id: string;
  nome: string;
  cargo: string | null;
}
export interface SessaoPainel {
  colaboradorId: string;
  criadoEm: string;
  /** Última gravação do treino (`updated_at`); sem ela, vale a criação. */
  atualizadoEm?: string | null;
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
  /**
   * Treino aberto sem atividade há mais de `PARADO_APOS_MS`: a última
   * atividade. Até 27/09/2026 ele aparecia como "Tem treino em andamento"
   * para sempre (V-10). `null` quando não há treino parado.
   */
  paradoDesde: string | null;
  ultimo: string | null;
  competencias: EvolucaoCompetencia[];
}
/**
 * A partir de quanto tempo sem atividade um treino aberto é "parado". Uma
 * conversa leva de 15 a 30 minutos; três dias sem gravação é abandono de fato,
 * não pausa para o almoço. Escolha da rodada de 27/09/2026, sem medição.
 */
export const PARADO_APOS_MS = 3 * 24 * 60 * 60 * 1000;
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
    /** Pessoas distintas que responderam à pesquisa. */
    respondentes: number;
    medias: Record<AspectoPesquisa, number | null>;
    /** Sem data e sem autor, em ordem aleatória; vazio abaixo do mínimo de respondentes. */
    comentarios: Array<{ texto: string }>;
    /** Os comentários ficaram de fora por haver menos respondentes que o mínimo. */
    comentariosRetidos: boolean;
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

/** Embaralha sem viés (Fisher-Yates); `aleatorio` é injetável para teste. */
function embaralhar<T>(itens: T[], aleatorio: () => number): T[] {
  const r = [...itens];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

export function agregarPainel(
  pessoas: PessoaPainel[],
  sessoes: SessaoPainel[],
  aleatorio: () => number = Math.random,
  agora: number = Date.now(),
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
    const abertas = minhas.filter((s) => ABERTOS.includes(s.status));
    const atividade = (s: SessaoPainel) => s.atualizadoEm || s.criadoEm;
    const parada = abertas.find(
      (s) => agora - Date.parse(atividade(s)) > PARADO_APOS_MS,
    );
    return {
      ...p,
      treinos: minhas.length,
      concluidos: concluidas.length,
      emAndamento: abertas.length > 0,
      paradoDesde: parada ? atividade(parada) : null,
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
  const respondentes = new Set(respostas.map((s) => s.colaboradorId)).size;
  const comentariosRetidos = respondentes < MIN_RESPONDENTES_COMENTARIOS;
  // Os mais recentes entram no teto; a ordem exibida é sorteada, para não
  // denunciar quem respondeu por último. Nada de data nem de autor.
  const comentarios = comentariosRetidos
    ? []
    : embaralhar(
        respostas
          .map((s) =>
            typeof s.feedback!.comentario === 'string'
              ? maskTextPII(s.feedback!.comentario).trim()
              : '',
          )
          .filter(Boolean)
          .slice(0, MAX_COMENTARIOS)
          .map((texto) => ({ texto })),
        aleatorio,
      );
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
    pesquisa: {
      respostas: respostas.length,
      respondentes,
      medias,
      comentarios,
      comentariosRetidos,
    },
  };
}
