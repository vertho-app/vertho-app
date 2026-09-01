/**
 * `map` assíncrono com TETO de execuções simultâneas, preservando a ORDEM.
 *
 * POR QUE EXISTE, e por que a ordem é o ponto. Nasceu da narração da devolutiva
 * comportamental: `Medido 01/09/2026:` 8 a 12 segmentos de TTS rodavam em SÉRIE,
 * 23s cada, e a pessoa esperava 231s a 267s. Paralelizar é óbvio; o que não é
 * óbvio é que `Promise.all` resolve fora de ordem — e áudio remontado por ordem
 * de CHEGADA sai com as frases embaralhadas, defeito que passa por qualquer
 * teste de "gerou?".
 *
 * O teto não é enfeite: o gargalo do Vertex é TPM. Sem limite, uma narração de
 * 12 segmentos vira 12 chamadas simultâneas e duas pessoas ao mesmo tempo
 * derrubam as duas com 429.
 *
 * Falha de um item rejeita o conjunto (Promise.all): quem chama decide o
 * fallback. Para a narração isso é o certo — meia devolutiva não se entrega.
 */
export async function mapComTeto<T, R>(
  itens: readonly T[],
  teto: number,
  fn: (item: T, indice: number) => Promise<R>,
): Promise<R[]> {
  const total = itens.length;
  const saida: R[] = new Array(total);
  if (total === 0) return saida;

  const trabalhadores = Math.max(1, Math.min(Math.floor(teto) || 1, total));
  let proximo = 0;

  async function trabalhar() {
    for (;;) {
      const i = proximo++;
      if (i >= total) return;
      // por ÍNDICE, nunca por push: é isto que preserva a ordem
      saida[i] = await fn(itens[i], i);
    }
  }

  await Promise.all(Array.from({ length: trabalhadores }, () => trabalhar()));
  return saida;
}
