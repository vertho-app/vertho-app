/**
 * Importador FUNDEB — Tesouro Transparente.
 *
 * O CSV oficial vem mensal por município. Agregamos por ano automaticamente.
 * Colunas aceitas (insensitive):
 *   - cod_municipio / CO_IBGE / CODIGO_IBGE       → municipio_ibge
 *   - uf / SG_UF                                  → uf
 *   - ano / ano_mes / mes_ano                     → derivamos ano (4 dígitos)
 *   - valor_repasse_bruto / VALOR_BRUTO           → soma → total_repasse_bruto
 *   - valor_complementacao_uniao / VL_COMPL       → soma → total_complementacao_uniao
 *   - matriculas_consideradas (opcional)          → último valor do ano
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
  const s = String(v).replace(/[R$\s.]/g, '').replace(',', '.').trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseAno(v: any): number | null {
  if (!v) return null;
  const s = String(v).trim();
  // Aceita: "2024", "2024-03", "2024/03", "03/2024", "032024"
  const m = s.match(/(\d{4})/);
  if (m) {
    const y = Number(m[1]);
    if (y >= 2000 && y <= 2050) return y;
  }
  return null;
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
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; } else inQuote = !inQuote;
      } else if (c === sep && !inQuote) { out.push(cur); cur = ''; }
      else cur += c;
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

export async function importarFundebCsv(
  text: string,
  opts: { ingestRunId: string } = { ingestRunId: '' },
): Promise<IngestResult> {
  const sb = createSupabaseAdmin();
  const result: IngestResult = {
    totalProcessado: 0, totalSucesso: 0, totalFalha: 0, totalSkipped: 0, erros: [],
  };

  const rows = parseCsv(text);

  // Agrega por (ibge, ano)
  type Acc = {
    ibge: string;
    uf: string;
    ano: number;
    bruto: number;
    complementacao: number;
    matriculas: number | null;
  };
  const grupos = new Map<string, Acc>();

  for (const r of rows) {
    result.totalProcessado++;
    let ibge = String(pick(r, ['cod_municipio', 'CO_IBGE', 'CODIGO_IBGE', 'codigo_municipio', 'IBGE']) || '').trim();
    if (ibge && /^\d+$/.test(ibge) && ibge.length < 7) ibge = ibge.padStart(7, '0');
    const uf = String(pick(r, ['uf', 'SG_UF']) || '').trim().toUpperCase();
    const ano = parseAno(pick(r, ['ano', 'ano_mes', 'mes_ano', 'data', 'periodo', 'NU_ANO']));

    if (!ibge || ibge.length !== 7 || !ano) {
      result.totalSkipped++;
      continue;
    }

    const bruto = toNum(pick(r, ['valor_repasse_bruto', 'VALOR_BRUTO', 'vl_bruto', 'valor_bruto']));
    const compl = toNum(pick(r, ['valor_complementacao_uniao', 'VL_COMPL', 'complementacao_uniao', 'compl_uniao']));
    const matr = toNum(pick(r, ['matriculas_consideradas', 'matriculas', 'qt_matriculas']));

    const key = `${ibge}_${ano}`;
    const acc = grupos.get(key);
    if (acc) {
      acc.bruto += bruto || 0;
      acc.complementacao += compl || 0;
      if (matr != null) acc.matriculas = matr; // último valor do ano (geralmente o mais recente)
    } else {
      grupos.set(key, {
        ibge, uf, ano,
        bruto: bruto || 0,
        complementacao: compl || 0,
        matriculas: matr,
      });
    }
  }

  const rowsToInsert = Array.from(grupos.values()).map((g) => ({
    municipio_ibge: g.ibge,
    uf: g.uf || null,
    ano: g.ano,
    total_repasse_bruto: g.bruto || null,
    total_complementacao_uniao: g.complementacao || null,
    matriculas_consideradas: g.matriculas != null ? Math.round(g.matriculas) : null,
    ingest_run_id: opts.ingestRunId || null,
    atualizado_em: new Date().toISOString(),
  }));

  // Insere em batches
  for (let i = 0; i < rowsToInsert.length; i += 200) {
    const batch = rowsToInsert.slice(i, i + 200);
    const { error } = await sb.from('diag_fundeb_repasses').upsert(batch, { onConflict: 'municipio_ibge,ano' });
    if (error) {
      result.totalFalha += batch.length;
      result.erros.push({ key: 'batch', msg: error.message });
    } else {
      result.totalSucesso += batch.length;
    }
  }

  return result;
}
