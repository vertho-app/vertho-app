/**
 * Importador PDDE (FNDE).
 *
 * Suporta 2 modos:
 *  - PDDE por escola (preferencial): exige CO_ESCOLA / CODIGO_INEP no CSV
 *  - PDDE municipal (fallback): se vier sem INEP mas com IBGE, agrega por
 *    município e popula diag_pdde_municipal.
 *
 * Detecta automaticamente qual modo aplicar olhando o header.
 */

import { createSupabaseAdmin } from '@/lib/supabase';

type IngestResult = {
  totalProcessado: number;
  totalSucesso: number;
  totalFalha: number;
  totalSkipped: number;
  erros: { key: string; msg: string }[];
  modo?: 'escola' | 'municipal';
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
  const m = String(v).match(/(\d{4})/);
  if (m) {
    const y = Number(m[1]);
    if (y >= 2000 && y <= 2050) return y;
  }
  return null;
}

function parseStatus(v: any): string | null {
  const s = String(v || '').toLowerCase().trim();
  if (!s) return null;
  if (s.includes('aprov')) return 'aprovada';
  if (s.includes('pend')) return 'pendente';
  if (s.includes('analise') || s.includes('análise')) return 'em_analise';
  if (s.includes('rejei')) return 'rejeitada';
  return s.slice(0, 30);
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) return [];
  const sep = lines[0].split(';').length > lines[0].split(',').length ? ';' : ',';
  const splitRow = (line: string): string[] => {
    const out: string[] = []; let cur = ''; let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { if (inQuote && line[i + 1] === '"') { cur += '"'; i++; } else inQuote = !inQuote; }
      else if (c === sep && !inQuote) { out.push(cur); cur = ''; }
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

export async function importarPddeCsv(
  text: string,
  opts: { ingestRunId: string; preferMunicipal?: boolean } = { ingestRunId: '' },
): Promise<IngestResult> {
  const sb = createSupabaseAdmin();
  const result: IngestResult = {
    totalProcessado: 0, totalSucesso: 0, totalFalha: 0, totalSkipped: 0, erros: [],
  };

  const rows = parseCsv(text);
  if (!rows.length) {
    result.erros.push({ key: 'parse', msg: 'CSV vazio' });
    result.totalFalha = 1;
    return result;
  }

  // Detecta modo
  const sample = rows[0];
  const hasInep = !!pick(sample, ['CO_ESCOLA', 'CODIGO_INEP', 'CO_ENTIDADE']);
  const modo: 'escola' | 'municipal' = (!opts.preferMunicipal && hasInep) ? 'escola' : 'municipal';
  result.modo = modo;

  if (modo === 'escola') {
    const rowsToInsert: any[] = [];
    for (const r of rows) {
      result.totalProcessado++;
      const codigoInep = String(pick(r, ['CO_ESCOLA', 'CODIGO_INEP', 'CO_ENTIDADE']) || '').trim();
      const ano = parseAno(pick(r, ['ANO', 'EXERCICIO', 'NU_ANO', 'ano']));
      if (!codigoInep || codigoInep.length !== 8 || !ano) { result.totalSkipped++; continue; }

      const valor = toNum(pick(r, ['VALOR_RECEBIDO', 'valor_recebido', 'VL_REPASSE', 'valor_repasse']));
      const saldo = toNum(pick(r, ['SALDO_ATUAL', 'saldo', 'SALDO']));
      const status = parseStatus(pick(r, ['PRESTACAO_CONTAS_STATUS', 'STATUS_PC', 'status_pc', 'STATUS']));

      rowsToInsert.push({
        codigo_inep: codigoInep,
        ano,
        valor_recebido: valor,
        saldo_atual: saldo,
        prestacao_contas_status: status,
        ingest_run_id: opts.ingestRunId || null,
        atualizado_em: new Date().toISOString(),
      });

      if (rowsToInsert.length >= 200) {
        const { error } = await sb.from('diag_pdde_repasses').upsert(rowsToInsert, { onConflict: 'codigo_inep,ano' });
        if (error) { result.totalFalha += rowsToInsert.length; result.erros.push({ key: 'batch', msg: error.message }); }
        else { result.totalSucesso += rowsToInsert.length; }
        rowsToInsert.length = 0;
      }
    }
    if (rowsToInsert.length > 0) {
      const { error } = await sb.from('diag_pdde_repasses').upsert(rowsToInsert, { onConflict: 'codigo_inep,ano' });
      if (error) { result.totalFalha += rowsToInsert.length; result.erros.push({ key: 'batch', msg: error.message }); }
      else { result.totalSucesso += rowsToInsert.length; }
    }
  } else {
    // Modo municipal — agrega
    type Acc = { ibge: string; uf: string; ano: number; total: number; escolas: Set<string> };
    const grupos = new Map<string, Acc>();
    for (const r of rows) {
      result.totalProcessado++;
      let ibge = String(pick(r, ['CO_IBGE', 'cod_municipio', 'CODIGO_IBGE', 'IBGE']) || '').trim();
      if (ibge && /^\d+$/.test(ibge) && ibge.length < 7) ibge = ibge.padStart(7, '0');
      const uf = String(pick(r, ['UF', 'SG_UF']) || '').trim().toUpperCase();
      const ano = parseAno(pick(r, ['ANO', 'EXERCICIO', 'NU_ANO']));
      if (!ibge || ibge.length !== 7 || !ano) { result.totalSkipped++; continue; }
      const valor = toNum(pick(r, ['VALOR_RECEBIDO', 'valor_recebido', 'VL_REPASSE'])) || 0;
      const escola = String(pick(r, ['CO_ESCOLA', 'CO_UEX', 'codigo_escola']) || '').trim();

      const key = `${ibge}_${ano}`;
      const acc = grupos.get(key);
      if (acc) { acc.total += valor; if (escola) acc.escolas.add(escola); }
      else { grupos.set(key, { ibge, uf, ano, total: valor, escolas: new Set(escola ? [escola] : []) }); }
    }

    const rowsToInsert = Array.from(grupos.values()).map((g) => ({
      municipio_ibge: g.ibge,
      uf: g.uf || null,
      ano: g.ano,
      total_repasse: g.total || null,
      total_escolas_atendidas: g.escolas.size || null,
      ingest_run_id: opts.ingestRunId || null,
      atualizado_em: new Date().toISOString(),
    }));

    for (let i = 0; i < rowsToInsert.length; i += 200) {
      const batch = rowsToInsert.slice(i, i + 200);
      const { error } = await sb.from('diag_pdde_municipal').upsert(batch, { onConflict: 'municipio_ibge,ano' });
      if (error) { result.totalFalha += batch.length; result.erros.push({ key: 'batch', msg: error.message }); }
      else { result.totalSucesso += batch.length; }
    }
  }

  return result;
}
