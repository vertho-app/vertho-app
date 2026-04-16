/**
 * Parse unificado de planilhas (CSV, XLSX, XLS) no client.
 * Retorna array de objetos com keys normalizadas (lowercase + trim).
 * 1ª linha é sempre tratada como cabeçalho.
 *
 * Uso:
 *   const rows = await parseSpreadsheet(file);
 *
 * @param {File} file
 * @returns {Promise<Array<Object>>}
 */
export async function parseSpreadsheet(file) {
  if (!file) return [];
  const isExcel = /\.xlsx?$/i.test(file.name);

  if (isExcel) {
    const { default: readXlsxFile } = await import('read-excel-file');
    const rows = await readXlsxFile(file);
    if (!rows?.length) return [];
    const header = rows[0].map(h => normalizeKey(h));
    return rows.slice(1).map(cols => {
      const obj = {};
      header.forEach((h, i) => { obj[h] = normalizeValue(cols[i]); });
      return obj;
    });
  }

  // CSV (ou .txt)
  const text = await file.text();
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length === 0) return [];

  const sep = (lines[0].split(';').length > lines[0].split(',').length) ? ';' : ',';
  const header = lines[0].split(sep).map(h => normalizeKey(h));
  return lines.slice(1).map(line => {
    const cols = line.split(sep).map(c => c.trim().replace(/^["']|["']$/g, ''));
    const obj = {};
    header.forEach((h, i) => { obj[h] = cols[i] || ''; });
    return obj;
  });
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
