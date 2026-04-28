/**
 * Importador SARESP (Sistema de Avaliação de Rendimento Escolar de SP).
 *
 * Formato esperado: CSV com `;` ou `,` como separador, header na 1ª linha.
 * Colunas-chave aceitas (insensitive):
 *   - CO_ESCOLA / CODIGO_INEP                    → codigo_inep
 *   - ANO                                         → ano
 *   - SERIE / NU_ANO_SERIE                        → serie (3, 5, 7, 9, 12)
 *   - DISCIPLINA / NO_DISCIPLINA                  → disciplina (lp/mat/cn/ch)
 *   - PROFICIENCIA_MEDIA / NU_PROFICIENCIA        → proficiencia_media
 *   - PCT_ABAIXO_BASICO, PCT_BASICO, PCT_ADEQUADO, PCT_AVANCADO → distribuicao_niveis JSONB
 *   - TOTAL_ALUNOS / NU_ALUNOS                    → total_alunos
 *
 * Filtra escolas que não existem em diag_escolas (skipped).
 */

import { createSupabaseAdmin } from '@/lib/supabase';

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

function toNum(v: any): number | null {
  if (v == null || v === '') return null;
  const s = String(v).replace(',', '.').trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseDisciplina(raw: any): 'lp' | 'mat' | 'cn' | 'ch' | string {
  const s = String(raw || '').toLowerCase().trim();
  if (s.startsWith('l') || s.includes('port')) return 'lp';
  if (s.startsWith('m') || s.includes('mat')) return 'mat';
  if (s.includes('ciência') || s.includes('ciencia') || s.startsWith('cn')) return 'cn';
  if (s.includes('human') || s.startsWith('ch')) return 'ch';
  return s;
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) return [];
  const sep = lines[0].split(';').length > lines[0].split(',').length ? ';' : ',';

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

export async function importarSarespCsv(
  text: string,
  opts: { ingestRunId: string } = { ingestRunId: '' },
): Promise<IngestResult> {
  const sb = createSupabaseAdmin();
  const result: IngestResult = {
    totalProcessado: 0, totalSucesso: 0, totalFalha: 0, totalSkipped: 0, erros: [],
  };

  const rows = parseCsv(text);
  if (!rows.length) {
    result.erros.push({ key: 'parse', msg: 'CSV vazio ou sem header' });
    result.totalFalha = 1;
    return result;
  }

  const rowsToInsert: any[] = [];

  for (const r of rows) {
    result.totalProcessado++;

    const codigoInep = String(pick(r, ['CO_ESCOLA', 'CODIGO_INEP', 'CO_ENTIDADE']) || '').trim();
    const ano = Number(pick(r, ['ANO', 'NU_ANO']));
    const serie = Number(pick(r, ['SERIE', 'NU_SERIE', 'NU_ANO_SERIE']));
    const discRaw = pick(r, ['DISCIPLINA', 'NO_DISCIPLINA', 'COMPONENTE']);
    const disciplina = parseDisciplina(discRaw);

    if (!codigoInep || codigoInep.length !== 8 || !Number.isFinite(ano) || !Number.isFinite(serie) || !disciplina) {
      result.totalSkipped++;
      continue;
    }

    const proficiencia = toNum(pick(r, ['PROFICIENCIA_MEDIA', 'NU_PROFICIENCIA', 'MEDIA']));
    const totalAlunos = toNum(pick(r, ['TOTAL_ALUNOS', 'NU_ALUNOS', 'QT_ALUNOS']));

    const dist: Record<string, number> = {};
    const ab = toNum(pick(r, ['PCT_ABAIXO_BASICO', 'ABAIXO_BASICO', 'PCT_AB']));
    const ba = toNum(pick(r, ['PCT_BASICO', 'BASICO', 'PCT_BA']));
    const ad = toNum(pick(r, ['PCT_ADEQUADO', 'ADEQUADO', 'PCT_AD']));
    const av = toNum(pick(r, ['PCT_AVANCADO', 'AVANCADO', 'PCT_AV']));
    if (ab != null) dist.abaixo_basico = ab;
    if (ba != null) dist.basico = ba;
    if (ad != null) dist.adequado = ad;
    if (av != null) dist.avancado = av;

    rowsToInsert.push({
      codigo_inep: codigoInep,
      ano,
      serie,
      disciplina,
      proficiencia_media: proficiencia,
      distribuicao_niveis: dist,
      total_alunos: totalAlunos != null ? Math.round(totalAlunos) : null,
      ingest_run_id: opts.ingestRunId || null,
      atualizado_em: new Date().toISOString(),
    });

    if (rowsToInsert.length >= 200) {
      const { error } = await sb.from('diag_saresp_snapshots').upsert(rowsToInsert, { onConflict: 'codigo_inep,ano,serie,disciplina' });
      if (error) { result.totalFalha += rowsToInsert.length; result.erros.push({ key: 'batch', msg: error.message }); }
      else { result.totalSucesso += rowsToInsert.length; }
      rowsToInsert.length = 0;
    }
  }

  if (rowsToInsert.length > 0) {
    const { error } = await sb.from('diag_saresp_snapshots').upsert(rowsToInsert, { onConflict: 'codigo_inep,ano,serie,disciplina' });
    if (error) { result.totalFalha += rowsToInsert.length; result.erros.push({ key: 'batch', msg: error.message }); }
    else { result.totalSucesso += rowsToInsert.length; }
  }

  return result;
}
