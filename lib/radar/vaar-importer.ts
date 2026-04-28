/**
 * Importador VAAR — Valor Aluno-Ano por Resultado (FUNDEB, FNDE).
 *
 * Formato esperado: XLSX oficial do FNDE
 *   "ListaentesbeneficiariosenaobeneficiariosacomplementacaoVAAR<dó FUNDEB><ano>.xlsx"
 *
 * Estrutura típica:
 *   - Aba única ("VAAR")
 *   - Linhas 1-9: cabeçalho institucional (título, info FNDE)
 *   - Linha 10: header técnico
 *     UF | Código IBGE | Entidade | Cond. I .. V | Habilitados? |
 *     Evoluiu Indicador de Atendimento? | Evoluiu Indicador de
 *     Aprendizagem? | Beneficiário? | Pendência Identificada
 *   - Linhas 11+: dados (1 município por linha)
 *
 * O ano da publicação é detectado pelo nome do arquivo (default: ano atual).
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
  beneficiarios?: number;
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

function parseSimNao(v: any): boolean | null {
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  if (!s) return null;
  if (s.startsWith('sim') || s === 'true' || s === '1') return true;
  if (s.startsWith('n')   || s === 'false' || s === '0') return false;
  return null;
}

function parseHabilitado(v: any): boolean | null {
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  if (!s) return null;
  if (s.includes('não habil') || s.includes('nao habil')) return false;
  if (s.includes('habil')) return true;
  return null;
}

function parseBeneficiario(v: any): boolean | null {
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  if (!s) return null;
  if (s.includes('não benef') || s.includes('nao benef')) return false;
  if (s.includes('benef')) return true;
  return null;
}

function detectAno(arquivoNome?: string): number {
  if (arquivoNome) {
    const m = arquivoNome.match(/(20\d{2})/);
    if (m) return Number(m[1]);
  }
  return new Date().getFullYear();
}

export async function importarVaarXlsx(
  buffer: Buffer,
  opts: { ingestRunId: string; arquivoNome?: string } = { ingestRunId: '' },
): Promise<IngestResult> {
  const result: IngestResult = {
    totalProcessado: 0,
    totalSucesso: 0,
    totalFalha: 0,
    totalSkipped: 0,
    erros: [],
    beneficiarios: 0,
  };

  const ano = detectAno(opts.arquivoNome);
  result.ano = ano;

  const wb = new ExcelJS.Workbook();
  const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  await wb.xlsx.load(ab);

  const ws = wb.getWorksheet('VAAR') || wb.worksheets[0];
  if (!ws) {
    result.erros.push({ key: 'sheet', msg: 'XLSX sem aba VAAR' });
    result.totalFalha = 1;
    return result;
  }

  // Coleta linhas como array
  const rawRows: any[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const cells = (row.values as any[]).slice(1).map(cellValue);
    rawRows.push(cells);
  });

  // Detecta linha do header: a que tem "Código IBGE" ou "Habilitados?"
  let headerIdx = -1;
  for (let i = 0; i < Math.min(15, rawRows.length); i++) {
    const norm = rawRows[i].map((c) => String(c || '').toUpperCase().trim());
    if (norm.some((c) => /CODIGO IBGE|CÓDIGO IBGE/i.test(c)) ||
        norm.some((c) => /HABILITADO/i.test(c))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) {
    result.erros.push({ key: 'header', msg: 'Header técnico não encontrado nas primeiras 15 linhas' });
    result.totalFalha = 1;
    return result;
  }

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

    if (!uf || ibge.length !== 7 || !/^\d{7}$/.test(ibge)) {
      result.totalSkipped++;
      continue;
    }

    const condI   = parseSimNao(cells[3]);
    const condII  = parseSimNao(cells[4]);
    const condIII = parseSimNao(cells[5]);
    const condIV  = parseSimNao(cells[6]);
    const condV   = parseSimNao(cells[7]);
    const habilitado    = parseHabilitado(cells[8]);
    const evoluiuAtend  = parseSimNao(cells[9]);
    const evoluiuAprend = parseSimNao(cells[10]);
    const beneficiario  = parseBeneficiario(cells[11]);
    const pendencia     = String(cells[12] ?? '').trim() || null;

    if (beneficiario === true) result.beneficiarios = (result.beneficiarios || 0) + 1;

    upserts.push({
      municipio_ibge: ibge,
      uf,
      entidade,
      ano,
      cond_i: condI,
      cond_ii: condII,
      cond_iii: condIII,
      cond_iv: condIV,
      cond_v: condV,
      habilitado,
      evoluiu_atendimento: evoluiuAtend,
      evoluiu_aprendizagem: evoluiuAprend,
      beneficiario,
      pendencia,
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
      .from('diag_fundeb_vaar')
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
