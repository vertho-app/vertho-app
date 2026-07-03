/**
 * Pool de concorrência mínimo (sem dependências) pros LOTES de IA/IO que
 * rodavam em série (cenários B, checks, relatórios, e-mails).
 *
 * Contratos:
 *  - resultados na MESMA ordem de `items` (independe da ordem de término);
 *  - no máximo `limite` execuções simultâneas;
 *  - erro de `fn` PROPAGA (rejeita o todo) — caller que quer tolerância
 *    embrulha o try/catch dentro de `fn` e devolve um marcador, preservando
 *    a semântica dos loops `for { try { } catch { erros++ } }` originais.
 *
 * Limites recomendados: IA de geração 3 (TPM), checks 4, e-mails 5, DB 8.
 */
export async function mapComLimite<T, R>(
  items: readonly T[],
  limite: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!items.length) return [];
  const max = Math.max(1, Math.min(limite, items.length));
  const resultados = new Array<R>(items.length);
  let proximo = 0;

  async function worker() {
    while (true) {
      const i = proximo++;
      if (i >= items.length) return;
      resultados[i] = await fn(items[i], i);
    }
  }

  await Promise.all(Array.from({ length: max }, () => worker()));
  return resultados;
}
