/** Referências são insumo interno; não fazem parte da resposta apresentada. */
export function stripIpiCitations(text: string): string {
  return text
    .replace(/\[\s*[FD]\d+(?:\s*(?:[,;–-]|\be\b)\s*[FD]?\d+)*\s*\]/gi, '')
    .replace(/(\S)[ \t]{2,}/g, '$1 ')
    .replace(/[ \t]+([.,;:!?])/g, '$1')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}
