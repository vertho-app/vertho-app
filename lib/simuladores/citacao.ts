/**
 * CITAÇÃO LITERAL nos avaliadores dos três simuladores.
 *
 * Todo nível atribuído exige um trecho copiado da fala da pessoa, e o servidor
 * confere se o trecho existe na fonte. Duas coisas moram aqui, comuns aos três.
 *
 * 1) Tipografia não é conteúdo (medido no atendimento em 06/09/2026): o
 *    avaliador copia “assim” como 'assim' e … como "...", e o retry repete a
 *    mesma cópia porque, para ele, foi literal. O único caso com aspas curvas
 *    na abertura recusou 9 de 9 avaliações. A exigência de trecho literal
 *    permanece; só aspas, reticências, travessões, espaços e caixa são
 *    equiparados. Vendas e liderança comparavam por `includes` cru.
 *
 * 2) Uma citação ruim não derruba as outras 29. Até 18/09 a validação era tudo
 *    ou nada nos três: uma única citação inexata entre cerca de 60 descartava a
 *    avaliação inteira, e o reenvio mandava o mesmo prompt, sem dizer o erro.
 *    Agora o descritor com citação inválida perde o nível (vira "sem
 *    observação", marcado para revisão) e o resto vale, desde que as falhas
 *    sejam POUCAS: acima do limite, a avaliação inteira é suspeita e volta a
 *    ser recusada, como antes.
 */

const TIPOGRAFIA: Array<[RegExp, string]> = [
  [/[“”«»"‘’]/g, "'"],
  [/…/g, '...'],
  [/[–—]/g, '-'],
  [/\s+/g, ' '],
];

export function normalizarCitacao(texto: string): string {
  return TIPOGRAFIA.reduce((acc, [re, sub]) => acc.replace(re, sub), texto).trim().toLowerCase();
}

/** O trecho existe na fonte, comparando sem tipografia e sem caixa? */
export function contemCitacao(fonte: string | null | undefined, trecho: string | null | undefined): boolean {
  if (typeof fonte !== 'string' || typeof trecho !== 'string') return false;
  const alvo = normalizarCitacao(trecho);
  return alvo.length > 0 && normalizarCitacao(fonte).includes(alvo);
}

/**
 * Quantos descritores com citação inválida a avaliação tolera antes de ser
 * recusada inteira: 20% dos que receberam nível, com piso de 1.
 */
export const FRACAO_MAXIMA_DESCARTE = 0.2;

export function descarteTolerado(invalidos: number, avaliados: number): boolean {
  if (invalidos <= 0) return true;
  return invalidos <= Math.max(1, Math.floor(avaliados * FRACAO_MAXIMA_DESCARTE));
}
