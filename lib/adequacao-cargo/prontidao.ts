/**
 * PRONTIDÃO PARA O PRÓXIMO CARGO — quem, no cargo de hoje, se aproxima do perfil
 * ideal de outro cargo. A pergunta que o dono do produto fez em 09/09/2026:
 * "quais representantes comerciais estariam mais aptos a gerente comercial?".
 *
 * O MOTOR JÁ SABIA RESPONDER, e ninguém podia perguntar. `aggregateAdequacao`
 * aceita `poolCargos` desde sempre — avaliar as pessoas de um cargo contra o
 * gabarito de OUTRO. O único consumidor era `actions/selecao.ts`, e Seleção de
 * pessoas está OFF-LINE desde 31/08/2026 (`lib/blocos-offline.ts`). Capacidade
 * viva atrás de uma porta desligada é indistinguível de capacidade ausente.
 *
 * 🔑 POR QUE ISTO NÃO ENTRA NO RANKING DE ADEQUAÇÃO, e sim ao lado dele:
 *
 * O Ranking é VIEW PURA de um snapshot assado (trava nº 5) porque é documento
 * de decisão — em edital público, recomputar na leitura significa que dois
 * leitores podem ver ordens diferentes do mesmo concurso. Esta tela é outra
 * coisa: é exploratória, o par (origem → alvo) é escolhido na hora, e pré-assar
 * snapshots exigiria decidir os pares de antemão — 4 cargos são 12 combinações,
 * e um tenant com 26 cargos, 650. Então aqui o cálculo é AO VIVO e a data do
 * cálculo é carimbada, em vez de fingir ser o mesmo tipo de documento.
 *
 * Não custa IA: `aggregateAdequacao` é puro motor de scoring (nenhum `callAI`).
 *
 * ⚠️ O QUE ESTE NÚMERO NÃO É: a aderência ao cargo futuro mede o encaixe do
 * perfil COMPORTAMENTAL e de competências contra o gabarito — não mede desejo
 * da pessoa, entrega recente, nem tempo de casa. É apoio à decisão, como o
 * Ranking; a conversa continua sendo do gestor.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { aggregateAdequacao, type AdequacaoCargo, type PessoaAdequacao } from './aggregate';

export type LinhaProntidao = {
  colaboradorId: string | null;
  nome: string;
  /** Aderência ao cargo que a pessoa ocupa HOJE. Null se ela não foi avaliada lá. */
  aderenciaAtual: number | null;
  /** Aderência ao cargo ALVO. */
  aderenciaAlvo: number;
  /** alvo − atual. Null quando não há as duas pontas. */
  delta: number | null;
  statusAlvo: PessoaAdequacao['status'];
  statusAlvoLabel: string;
  /** Reprovou um requisito eliminatório do cargo alvo. */
  bloqueadoNoAlvo: boolean;
  /** O que bloqueia, na frase do motor. Vazio quando não há gate reprovado. */
  motivosBloqueio: string[];
  /** Os traços mais distantes do alvo — o que a pessoa precisa desenvolver. */
  lacunas: { traco: string; bloco: string; fitPct: number }[];
  borderline: boolean;
};

export type Prontidao = {
  cargoOrigem: string;
  cargoAlvo: string;
  /** ISO do instante do cálculo — não é snapshot, e a tela precisa dizer isso. */
  calculadoEm: string;
  linhas: LinhaProntidao[];
  /** Faixas da régua do cargo ALVO, para a tela não reinventar o corte. */
  faixas: { recomendadoMin: number; ressalvasMin: number } | null;
  /** Pesos do cargo alvo: o que ele valoriza, que é o que explica o delta. */
  pesosAlvo: { bloco: string; pct: number }[];
  /**
   * 🔴 O GABARITO DO ALVO DISCRIMINA? Sem isto, a tela apresenta como resultado
   * um número que o próprio motor sabe não separar ninguém.
   *
   * `Medido: 09/09/2026` — o dono perguntou como um representante comercial
   * podia ter 91,6% de aderência ao perfil de GERENTE, cargo de gestão. A
   * resposta estava no motor e não chegava à tela: das 14 medidas do gabarito de
   * Gerente Comercial na ACME Demo, **4 davam 100% para as 12 pessoas do pool**
   * (amplitude 0), e 11 das 14 tinham faixa larga o bastante para quase todo
   * mundo saturar. O guardião de calibração já emitia o aviso; nenhuma TELA o
   * lia — só o PDF de Adequação.
   */
  calibracaoAlvo: {
    /** Avisos do guardião bilateral do motor (piso zera / teto satura). */
    avisos: { traco: string; pct: number; tipo: 'piso' | 'teto' }[];
    /** Medidas cuja variação no pool é desprezível — não separam ninguém. */
    semDiscriminacao: string[];
    totalMedidas: number;
  };
  avaliados: number;
  /** Diagnóstico honesto quando não dá para responder. */
  indisponivel: null | 'sem_gabarito_alvo' | 'sem_pessoas_na_origem';
};

const VAZIO = (cargoOrigem: string, cargoAlvo: string, motivo: Prontidao['indisponivel']): Prontidao => ({
  cargoOrigem,
  cargoAlvo,
  calculadoEm: new Date().toISOString(),
  linhas: [],
  faixas: null,
  pesosAlvo: [],
  calibracaoAlvo: { avisos: [], semDiscriminacao: [], totalMedidas: 0 },
  avaliados: 0,
  indisponivel: motivo,
});

/**
 * Quais medidas do gabarito não separam NINGUÉM neste pool.
 *
 * Amplitude (maior fit − menor fit) abaixo de 5 pontos: todo mundo recebe
 * praticamente a mesma nota naquela medida, então ela não contribui para a
 * ordem. É complementar ao aviso do motor, que olha saturação absoluta (>50% no
 * teto ou no piso); aqui o que importa é a VARIAÇÃO dentro do grupo comparado —
 * uma faixa pode não saturar e mesmo assim dar 90% para todos.
 */
const AMPLITUDE_MINIMA = 5;

function medidasQueNaoSeparam(pessoas: PessoaAdequacao[]): { semDiscriminacao: string[]; totalMedidas: number } {
  const porMedida = new Map<string, number[]>();
  for (const p of pessoas) {
    for (const t of ((p as any).tracos || []) as { label: string; fitPct: number }[]) {
      if (!t?.label) continue;
      if (!porMedida.has(t.label)) porMedida.set(t.label, []);
      porMedida.get(t.label)!.push(t.fitPct || 0);
    }
  }
  const semDiscriminacao: string[] = [];
  for (const [label, fits] of porMedida) {
    // Com uma pessoa só não há o que separar — declarar "não discrimina" ali
    // seria transformar n=1 em defeito do gabarito.
    if (fits.length < 2) continue;
    if (Math.max(...fits) - Math.min(...fits) < AMPLITUDE_MINIMA) semDiscriminacao.push(label);
  }
  return { semDiscriminacao, totalMedidas: porMedida.size };
}

/** Índice por id, com o nome normalizado como rede de segurança. */
function indexar(base: AdequacaoCargo): { porId: Map<string, PessoaAdequacao>; porNome: Map<string, PessoaAdequacao> } {
  const porId = new Map<string, PessoaAdequacao>();
  const porNome = new Map<string, PessoaAdequacao>();
  for (const p of base.pessoas) {
    if (p.id) porId.set(p.id, p);
    // O nome é FALLBACK, nunca a chave primária: homônimo existe, e casar duas
    // avaliações da pessoa errada aqui produz um delta inventado sobre alguém.
    const chave = (p.nome || '').trim().toLowerCase();
    if (chave && !porNome.has(chave)) porNome.set(chave, p);
  }
  return { porId, porNome };
}

/**
 * Compara as pessoas de `cargoOrigem` contra o perfil ideal de `cargoAlvo`.
 *
 * Duas passagens do motor, ambas sem IA:
 *  1. o pool da origem avaliado contra o gabarito do ALVO (é a pergunta);
 *  2. o cargo de origem avaliado contra o próprio gabarito (é a linha de base,
 *     que dá sentido ao número — 88% no alvo significa coisas diferentes para
 *     quem tem 95% e para quem tem 70% no cargo atual).
 */
export async function compararProntidao(
  sb: SupabaseClient,
  empresaId: string,
  cargoOrigem: string,
  cargoAlvo: string,
): Promise<Prontidao> {
  const [noAlvo, naOrigem] = await Promise.all([
    aggregateAdequacao(sb, empresaId, cargoAlvo, { poolCargos: [cargoOrigem] }),
    aggregateAdequacao(sb, empresaId, cargoOrigem),
  ]);

  if (noAlvo.semGabarito) return VAZIO(cargoOrigem, cargoAlvo, 'sem_gabarito_alvo');
  if (noAlvo.semColaboradores) return VAZIO(cargoOrigem, cargoAlvo, 'sem_pessoas_na_origem');

  const { porId, porNome } = indexar(naOrigem);

  const linhas: LinhaProntidao[] = noAlvo.pessoas.map((p) => {
    const atual = (p.id && porId.get(p.id))
      || porNome.get((p.nome || '').trim().toLowerCase())
      || null;
    const aderenciaAtual = atual ? atual.beta.pct : null;
    return {
      colaboradorId: p.id || null,
      nome: p.nome,
      aderenciaAtual,
      aderenciaAlvo: p.beta.pct,
      delta: aderenciaAtual == null ? null : Number((p.beta.pct - aderenciaAtual).toFixed(1)),
      statusAlvo: p.status,
      statusAlvoLabel: p.statusLabel,
      bloqueadoNoAlvo: p.knockoutFailed,
      motivosBloqueio: p.knockoutMotivos || [],
      // As 3 maiores lacunas: é o que vira conversa de desenvolvimento. Mais que
      // isso deixa de ser um plano e vira uma lista de defeitos.
      lacunas: [...(p.gaps || [])]
        .sort((a, b) => a.fitPct - b.fitPct)
        .slice(0, 3)
        .map((g) => ({ traco: g.traco, bloco: g.bloco, fitPct: g.fitPct })),
      borderline: p.borderline,
    };
  });

  return {
    cargoOrigem,
    cargoAlvo,
    calculadoEm: new Date().toISOString(),
    // Bloqueado por gate vai para o FIM, independentemente da aderência: o gate
    // é o que decide, e listar alguém reprovado no topo por ter 94% convida
    // exatamente a leitura que o gate existe para impedir.
    linhas: linhas.sort((a, b) => {
      if (a.bloqueadoNoAlvo !== b.bloqueadoNoAlvo) return a.bloqueadoNoAlvo ? 1 : -1;
      return b.aderenciaAlvo - a.aderenciaAlvo;
    }),
    faixas: noAlvo.perfilIdeal.faixas || null,
    pesosAlvo: noAlvo.perfilIdeal.pesos || [],
    calibracaoAlvo: {
      avisos: noAlvo.avisosCalibracao || [],
      ...medidasQueNaoSeparam(noAlvo.pessoas),
    },
    avaliados: noAlvo.avaliados,
    indisponivel: null,
  };
}
