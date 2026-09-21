/** Lê todas as páginas do PostgREST e não transforma uma falha parcial em total. */
export async function lerPaginas<T = any>(pagina: (inicio: number, fim: number) => PromiseLike<{ data: T[] | null; error: any }>, tamanho = 500) {
  const data: T[] = [];
  for (let inicio = 0; ; inicio += tamanho) {
    const result = await pagina(inicio, inicio + tamanho - 1);
    if (result.error) return { data: null, error: result.error };
    data.push(...(result.data || []));
    if ((result.data || []).length < tamanho) return { data, error: null };
  }
}
