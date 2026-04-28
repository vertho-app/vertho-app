/**
 * Importador ICA — Indicador Criança Alfabetizada (INEP).
 *
 * Formato esperado: CSV com colunas (microdados públicos INEP):
 *   ANO, CO_UF, SG_UF, CO_MUNICIPIO, NO_MUNICIPIO, TP_DEPENDENCIA,
 *   QT_ALUNOS_AVALIADOS, QT_ALFABETIZADOS, TX_ALFABETIZACAO,
 *   TX_ALFABETIZACAO_UF, TX_ALFABETIZACAO_BR
 *
 * Como o formato exato pode variar entre edições, o parser aceita variações
 * comuns de nome de coluna.
 */

import { createSupabaseAdmin } from '@/lib/supabase';
import ExcelJS from 'exceljs';

type IngestResult = {
  totalProcessado: number;
  totalSucesso: number;
  totalFalha: number;
  totalSkipped: number;
  erros: { key: string; msg: string }[];
};

function pick(row: Record<string, any>, names: string[]): any {
  for (const n of names) {
    const v = row[n] ?? row[n.toUpperCase()] ?? row[n.toLowerCase()];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return null;
}

function parseDependencia(raw: any): 'MUNICIPAL' | 'ESTADUAL' | 'FEDERAL' | 'PRIVADA' | 'TOTAL' {
  if (raw == null) return 'TOTAL';
  const s = String(raw).trim().toUpperCase();
  if (s === '1' || s.startsWith('FED')) return 'FEDERAL';
  if (s === '2' || s.startsWith('EST')) return 'ESTADUAL';
  if (s === '3' || s.startsWith('MUN')) return 'MUNICIPAL';
  if (s === '4' || s.startsWith('PRIV')) return 'PRIVADA';
  return 'TOTAL';
}

/** Parse simples de CSV — separador `,` ou `;`, suporta aspas duplas. */
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) return [];
  // Detecta separador
  const sep = (lines[0].split(';').length > lines[0].split(',').length) ? ';' : ',';

  const splitRow = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = !inQuote;
      } else if (c === sep && !inQuote) {
        out.push(cur);
        cur = '';
      } else {
        cur += c;
      }
    }
    out.push(cur);
    return out;
  };

  const header = splitRow(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = splitRow(line);
    const obj: Record<string, string> = {};
    header.forEach((h, i) => { obj[h] = (cells[i] || '').trim(); });
    return obj;
  });
}

async function processIcaRows(
  rows: Record<string, any>[],
  opts: { ingestRunId: string },
): Promise<IngestResult> {
  const sb = createSupabaseAdmin();
  const result: IngestResult = {
    totalProcessado: 0,
    totalSucesso: 0,
    totalFalha: 0,
    totalSkipped: 0,
    erros: [],
  };

  const now = new Date().toISOString();
  const batch: any[] = [];
  const batchKeys: string[] = [];

  for (const r of rows) {
    result.totalProcessado++;

    let ibge = String(pick(r, ['CO_MUNICIPIO', 'co_municipio', 'codigo_municipio', 'IBGE']) || '').trim();
    // CO_MUNICIPIO pode vir como número (7 dígitos) — força string com padding
    if (ibge && /^\d+$/.test(ibge) && ibge.length < 7) ibge = ibge.padStart(7, '0');
    const uf = String(pick(r, ['SG_UF', 'UF', 'sg_uf']) || '').trim().toUpperCase();
    const ano = Number(pick(r, ['ANO', 'NU_ANO', 'ano']));
    const dep = parseDependencia(pick(r, ['NO_TP_REDE', 'TP_DEPENDENCIA', 'tp_dependencia', 'rede', 'DEPENDENCIA']));

    if (!ibge || ibge.length !== 7 || !uf || !ano) {
      result.totalSkipped++;
      continue;
    }

    const alunos = Number(pick(r, ['QT_ALUNOS_AVALIADOS', 'alunos_avaliados', 'qt_avaliados']));
    const alfa = Number(pick(r, ['QT_ALFABETIZADOS', 'alfabetizados', 'qt_alfabetizados']));
    const taxa = Number(pick(r, ['PC_ALUNO_ALFABETIZADO', 'TX_ALFABETIZACAO', 'taxa', 'tx_alfabetizacao']));
    const taxaUf = Number(pick(r, ['TX_ALFABETIZACAO_UF', 'tx_uf']));
    const taxaBr = Number(pick(r, ['TX_ALFABETIZACAO_BR', 'tx_brasil']));

    batch.push({
      municipio_ibge: ibge,
      uf,
      rede: dep,
      ano,
      alunos_avaliados: Number.isFinite(alunos) ? alunos : null,
      alfabetizados: Number.isFinite(alfa) ? alfa : null,
      taxa: Number.isFinite(taxa) ? taxa : null,
      total_estado: Number.isFinite(taxaUf) ? taxaUf : null,
      total_brasil: Number.isFinite(taxaBr) ? taxaBr : null,
      ingest_run_id: opts.ingestRunId || null,
      atualizado_em: now,
    });
    batchKeys.push(`${ibge}/${dep}/${ano}`);
  }

  // Dedupe por chave (XLSX INEP às vezes repete linhas) — última vence.
  const dedupMap = new Map<string, any>();
  batch.forEach((row, i) => dedupMap.set(batchKeys[i], row));
  const deduped = Array.from(dedupMap.values());

  // Upsert em chunks pra evitar payload gigante.
  const CHUNK = 500;
  for (let i = 0; i < deduped.length; i += CHUNK) {
    const slice = deduped.slice(i, i + CHUNK);
    const { error } = await sb
      .from('diag_ica_snapshots')
      .upsert(slice, { onConflict: 'municipio_ibge,rede,ano' });
    if (error) {
      result.totalFalha += slice.length;
      result.erros.push({ key: `chunk_${i / CHUNK}`, msg: error.message });
    } else {
      result.totalSucesso += slice.length;
    }
  }

  return result;
}

// ── Wrappers públicos por formato ──────────────────────────────────────

export async function importarIcaCsv(
  text: string,
  opts: { ingestRunId: string } = { ingestRunId: '' },
): Promise<IngestResult> {
  const rows = parseCsv(text);
  return processIcaRows(rows, opts);
}

/**
 * Cell value helper para XLSX — extrai valor primitivo de células ExcelJS
 * que podem vir como objeto (fórmula com .result, hyperlink, rich text).
 */
function cellValue(cell: any): any {
  if (cell == null) return null;
  if (typeof cell === 'object' && !(cell instanceof Date)) {
    if ('result' in cell) return cell.result;
    if ('text' in cell) return cell.text;
    if ('richText' in cell && Array.isArray(cell.richText)) {
      return cell.richText.map((p: any) => p.text || '').join('');
    }
  }
  return cell;
}

/**
 * Importa ICA a partir do XLSX oficial INEP (resultados_e_metas_municipios.xlsx).
 *
 * Formato esperado:
 *   - Aba "Divulgação Alfabet Municipio"
 *   - Linha 0: rótulos descritivos em maiúsculo (ANO DA AVALIAÇÃO, ...)
 *   - Linha 1: nomes técnicos (ANO, CO_UF, SG_UF, CO_MUNICIPIO, NO_MUNICIPIO,
 *              NO_TP_REDE, PC_ALUNO_ALFABETIZADO, META_FINAL_2024, ...)
 *   - Linha 2+: dados
 *
 * Aceita também variações: tenta primeiro a aba específica, se não achar
 * usa a primeira aba do workbook.
 */
export async function importarIcaXlsx(
  buffer: Buffer,
  opts: { ingestRunId: string } = { ingestRunId: '' },
): Promise<IngestResult> {
  const wb = new ExcelJS.Workbook();
  const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  await wb.xlsx.load(ab);

  // Procura aba específica do INEP, fallback pra primeira
  const sheetNames = wb.worksheets.map((w) => w.name);
  const targetName =
    sheetNames.find((n) => /alfabet/i.test(n)) ||
    sheetNames.find((n) => /municipi/i.test(n)) ||
    sheetNames[0];
  const ws = wb.getWorksheet(targetName);
  if (!ws) {
    return {
      totalProcessado: 0, totalSucesso: 0, totalFalha: 1, totalSkipped: 0,
      erros: [{ key: 'sheet', msg: 'Nenhuma aba encontrada no XLSX' }],
    };
  }

  // Coleta todas as linhas como arrays de células
  const rawRows: any[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const cells = (row.values as any[]).slice(1).map(cellValue);
    rawRows.push(cells);
  });
  if (rawRows.length < 2) {
    return {
      totalProcessado: 0, totalSucesso: 0, totalFalha: 1, totalSkipped: 0,
      erros: [{ key: 'sheet', msg: 'XLSX sem linhas de dados' }],
    };
  }

  // Detecta linha do header técnico: a que tem CO_MUNICIPIO ou similar.
  // Se a primeira linha for descritiva ("ANO DA AVALIAÇÃO"), pula pra segunda.
  let headerIdx = 0;
  for (let i = 0; i < Math.min(3, rawRows.length); i++) {
    const cells = rawRows[i].map((c) => String(c || '').toUpperCase());
    if (cells.some((c) => /^CO_MUNICIPIO$/i.test(c) || /^NO_TP_REDE$/i.test(c))) {
      headerIdx = i;
      break;
    }
  }
  const header = rawRows[headerIdx].map((h: any) => String(h || '').trim());
  const dataRows = rawRows.slice(headerIdx + 1);

  const rows: Record<string, any>[] = dataRows.map((cells) => {
    const obj: Record<string, any> = {};
    header.forEach((h, i) => { obj[h] = cells[i] ?? null; });
    return obj;
  });

  return processIcaRows(rows, opts);
}
