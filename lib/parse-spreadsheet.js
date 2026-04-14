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
    const XLSX = await import('xlsx');
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
    return rows.map(normalizeKeys);
  }

  // CSV (ou .txt)
  const text = await file.text();
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length === 0) return [];

  const sep = (lines[0].split(';').length > lines[0].split(',').length) ? ';' : ',';
  const header = lines[0].split(sep).map(h => h.trim().toLowerCase().replace(/^["']|["']$/g, ''));
  return lines.slice(1).map(line => {
    const cols = line.split(sep).map(c => c.trim().replace(/^["']|["']$/g, ''));
    const obj = {};
    header.forEach((h, i) => { obj[h] = cols[i] || ''; });
    return obj;
  });
}

function normalizeKeys(row) {
  const obj = {};
  for (const [k, v] of Object.entries(row)) {
    obj[String(k).trim().toLowerCase()] = String(v ?? '').trim();
  }
  return obj;
}
