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
import { isIreceMunicipio } from './microrregiao-irece';

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

export async function importarIcaCsv(
  text: string,
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

  const rows = parseCsv(text);
  for (const r of rows) {
    result.totalProcessado++;

    const ibge = String(pick(r, ['CO_MUNICIPIO', 'co_municipio', 'codigo_municipio', 'IBGE']) || '').trim();
    const uf = String(pick(r, ['SG_UF', 'UF', 'sg_uf']) || '').trim().toUpperCase();
    const ano = Number(pick(r, ['ANO', 'NU_ANO', 'ano']));
    const dep = parseDependencia(pick(r, ['TP_DEPENDENCIA', 'tp_dependencia', 'rede', 'DEPENDENCIA']));

    if (!ibge || ibge.length !== 7 || !uf || !ano) {
      result.totalSkipped++;
      continue;
    }
    if (opts.restringirIrece && !isIreceMunicipio(ibge)) {
      result.totalSkipped++;
      continue;
    }

    const alunos = Number(pick(r, ['QT_ALUNOS_AVALIADOS', 'alunos_avaliados', 'qt_avaliados']));
    const alfa = Number(pick(r, ['QT_ALFABETIZADOS', 'alfabetizados', 'qt_alfabetizados']));
    const taxa = Number(pick(r, ['TX_ALFABETIZACAO', 'taxa', 'tx_alfabetizacao']));
    const taxaUf = Number(pick(r, ['TX_ALFABETIZACAO_UF', 'tx_uf']));
    const taxaBr = Number(pick(r, ['TX_ALFABETIZACAO_BR', 'tx_brasil']));

    const upsert = {
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
      atualizado_em: new Date().toISOString(),
    };

    const { error } = await sb
      .from('diag_ica_snapshots')
      .upsert(upsert, { onConflict: 'municipio_ibge,rede,ano' });

    if (error) {
      result.totalFalha++;
      result.erros.push({ key: `${ibge}/${dep}/${ano}`, msg: error.message });
    } else {
      result.totalSucesso++;
    }
  }

  return result;
}
