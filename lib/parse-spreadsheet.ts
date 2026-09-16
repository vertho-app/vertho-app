/**
 * Parse unificado de planilhas (CSV, XLSX, XLS) no client.
 * Retorna array de objetos com keys normalizadas (lowercase + trim).
 * 1ª linha é sempre tratada como cabeçalho.
 *
 * Uso:
 *   const rows = await parseSpreadsheet(file);
 *
 */
export async function parseSpreadsheet(file: File | null | undefined): Promise<Record<string, string>[]> {
  if (!file) return [];
  const isExcel = /\.xlsx?$/i.test(file.name);

  if (isExcel) {
    const { readSheet } = await import('read-excel-file/browser');
    const rows = await readSheet(file);
    if (!rows?.length) return [];
    const header = rows[0].map(h => normalizeKey(h));
    return rows.slice(1).map(cols => {
      const obj: Record<string, string> = {};
      header.forEach((h, i) => { obj[h] = normalizeValue(cols[i]); });
      return obj;
    });
  }

  // CSV (ou .txt)
  const text = decodificarTexto(await file.arrayBuffer());
  const primeiraLinha = text.split(/\r?\n/, 1)[0] ?? '';
  const sep = (primeiraLinha.split(';').length > primeiraLinha.split(',').length) ? ';' : ',';

  const linhas = separarCsv(text, sep)
    .map(cols => cols.map(c => c.trim().replace(/^'|'$/g, '')))
    .filter(cols => cols.some(c => c !== ''));
  if (linhas.length === 0) return [];

  const header = linhas[0].map(h => normalizeKey(h));
  return linhas.slice(1).map(cols => {
    const obj: Record<string, string> = {};
    header.forEach((h, i) => { obj[h] = cols[i] || ''; });
    return obj;
  });
}

/**
 * O Excel no Windows salva "CSV (separado por vírgulas/ponto e vírgula)" em
 * Windows-1252, não em UTF-8. Decodificar esses bytes como UTF-8 troca cada
 * letra acentuada por U+FFFD ("Pedag�gico"), e o � vai gravado no banco: o byte
 * original se perde. UTF-8 válido vence (inclui o "CSV UTF-8" do Excel, com BOM);
 * o que não é UTF-8 válido é lido como Windows-1252.
 */
export function decodificarTexto(buf: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

/**
 * Tokeniza CSV respeitando aspas: dentro de "..." o separador e a quebra de
 * linha (Alt+Enter numa célula do Excel) são texto, e "" é uma aspa literal.
 * Quebrar por '\n' e por `sep` antes disso deslocava as colunas da linha inteira.
 */
export function separarCsv(text: string, sep: string): string[][] {
  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = '';
  let emAspas = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (emAspas) {
      if (ch !== '"') campo += ch;
      else if (text[i + 1] === '"') { campo += '"'; i++; }
      else emAspas = false;
    } else if (ch === '"' && campo.trim() === '') {
      emAspas = true;
      campo = '';
    } else if (ch === sep) {
      linha.push(campo);
      campo = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = '';
    } else {
      campo += ch;
    }
  }
  if (campo !== '' || linha.length > 0) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas;
}

function normalizeKey(raw) {
  return String(raw ?? '').trim().toLowerCase().replace(/^["']|["']$/g, '');
}

function normalizeValue(raw) {
  if (raw == null) return '';
  // read-excel-file pode retornar Date/number — manter como string pra compatibilidade
  // com o parser antigo (que rodava XLSX.utils.sheet_to_json com raw:false).
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  return String(raw).trim();
}
