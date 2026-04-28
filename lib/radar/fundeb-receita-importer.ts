/**
 * Importador FUNDEB · Receita prevista por ente federado.
 *
 * Formato esperado: XLSX da Portaria Interministerial anual do FNDE
 *   "1-receita-total-do-fundeb-por-ente-federado-*.xlsx"
 *
 * Estrutura:
 *   - Aba única ("Planilha1")
 *   - Linhas 1-9: cabeçalho institucional
 *   - Linha 10: header técnico
 *     UF | Código IBGE | Entidade | Receita da contribuição de estados
 *     e municípios ao Fundeb | Complementação VAAF | Complementação VAAT |
 *     Complementação VAAR | Complementação da União Total | Total das
 *     receitas previstas
 *   - Linhas 11+: dados (1 município por linha)
 *
 * O ano é detectado pelo nome do arquivo ou pela linha de título.
 */

import { createSupabaseAdmin } from '@/lib/supabase';
import ExcelJS from 'exceljs';

type IngestResult = {
  totalProcessado: number;
  totalSucesso: number;
  totalFalha: number;
  totalSkipped: number;
  erros: { key: string; msg: string }[];
  ano?: number;
  totalVaar?: number; // soma de complementacao_vaar (informativo)
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

function toNum(v: any): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/[R$\s.]/g, '').replace(',', '.').trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function detectAno(arquivoNome?: string, tituloRaw?: string): number {
  const candidates: string[] = [];
  if (arquivoNome) candidates.push(arquivoNome);
  if (tituloRaw) candidates.push(tituloRaw);
  for (const c of candidates) {
    const m = c.match(/(20\d{2})/);
    if (m) return Number(m[1]);
  }
  return new Date().getFullYear();
}

export async function importarFundebReceitaXlsx(
  buffer: Buffer,
  opts: { ingestRunId: string; arquivoNome?: string } = { ingestRunId: '' },
): Promise<IngestResult> {
  const result: IngestResult = {
    totalProcessado: 0,
    totalSucesso: 0,
    totalFalha: 0,
    totalSkipped: 0,
    erros: [],
    totalVaar: 0,
  };

  const wb = new ExcelJS.Workbook();
  const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  await wb.xlsx.load(ab);

  const ws = wb.worksheets[0];
  if (!ws) {
    result.erros.push({ key: 'sheet', msg: 'XLSX sem abas' });
    result.totalFalha = 1;
    return result;
  }

  const rawRows: any[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const cells = (row.values as any[]).slice(1).map(cellValue);
    rawRows.push(cells);
  });

  // Detecta linha do header técnico: tem "Código IBGE" e "Complementação VAAR"
  let headerIdx = -1;
  let tituloRaw = '';
  for (let i = 0; i < Math.min(15, rawRows.length); i++) {
    const norm = rawRows[i].map((c) => String(c || '').toUpperCase());
    if (!tituloRaw && norm[0] && norm[0].includes('FUNDEB')) tituloRaw = String(rawRows[i][0]);
    if (norm.some((c) => /CODIGO IBGE|CÓDIGO IBGE/i.test(c)) ||
        norm.some((c) => /COMPLEMENTACAO VAAR|COMPLEMENTAÇÃO VAAR/i.test(c))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) {
    result.erros.push({ key: 'header', msg: 'Header técnico não encontrado' });
    result.totalFalha = 1;
    return result;
  }

  const ano = detectAno(opts.arquivoNome, tituloRaw);
  result.ano = ano;

  const dataRows = rawRows.slice(headerIdx + 1);
  const sb = createSupabaseAdmin();
  const now = new Date().toISOString();
  const upserts: any[] = [];

  for (const cells of dataRows) {
    result.totalProcessado++;
    const uf = String(cells[0] ?? '').trim().toUpperCase();
    let ibge = String(cells[1] ?? '').trim();
    if (ibge && /^\d+$/.test(ibge) && ibge.length < 7) ibge = ibge.padStart(7, '0');
    const entidade = String(cells[2] ?? '').trim() || null;

    if (!uf || !/^\d{7}$/.test(ibge)) {
      result.totalSkipped++;
      continue;
    }

    const contrib    = toNum(cells[3]);
    const vaaf       = toNum(cells[4]);
    const vaat       = toNum(cells[5]);
    const vaar       = toNum(cells[6]);
    const compTotal  = toNum(cells[7]);
    const totalRec   = toNum(cells[8]);

    if (vaar && vaar > 0) result.totalVaar = (result.totalVaar || 0) + vaar;

    upserts.push({
      municipio_ibge: ibge,
      uf,
      entidade,
      ano,
      receita_contribuicao: contrib,
      complementacao_vaaf: vaaf,
      complementacao_vaat: vaat,
      complementacao_vaar: vaar,
      complementacao_uniao_total: compTotal,
      total_receita_prevista: totalRec,
      ingest_run_id: opts.ingestRunId || null,
      atualizado_em: now,
    });
  }

  // Dedupe por (ibge, ano) — última vence
  const dedupMap = new Map<string, any>();
  for (const u of upserts) dedupMap.set(`${u.municipio_ibge}_${u.ano}`, u);
  const deduped = Array.from(dedupMap.values());

  const CHUNK = 500;
  for (let i = 0; i < deduped.length; i += CHUNK) {
    const slice = deduped.slice(i, i + CHUNK);
    const { error } = await sb
      .from('diag_fundeb_receita_prevista')
      .upsert(slice, { onConflict: 'municipio_ibge,ano' });
    if (error) {
      result.totalFalha += slice.length;
      result.erros.push({ key: `chunk_${i / CHUNK}`, msg: error.message });
    } else {
      result.totalSucesso += slice.length;
    }
  }

  return result;
}
