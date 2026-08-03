// CONARH 52 — helper de texto das telas em pé.
//
// A régua da rota: o que aparece sem toque tem que caber num relance. O resto
// do parágrafo não some — vai para trás de um toque, para o expositor abrir
// quando o visitante pedir.

/** Separa a primeira frase (manchete) do restante do parágrafo. */
export function partirNaPrimeiraFrase(texto: string): { manchete: string; resto: string } {
  const t = (texto || '').trim();
  const corte = t.indexOf('. ');
  if (corte === -1) return { manchete: t, resto: '' };
  return { manchete: t.slice(0, corte + 1), resto: t.slice(corte + 2).trim() };
}
