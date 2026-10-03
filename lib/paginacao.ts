/**
 * Leitura paginada do PostgREST: o servidor corta em 1.000 linhas SEM avisar, e
 * quem conclui pela AUSÊNCIA de uma linha (cenário que não existe, PPP sem
 * ninguém, competência sem par) concluiria errado sobre o que foi cortado.
 * Fonte única (veio de `lib/pipeline-fluxo/coletar.ts`, 03/10/2026).
 */
export const PAGINA_POSTGREST = 1000;

/** Lê TODAS as linhas de uma consulta paginando com `.range`. A fábrica recebe o intervalo e devolve a consulta já ordenada. */
export async function lerTudoPaginado(fabrica: (de: number, ate: number) => any): Promise<{ data: any[]; error?: string }> {
  const out: any[] = [];
  for (let de = 0; ; de += PAGINA_POSTGREST) {
    const { data, error } = await fabrica(de, de + PAGINA_POSTGREST - 1);
    if (error) return { data: out, error: error.message };
    out.push(...(data || []));
    if (!data || data.length < PAGINA_POSTGREST) break;
  }
  return { data: out };
}
