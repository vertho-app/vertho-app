/**
 * Leitura paginada do PostgREST: o servidor corta em 1.000 linhas SEM avisar, e
 * quem conclui pela AUSÊNCIA de uma linha (cenário que não existe, PPP sem
 * ninguém, competência sem par) concluiria errado sobre o que foi cortado.
 * Fonte única (veio de `lib/pipeline-fluxo/coletar.ts`, 03/10/2026).
 */
export const PAGINA_POSTGREST = 1000;

/**
 * Lê TODAS as linhas de uma consulta paginando com `.range`. A fábrica recebe o intervalo e devolve a consulta já ordenada.
 *
 * `max` (opcional) é o teto de linhas: a leitura para ao juntá-lo, e o último pedido só pede o que falta. Sem `max`, lê tudo.
 * `total` é o `count` da PRIMEIRA página, quando a fábrica pede `{ count: 'exact' }` em `de === 0` (só ali, para não
 * pagar a contagem a cada página): é o denominador que diz se um teto cortou alguma coisa. Sem count pedido, `null`.
 */
export async function lerTudoPaginado(
  fabrica: (de: number, ate: number) => any,
  opcoes: { max?: number } = {},
): Promise<{ data: any[]; error?: string; total?: number | null }> {
  const max = opcoes.max ?? Infinity;
  const out: any[] = [];
  let total: number | null = null;
  while (out.length < max) {
    const de = out.length;
    const ate = Math.min(de + PAGINA_POSTGREST, max) - 1;
    const { data, error, count } = await fabrica(de, ate);
    if (error) return { data: out, error: error.message };
    if (de === 0) total = typeof count === 'number' ? count : null;
    out.push(...(data || []));
    if (!data || data.length < ate - de + 1) break;
  }
  return { data: out, total };
}
