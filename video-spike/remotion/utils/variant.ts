/**
 * Variantes de layout DETERMINÍSTICAS (alavanca anti-fadiga).
 *
 * Um mesmo template pode ter N layouts renderizados pelo mesmo componente; a
 * escolha é determinística — chaveada por algo estável do conteúdo (id+título da
 * cena) — não aleatória. Assim o MESMO roteiro renderiza SEMPRE igual
 * (reprodutibilidade preservada), mas conteúdos diferentes se espalham pelos
 * layouts (a biblioteca visual inteira "respira" sem novos templates). A Opus
 * continua sem tocar no visual: ela escolhe o template, o renderer escolhe o layout.
 */

/** Hash determinístico (djb2) → inteiro não-negativo de 32 bits. */
export function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (((h << 5) + h) + s.charCodeAt(i)) >>> 0;
  return h >>> 0;
}

/** Índice de variante [0..n-1] determinístico a partir de uma chave estável. */
export function pickVariant(key: string, n: number): number {
  if (n <= 1) return 0;
  return hashStr(key) % n;
}
