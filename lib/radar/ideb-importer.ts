/**
 * Importador Ideb (metas projetadas vs realizado).
 *
 * Formato esperado (XLSX INEP "divulgacao_ideb_escolas"):
 *   Header tem colunas IDEB_AAAA e META_AAAA por etapa (AI/AF/EM).
 *   A primeira aba não-vazia é usada por padrão.
 *
 * Detecta colunas por regex: ^(IDEB|META)_(\d{4})$.
 * Colunas de etapa podem vir como "AI", "AF", "EM" ou tipo "ANOS_INICIAIS".
 *
 * Schema diag_ideb_metas:
 *   (codigo_inep, ano, etapa, meta_projetada, ideb_realizado, status*)
 *   *status é coluna gerada (atingiu/superou/abaixo/sem_dado).
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

function toNumOrNull(v: any): number | null {
  if (v == null || v === '') return null;
  const s = String(v).replace(',', '.').trim();
  if (s === '-' || s === 'X' || s === '*') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseEtapa(raw: string): 'AI' | 'AF' | 'EM' | null {
  const s = (raw || '').toUpperCase();
  if (s.startsWith('AI') || s.includes('INICIAIS')) return 'AI';
  if (s.startsWith('AF') || s.includes('FINAIS')) return 'AF';
  if (s.includes('EM') || s.includes('MEDIO') || s.includes('MÉDIO')) return 'EM';
  return null;
}

export async function importarIdebXlsx(
  buffer: Buffer,
  opts: { ingestRunId: string } = { ingestRunId: '' },
): Promise<IngestResult> {
  const sb = createSupabaseAdmin();
  const result: IngestResult = {
    totalProcessado: 0, totalSucesso: 0, totalFalha: 0, totalSkipped: 0, erros: [],
  };

  const wb = new ExcelJS.Workbook();
  const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  await wb.xlsx.load(ab);

  // Pega a aba com mais linhas
  let ws = wb.worksheets[0];
  for (const w of wb.worksheets) {
    if (w.rowCount > (ws?.rowCount || 0)) ws = w;
  }
  if (!ws) {
    result.totalFalha++;
    result.erros.push({ key: 'sheet', msg: 'Nenhuma aba encontrada' });
    return result;
  }

  // Procura header. Pode haver linhas de título antes — encontra a com CO_ESCOLA.
  const allRows: any[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    allRows.push((row.values as any[]).slice(1).map(cellValue));
  });
  if (allRows.length < 2) {
    result.totalFalha++;
    result.erros.push({ key: 'sheet', msg: 'XLSX sem dados' });
    return result;
  }

  let headerIdx = -1;
  for (let i = 0; i < Math.min(10, allRows.length); i++) {
    const cells = allRows[i].map((c) => String(c || '').toUpperCase());
    if (cells.some((c) => c === 'CO_ESCOLA' || c === 'CO_ENTIDADE' || c === 'CODIGO_INEP')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) {
    result.totalFalha++;
    result.erros.push({ key: 'header', msg: 'Header com CO_ESCOLA não encontrado' });
    return result;
  }

  const header = allRows[headerIdx].map((h: any) => String(h || '').trim().toUpperCase());
  const idxInep = header.findIndex((h) => ['CO_ESCOLA', 'CO_ENTIDADE', 'CODIGO_INEP'].includes(h));
  const idxEtapa = header.findIndex((h) => h === 'ETAPA' || h === 'TIPO_ENSINO' || h === 'NU_TIPO_ENSINO');

  // Mapas de colunas: { ano: idx } pra IDEB e META
  const idebCols = new Map<number, number>();
  const metaCols = new Map<number, number>();
  for (let i = 0; i < header.length; i++) {
    const h = header[i];
    const mIdeb = h.match(/^IDEB_?(\d{4})$/);
    const mMeta = h.match(/^META_?(\d{4})$/);
    if (mIdeb) idebCols.set(Number(mIdeb[1]), i);
    if (mMeta) metaCols.set(Number(mMeta[1]), i);
  }

  if (idxInep < 0 || (idebCols.size === 0 && metaCols.size === 0)) {
    result.totalFalha++;
    result.erros.push({ key: 'header', msg: 'Colunas IDEB_/META_ não encontradas' });
    return result;
  }

  const dataRows = allRows.slice(headerIdx + 1);
  const rowsToInsert: any[] = [];

  for (const cells of dataRows) {
    result.totalProcessado++;
    const codigoInep = String(cells[idxInep] || '').trim();
    if (!codigoInep || codigoInep.length !== 8) { result.totalSkipped++; continue; }

    const etapaRaw = idxEtapa >= 0 ? String(cells[idxEtapa] || '') : '';
    const etapa = parseEtapa(etapaRaw);
    // Se não achou etapa explícita, tenta inferir (tipo planilha já segregada por etapa)
    // Por simplicidade, pula linhas sem etapa identificável
    if (!etapa) { result.totalSkipped++; continue; }

    // Pra cada ano com IDEB ou META, cria/upserta uma linha
    const anosCobertos = new Set<number>([...idebCols.keys(), ...metaCols.keys()]);
    for (const ano of anosCobertos) {
      const meta = toNumOrNull(idebCols.has(ano) ? cells[metaCols.get(ano) ?? -1] : null);
      const realizado = toNumOrNull(cells[idebCols.get(ano) ?? -1]);
      if (meta == null && realizado == null) continue;
      rowsToInsert.push({
        codigo_inep: codigoInep,
        ano,
        etapa,
        meta_projetada: meta,
        ideb_realizado: realizado,
        ingest_run_id: opts.ingestRunId || null,
        atualizado_em: new Date().toISOString(),
      });
    }

    if (rowsToInsert.length >= 200) {
      const { error } = await sb.from('diag_ideb_metas').upsert(rowsToInsert, { onConflict: 'codigo_inep,ano,etapa' });
      if (error) {
        result.totalFalha += rowsToInsert.length;
        result.erros.push({ key: 'batch', msg: error.message });
      } else {
        result.totalSucesso += rowsToInsert.length;
      }
      rowsToInsert.length = 0;
    }
  }

  if (rowsToInsert.length > 0) {
    const { error } = await sb.from('diag_ideb_metas').upsert(rowsToInsert, { onConflict: 'codigo_inep,ano,etapa' });
    if (error) {
      result.totalFalha += rowsToInsert.length;
      result.erros.push({ key: 'batch', msg: error.message });
    } else {
      result.totalSucesso += rowsToInsert.length;
    }
  }

  return result;
}
