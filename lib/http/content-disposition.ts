/** Cabeçalho ASCII com nome UTF-8, inclusive aspas, travessões e alfabetos não latinos. */
export function contentDispositionHeader(filename: string, disposition: 'inline' | 'attachment' = 'attachment'): string {
  const nome = filename.toWellFormed().replace(/[\x00-\x1f\x7f]/g, '').replace(/[\\/]/g, '-').trim() || 'arquivo.pdf';
  const ascii = nome.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]|["\\]/g, '_');
  const utf8 = encodeURIComponent(nome).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}
