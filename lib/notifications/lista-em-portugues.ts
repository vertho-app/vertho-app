/**
 * "A", "A e B", "A, B e C": junta nomes para entrar numa variável de template.
 *
 * Sem `Intl.ListFormat` de propósito: o texto que sai para a pessoa não pode depender do ICU do
 * Node que roda o lote, e o corpo aprovado na Meta fixa o idioma (pt_BR). Vazios e repetidos
 * saem, porque uma variável com "A e  e B" é a mensagem sem sentido que "funcionou".
 */
export function listaEmPortugues(nomes: ReadonlyArray<unknown>): string {
  const limpos: string[] = [];
  for (const n of nomes || []) {
    const t = String(n ?? '').replace(/\s+/g, ' ').trim();
    if (t && !limpos.some((x) => x.toLowerCase() === t.toLowerCase())) limpos.push(t);
  }
  if (limpos.length <= 1) return limpos[0] || '';
  return `${limpos.slice(0, -1).join(', ')} e ${limpos[limpos.length - 1]}`;
}
