/**
 * Ranking da votação de competências — régua única de contagem e ordenação.
 *
 * Cada voto é uma lista ORDENADA de 5 competências. A 1ª vale 5 pontos e a 5ª
 * vale 1. A ordem do ranking é:
 *   1. mais PONTOS (intensidade: 1ª escolha pesa mais que a 5ª);
 *   2. mais VOTOS (quantas pessoas escolheram, em qualquer posição);
 *   3. mais vezes em 1º LUGAR, depois em 2º, 3º, 4º e 5º — decisão do dono
 *      (26/09/2026), no 1º empate real da 4Life: "Interação com as Famílias"
 *      (0× em 1º, 4× em 3º, 4× em 4º) e "Condução de Grupos e Gestão de Sala"
 *      (3× em 1º, 3× em 4º, 3× em 5º) tinham 24 pontos e 9 votos cada. Pelo
 *      critério 3, Condução passa na frente: foi a mais importante para 3
 *      professoras.
 *
 * Até essa data não havia critério 3, e o empate saía na ordem em que o banco
 * devolvia os votos (consulta sem `order by`): uma das duas ficava em 5º e já
 * vinha marcada para aprovação por acaso, e a ordem podia trocar ao recarregar.
 *
 * Quando nem o critério 3 separa (mesma distribuição de posições), o item sai
 * com `empate: true` e a tela diz "empate". A ordem entre eles passa a ser a
 * alfabética só para não mudar a cada leitura, nunca como veredito.
 */

export interface ContagemCompetencia {
  votos: number;
  pontos: number;
  /** Quantas vezes em cada posição: `[1º, 2º, 3º, 4º, 5º]`. */
  posicoes: number[];
}

export interface ItemRanking extends ContagemCompetencia {
  nome: string;
  /** Empatado em TODOS os critérios com outra competência. */
  empate: boolean;
  /**
   * Quando empatou em pontos e votos com outra, mas as posições separaram: a
   * posição que decidiu (0 = 1º lugar) e quantas vezes ESTA competência ficou
   * nela. É o que a tela mostra para a ordem não parecer arbitrária.
   */
  desempate: { posicao: number; vezes: number } | null;
}

export const POSICOES_NA_CEDULA = 5;

/** 1º = 5 pontos … 5º = 1. Posição além da 5ª (voto antigo malformado) não pontua. */
export function pontosDaPosicao(indice: number): number {
  return Math.max(0, POSICOES_NA_CEDULA - indice);
}

/** Soma um voto (lista ordenada de nomes) na contagem do cargo. */
export function somarVoto(contagem: Record<string, ContagemCompetencia>, escolhidas: unknown): void {
  if (!Array.isArray(escolhidas)) return;
  escolhidas.forEach((nome, indice) => {
    const chave = String(nome || '').trim();
    if (!chave) return;
    const c = contagem[chave] || (contagem[chave] = { votos: 0, pontos: 0, posicoes: Array(POSICOES_NA_CEDULA).fill(0) });
    c.votos++;
    c.pontos += pontosDaPosicao(indice);
    if (indice < POSICOES_NA_CEDULA) c.posicoes[indice]++;
  });
}

const mesmoPontosEVotos = (a: ContagemCompetencia, b: ContagemCompetencia) => a.pontos === b.pontos && a.votos === b.votos;

/** Primeira posição em que as duas diferem, ou -1 se a distribuição é igual. */
function posicaoQueSepara(a: ContagemCompetencia, b: ContagemCompetencia): number {
  for (let p = 0; p < POSICOES_NA_CEDULA; p++) {
    if ((a.posicoes[p] || 0) !== (b.posicoes[p] || 0)) return p;
  }
  return -1;
}

export function ordenarRanking(contagem: Record<string, ContagemCompetencia>): ItemRanking[] {
  const itens = Object.entries(contagem).map(([nome, c]) => ({ nome, ...c }));

  itens.sort((a, b) => {
    if (b.pontos !== a.pontos) return b.pontos - a.pontos;
    if (b.votos !== a.votos) return b.votos - a.votos;
    const p = posicaoQueSepara(a, b);
    if (p >= 0) return (b.posicoes[p] || 0) - (a.posicoes[p] || 0);
    return a.nome.localeCompare(b.nome, 'pt-BR');
  });

  return itens.map((item) => {
    const vizinhos = itens.filter((o) => o !== item && mesmoPontosEVotos(o, item));
    const empate = vizinhos.some((o) => posicaoQueSepara(o, item) === -1);
    // A posição que decidiu é a primeira em que o grupo empatado em pontos e
    // votos deixa de ser igual: é ela que explica a ordem na tela.
    const separadoras = vizinhos.map((o) => posicaoQueSepara(o, item)).filter((p) => p >= 0);
    const posicao = separadoras.length ? Math.min(...separadoras) : -1;
    return {
      ...item,
      empate,
      desempate: !empate && posicao >= 0 ? { posicao, vezes: item.posicoes[posicao] || 0 } : null,
    };
  });
}
