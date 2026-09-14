/**
 * A MATRIZ, o cruzamento das duas camadas por pessoa. Puro.
 *
 * As camadas NÃO se somam: posição (o que a pessoa demonstrou) decide o eixo
 * vertical; estilo (aderência do perfil ao cargo-alvo) só explica o horizontal.
 * O quadrante organiza a conversa que o parecer registra, não é o parecer.
 *
 * Os dois eixos são CRESCENTES: competência demonstrada sobe, aderência de
 * estilo cresce para a direita. Logo o canto inferior esquerdo é o par mais
 * baixo (`nao_agora`) e o superior direito o mais alto (`pronta`). Quem
 * renderiza tem que respeitar isso, e a tela marca as pontas com baixa/alta
 * em vez de confiar numa seta sozinha.
 *
 * Toda frase de gap sai ANCORADA: competência + média medida + corte na mesma
 * sentença (o mesmo princípio de `lib/adequacao-cargo/evidencia.ts`). Rótulo
 * interpretativo sem número é achismo, e achismo num documento sobre pessoa é
 * o que volta contra quem assina.
 */
import type { Posicao, PosicaoPessoa } from './posicao';
import type { Estilo, EstiloPessoa } from './estilo';

export type Quadrante = 'pronta' | 'pronta_com_custo' | 'potencial' | 'nao_agora';

export const QUADRANTE_LABEL: Record<Quadrante, string> = {
  pronta: 'Pronta',
  pronta_com_custo: 'Pronta, com custo nomeado',
  potencial: 'Potencial',
  nao_agora: 'Não agora',
};

/** O que cada quadrante recomenda. Texto fixo; os gaps entram nomeados ao lado. */
export const RECOMENDACAO_POR_QUADRANTE: Record<Quadrante, string> = {
  pronta: 'Demonstra o que o papel exige e o estilo é aderente ao perfil-alvo. Evidência e leitura apontam para o mesmo lado: assume agora, com devolutiva individual.',
  pronta_com_custo: 'Demonstra o que o papel exige, com estilo distante do perfil-alvo. Vai liderar de um jeito diferente do padrão da casa, o que é previsível e não surpresa. O plano individual nomeia o atrito específico.',
  potencial: 'O estilo ajuda, mas a demonstração ainda não sustenta. É o quadrante que mais engana em avaliação só por perfil. Trilha nas competências-gap e reavaliação ao fim.',
  nao_agora: 'Os gaps aparecem em competências que o papel não dispensa. Trilha antes de qualquer movimento; o parecer nomeia quais, com a evidência.',
};

/** Ordem de LEITURA da lista (não da matriz): do mais pronto ao que menos está. */
export const ORDEM_QUADRANTES: Quadrante[] = ['pronta', 'pronta_com_custo', 'potencial', 'nao_agora'];

/**
 * Disposição na matriz 2x2 com os dois eixos crescentes, em ordem de grid
 * (linha de cima primeiro, esquerda para a direita). Fonte única: a tela e o
 * PDF leem daqui em vez de repetir a ordem à mão, que foi como ela divergiu.
 */
export const GRID_QUADRANTES: Quadrante[] = ['pronta_com_custo', 'pronta', 'nao_agora', 'potencial'];

export function quadranteDe(posicao: Posicao, estilo: Estilo): Quadrante {
  if (posicao === 'demonstra') return estilo === 'aderente' ? 'pronta' : 'pronta_com_custo';
  return estilo === 'aderente' ? 'potencial' : 'nao_agora';
}

const fmt = (v: number) => v.toFixed(2).replace('.', ',');

/** «Desenvolvimento de pessoas: média 2,40 (corte 3,00)» */
export function fraseGap(competencia: string, media: number, corte: number): string {
  return `${competencia}: média ${fmt(media)} (corte ${fmt(corte)})`;
}

/** A frase cita competência, média e corte? Enforcement em teste, nunca decoração. */
export function fraseAncorada(frase: string, competencia: string, media: number, corte: number): boolean {
  const f = String(frase || '');
  return f.includes(competencia) && f.includes(fmt(media)) && f.includes(fmt(corte));
}

export interface LinhaMatriz {
  colaboradorId: string;
  nome: string;
  cargo: string | null;
  quadrante: Quadrante;
  posicao: PosicaoPessoa;
  estilo: EstiloPessoa;
  /** Gaps ancorados, um por competência abaixo do corte. */
  frasesGap: string[];
  /** Alguma avaliação da pessoa nas competências do programa está com auditoria em `revisar`. */
  auditoriaPendente: boolean;
}

export function montarLinha(args: {
  colaboradorId: string;
  nome: string;
  cargo: string | null;
  posicao: PosicaoPessoa;
  estilo: EstiloPessoa;
  corte: number;
  auditoriaPendente?: boolean;
}): LinhaMatriz | null {
  const { posicao, estilo } = args;
  if (!posicao.completo || posicao.posicao == null) return null;
  return {
    colaboradorId: args.colaboradorId,
    nome: args.nome,
    cargo: args.cargo,
    quadrante: quadranteDe(posicao.posicao, estilo.estilo),
    posicao,
    estilo,
    frasesGap: posicao.competencias
      .filter((c) => c.gap && c.media != null)
      .map((c) => fraseGap(c.competencia, c.media as number, args.corte)),
    auditoriaPendente: !!args.auditoriaPendente,
  };
}

export function contarPorQuadrante(linhas: LinhaMatriz[]): Record<Quadrante, number> {
  const out = { pronta: 0, pronta_com_custo: 0, potencial: 0, nao_agora: 0 } as Record<Quadrante, number>;
  for (const l of linhas) out[l.quadrante] += 1;
  return out;
}

/**
 * Ordena para leitura: quadrante (mais pronto primeiro), depois média geral
 * desc, depois aderência desc, depois nome. Estável e sem IA: dois leitores
 * veem a mesma ordem do mesmo cálculo.
 */
export function ordenarLinhas(linhas: LinhaMatriz[]): LinhaMatriz[] {
  const peso = new Map(ORDEM_QUADRANTES.map((q, i) => [q, i]));
  return [...linhas].sort((a, b) =>
    (peso.get(a.quadrante)! - peso.get(b.quadrante)!)
    || ((b.posicao.mediaGeral ?? -1) - (a.posicao.mediaGeral ?? -1))
    || (b.estilo.aderenciaPct - a.estilo.aderenciaPct)
    || a.nome.localeCompare(b.nome, 'pt-BR'));
}
