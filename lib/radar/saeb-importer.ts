/**
 * Importador Saeb a partir do XLSX gerado pelo saeb_pipeline (Python).
 *
 * Formato esperado (3 abas):
 *   - escolas:        codigo_inep, ano, nome, rede, municipio, uf, inse_grupo,
 *                     formacao_docente_anos_iniciais_ef, ..._anos_finais_ef, ..._em,
 *                     presentes_5ef, matriculados_5ef, taxa_participacao_5ef,
 *                     presentes_9ef, matriculados_9ef, taxa_participacao_9ef,
 *                     presentes_3em, matriculados_3em, taxa_participacao_3em
 *   - distribuicoes:  codigo_inep, ano, etapa, disciplina,
 *                     sua_escola_nivel_0..N, escolas_similares_nivel_0..N,
 *                     total_municipio_nivel_0..N, total_estado_nivel_0..N, total_brasil_nivel_0..N
 *   - falhas:         codigo_inep, ano, etapa, erro
 *
 * Spec do dicionário: saeb_pipeline/saeb_dicionario.json
 */

import { createSupabaseAdmin } from '@/lib/supabase';
import { isIreceMunicipio } from './microrregiao-irece';
import ExcelJS from 'exceljs';

type Row = Record<string, unknown>;

type IngestResult = {
  totalProcessado: number;
  totalSucesso: number;
  totalFalha: number;
  totalSkipped: number;
  erros: { key: string; msg: string }[];
};

const ETAPA_FROM_COL = (col: string): string | null => {
  if (col.endsWith('_5ef')) return '5_EF';
  if (col.endsWith('_9ef')) return '9_EF';
  if (col.endsWith('_3em')) return '3_EM';
  return null;
};

function pickDistribuicaoColumns(row: Row, prefix: string): Record<string, number> {
  const dist: Record<string, number> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k.startsWith(prefix)) {
      const nivel = k.replace(prefix, '');
      const num = typeof v === 'number' ? v : Number(v);
      if (!Number.isNaN(num) && v !== null && v !== '') {
        dist[nivel] = num;
      }
    }
  }
  return dist;
}

function rowsFromSheet(rows: any[][]): Row[] {
  if (!rows.length) return [];
  const header = rows[0].map((h: any) => String(h || '').trim());
  return rows.slice(1).map((r: any[]) => {
    const obj: Row = {};
    header.forEach((h: string, i: number) => {
      obj[h] = r[i] ?? null;
    });
    return obj;
  });
}

/**
 * Converte célula ExcelJS (que pode vir como objeto com `result`/`text` quando
 * é fórmula, ou como Date, ou como hyperlink) em valor primitivo simples.
 */
function cellValue(cell: any): any {
  if (cell == null) return null;
  if (typeof cell === 'object' && !(cell instanceof Date)) {
    if ('result' in cell) return cell.result;
    if ('text' in cell) return cell.text;
    if ('richText' in cell && Array.isArray(cell.richText)) {
      return cell.richText.map((p: any) => p.text || '').join('');
    }
    if ('hyperlink' in cell && 'text' in cell) return cell.text;
  }
  return cell;
}

async function readSheetByName(buffer: Buffer, sheetName: string): Promise<any[][]> {
  const wb = new ExcelJS.Workbook();
  // ExcelJS aceita ArrayBuffer/Uint8Array; o type Buffer<ArrayBufferLike> do
  // Node 24 não bate com o Buffer antigo do exceljs — converte explicitamente.
  const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  await wb.xlsx.load(ab);
  const ws = wb.getWorksheet(sheetName);
  if (!ws) throw new Error(`Aba "${sheetName}" não encontrada no XLSX`);
  const out: any[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const cells: any[] = [];
    // ExcelJS row.values é 1-indexed (índice 0 é null); slice fora.
    const rawValues = (row.values as any[]).slice(1);
    for (const v of rawValues) cells.push(cellValue(v));
    out.push(cells);
  });
  return out;
}

export async function importarSaebXlsx(
  buffer: Buffer,
  opts: { ingestRunId: string; restringirIrece?: boolean } = { ingestRunId: '' },
): Promise<IngestResult> {
  const sb = createSupabaseAdmin();
  const result: IngestResult = {
    totalProcessado: 0,
    totalSucesso: 0,
    totalFalha: 0,
    totalSkipped: 0,
    erros: [],
  };

  // exceljs lida bem com inlineStr vazios que vem do openpyxl/Python
  const escolasRows = await readSheetByName(buffer, 'escolas');
  const distRows = await readSheetByName(buffer, 'distribuicoes');

  const escolas = rowsFromSheet(escolasRows);
  const distribuicoes = rowsFromSheet(distRows);

  // ── 1. Upsert escolas ────────────────────────────────────────────
  for (const r of escolas) {
    result.totalProcessado++;
    const codigoInep = String(r.codigo_inep || '').trim();
    if (!codigoInep || codigoInep.length !== 8) {
      result.totalSkipped++;
      continue;
    }
    const municipioIbge = String(r.municipio_ibge || r.codigo_municipio || '').trim();

    if (opts.restringirIrece && municipioIbge && !isIreceMunicipio(municipioIbge)) {
      result.totalSkipped++;
      continue;
    }

    const ano = Number(r.ano);
    const etapas: string[] = [];
    if (Number(r.matriculados_5ef) > 0) etapas.push('5_EF');
    if (Number(r.matriculados_9ef) > 0) etapas.push('9_EF');
    if (Number(r.matriculados_3em) > 0) etapas.push('3_EM');

    const escolaUpsert = {
      codigo_inep: codigoInep,
      nome: String(r.nome || '').trim() || codigoInep,
      rede: r.rede ? String(r.rede).trim().toUpperCase() : null,
      municipio: r.municipio ? String(r.municipio).trim() : '',
      municipio_ibge: municipioIbge || null,
      uf: r.uf ? String(r.uf).trim().toUpperCase() : '',
      microrregiao: r.microrregiao ? String(r.microrregiao).trim() : null,
      zona: r.zona ? String(r.zona).trim().toUpperCase() : null,
      inse_grupo: r.inse_grupo ? Number(r.inse_grupo) : null,
      etapas,
      ano_referencia: ano || null,
      atualizado_em: new Date().toISOString(),
    };

    const { error } = await sb
      .from('diag_escolas')
      .upsert(escolaUpsert, { onConflict: 'codigo_inep' });

    if (error) {
      result.totalFalha++;
      result.erros.push({ key: codigoInep, msg: error.message });
      continue;
    }

    // ── 2. Snapshots Saeb por etapa/disciplina ─────────────────────
    const distEscola = distribuicoes.filter(
      (d) => String(d.codigo_inep) === codigoInep && Number(d.ano) === ano,
    );

    for (const d of distEscola) {
      const etapa = String(d.etapa || '').trim();
      const disciplina = String(d.disciplina || '').trim();
      const etapaNorm =
        etapa.includes('5') ? '5_EF' :
        etapa.includes('9') ? '9_EF' :
        etapa.toLowerCase().includes('médio') || etapa.toLowerCase().includes('medio') || etapa.includes('3') ? '3_EM' :
        etapa;
      const discNorm =
        disciplina.toLowerCase().startsWith('matem') ? 'MAT' :
        disciplina.toLowerCase().startsWith('língua') || disciplina.toLowerCase().startsWith('lingua') ? 'LP' :
        disciplina.toUpperCase();

      const distribuicao = pickDistribuicaoColumns(d, 'sua_escola_nivel_');
      const similares = pickDistribuicaoColumns(d, 'escolas_similares_nivel_');
      const totalMunicipio = pickDistribuicaoColumns(d, 'total_municipio_nivel_');
      const totalEstado = pickDistribuicaoColumns(d, 'total_estado_nivel_');
      const totalBrasil = pickDistribuicaoColumns(d, 'total_brasil_nivel_');

      // Participação e formação dependem da etapa
      const sufixo =
        etapaNorm === '5_EF' ? '5ef' :
        etapaNorm === '9_EF' ? '9ef' :
        etapaNorm === '3_EM' ? '3em' : null;
      const presentes = sufixo ? Number(r[`presentes_${sufixo}`]) || null : null;
      const matriculados = sufixo ? Number(r[`matriculados_${sufixo}`]) || null : null;
      const taxa = sufixo ? Number(r[`taxa_participacao_${sufixo}`]) || null : null;
      const formacao =
        etapaNorm === '5_EF' ? Number(r.formacao_docente_anos_iniciais_ef) :
        etapaNorm === '9_EF' ? Number(r.formacao_docente_anos_finais_ef) :
        etapaNorm === '3_EM' ? Number(r.formacao_docente_em) : null;

      const snapshotUpsert = {
        codigo_inep: codigoInep,
        ano,
        etapa: etapaNorm,
        disciplina: discNorm,
        distribuicao,
        similares,
        total_municipio: totalMunicipio,
        total_estado: totalEstado,
        total_brasil: totalBrasil,
        presentes,
        matriculados,
        taxa_participacao: Number.isFinite(taxa as number) ? taxa : null,
        formacao_docente: Number.isFinite(formacao as number) ? formacao : null,
        ingest_run_id: opts.ingestRunId || null,
        atualizado_em: new Date().toISOString(),
      };

      const { error: e2 } = await sb
        .from('diag_saeb_snapshots')
        .upsert(snapshotUpsert, { onConflict: 'codigo_inep,ano,etapa,disciplina' });

      if (e2) {
        result.totalFalha++;
        result.erros.push({ key: `${codigoInep}/${ano}/${etapaNorm}/${discNorm}`, msg: e2.message });
      }
    }

    result.totalSucesso++;
  }

  return result;
}
