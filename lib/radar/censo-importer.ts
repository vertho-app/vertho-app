/**
 * Importador do Censo Escolar (Tabela_Escola_*.csv do INEP).
 *
 * Formato esperado (separador `;`):
 *   - 1ª linha: header com 302 colunas
 *   - Cabeçalho técnico: NU_ANO_CENSO, CO_ENTIDADE (INEP), CO_MUNICIPIO,
 *     SG_UF, NO_ENTIDADE, TP_DEPENDENCIA, TP_LOCALIZACAO, LATITUDE,
 *     LONGITUDE, TP_SITUACAO_FUNCIONAMENTO, IN_*, QT_*
 *
 * Como o CSV completo tem ~165MB (180k escolas), o admin deve rodar
 * antes o `scripts/filter-censo-irece.mjs` localmente pra gerar um
 * CSV filtrado pra microrregião alvo (~5MB).
 */

import { createSupabaseAdmin } from '@/lib/supabase';
import { isIreceMunicipio } from './microrregiao-irece';
import { calcularScores } from './censo-scores';

type IngestResult = {
  totalProcessado: number;
  totalSucesso: number;
  totalFalha: number;
  totalSkipped: number;
  erros: { key: string; msg: string }[];
};

function splitCsvLine(line: string, sep = ';'): string[] {
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
}

function parseLocalizacao(tp: any): string | null {
  const s = String(tp || '').trim();
  if (s === '1') return 'URBANA';
  if (s === '2') return 'RURAL';
  return null;
}

function parseSituacao(tp: any): string | null {
  const s = String(tp || '').trim();
  if (s === '1') return 'ativa';
  if (s === '2') return 'paralisada';
  if (s === '3') return 'extinta';
  if (s === '4') return 'transferida';
  return null;
}

function toNumOrNull(v: any): number | null {
  if (v == null || v === '') return null;
  const s = String(v).replace(',', '.').trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export async function importarCensoCsv(
  text: string,
  opts: { ingestRunId: string; restringirIrece?: boolean } = { ingestRunId: '' },
): Promise<IngestResult> {
  const sb = createSupabaseAdmin();
  const result: IngestResult = {
    totalProcessado: 0, totalSucesso: 0, totalFalha: 0, totalSkipped: 0, erros: [],
  };

  // Detecta separador (CSV INEP usa ; mas alguns processados são , )
  const firstLineEnd = text.indexOf('\n');
  if (firstLineEnd < 0) {
    result.totalFalha++;
    result.erros.push({ key: 'header', msg: 'CSV sem linha de cabeçalho' });
    return result;
  }
  const headerLine = text.slice(0, firstLineEnd).trim();
  const sep = headerLine.split(';').length > headerLine.split(',').length ? ';' : ',';
  const header = splitCsvLine(headerLine, sep).map((h) => h.trim());

  const headerIdx = (name: string) => header.indexOf(name);

  const I_INEP = headerIdx('CO_ENTIDADE');
  const I_NOME = headerIdx('NO_ENTIDADE');
  const I_ANO = headerIdx('NU_ANO_CENSO');
  const I_IBGE = headerIdx('CO_MUNICIPIO');
  const I_UF = headerIdx('SG_UF');
  const I_LAT = headerIdx('LATITUDE');
  const I_LNG = headerIdx('LONGITUDE');
  const I_LOC = headerIdx('TP_LOCALIZACAO');
  const I_LOC_DIF = headerIdx('TP_LOCALIZACAO_DIFERENCIADA');
  const I_SIT = headerIdx('TP_SITUACAO_FUNCIONAMENTO');
  const I_END = headerIdx('DS_ENDERECO');
  const I_BAIRRO = headerIdx('NO_BAIRRO');
  const I_CEP = headerIdx('CO_CEP');

  if (I_INEP < 0 || I_ANO < 0 || I_IBGE < 0) {
    result.totalFalha++;
    result.erros.push({ key: 'header', msg: 'Colunas obrigatórias ausentes (CO_ENTIDADE/NU_ANO_CENSO/CO_MUNICIPIO)' });
    return result;
  }

  // Pré-mapeia colunas IN_* e QT_*
  const inIdx: Array<[string, number]> = [];
  const qtIdx: Array<[string, number]> = [];
  for (let i = 0; i < header.length; i++) {
    const h = header[i];
    if (h.startsWith('IN_')) inIdx.push([h, i]);
    else if (h.startsWith('QT_')) qtIdx.push([h, i]);
  }

  // Processa linhas
  let pos = firstLineEnd + 1;
  const rowsToInsert: any[] = [];
  const inseridosPorInep = new Set<string>(); // dedup por (inep, ano) durante a sessão

  while (pos < text.length) {
    const next = text.indexOf('\n', pos);
    const line = (next < 0 ? text.slice(pos) : text.slice(pos, next)).replace(/\r$/, '');
    pos = next < 0 ? text.length : next + 1;
    if (!line) continue;

    result.totalProcessado++;

    const cells = splitCsvLine(line, sep);
    const codigoInep = String(cells[I_INEP] || '').trim();
    const ano = Number(cells[I_ANO]);
    if (!codigoInep || codigoInep.length !== 8 || !Number.isFinite(ano)) {
      result.totalSkipped++;
      continue;
    }
    const ibge = String(cells[I_IBGE] || '').trim().padStart(7, '0');

    if (opts.restringirIrece && !isIreceMunicipio(ibge)) {
      result.totalSkipped++;
      continue;
    }

    // Dedup intra-arquivo
    const key = `${codigoInep}_${ano}`;
    if (inseridosPorInep.has(key)) {
      result.totalSkipped++;
      continue;
    }
    inseridosPorInep.add(key);

    // Coleta indicadores e quantidades
    const indicadores: Record<string, number> = {};
    for (const [name, i] of inIdx) {
      const raw = cells[i];
      if (raw == null || raw === '') continue;
      const v = Number(raw);
      if (Number.isFinite(v)) indicadores[name] = v ? 1 : 0;
    }
    const quantidades: Record<string, number> = {};
    for (const [name, i] of qtIdx) {
      const v = toNumOrNull(cells[i]);
      if (v != null) quantidades[name] = v;
    }

    const scores = calcularScores(indicadores);

    rowsToInsert.push({
      codigo_inep: codigoInep,
      ano,
      situacao_funcionamento: parseSituacao(cells[I_SIT]),
      zona_localizacao: parseLocalizacao(cells[I_LOC]),
      zona_diferenciada: cells[I_LOC_DIF] || null,
      latitude: I_LAT >= 0 ? toNumOrNull(cells[I_LAT]) : null,
      longitude: I_LNG >= 0 ? toNumOrNull(cells[I_LNG]) : null,
      endereco: I_END >= 0 ? (cells[I_END] || null) : null,
      bairro: I_BAIRRO >= 0 ? (cells[I_BAIRRO] || null) : null,
      cep: I_CEP >= 0 ? (cells[I_CEP] || null) : null,
      indicadores,
      quantidades,
      score_basica: scores.basica,
      score_pedagogica: scores.pedagogica,
      score_acessibilidade: scores.acessibilidade,
      score_conectividade: scores.conectividade,
      ingest_run_id: opts.ingestRunId || null,
      atualizado_em: new Date().toISOString(),
    });

    // Insere em batch a cada 100 linhas pra evitar payloads gigantes
    if (rowsToInsert.length >= 100) {
      const r = await sb.from('diag_censo_infra').upsert(rowsToInsert, { onConflict: 'codigo_inep,ano' });
      if (r.error) {
        result.totalFalha += rowsToInsert.length;
        result.erros.push({ key: 'batch', msg: r.error.message });
      } else {
        result.totalSucesso += rowsToInsert.length;
      }
      rowsToInsert.length = 0;
    }
  }

  // Flush final
  if (rowsToInsert.length > 0) {
    const r = await sb.from('diag_censo_infra').upsert(rowsToInsert, { onConflict: 'codigo_inep,ano' });
    if (r.error) {
      result.totalFalha += rowsToInsert.length;
      result.erros.push({ key: 'batch', msg: r.error.message });
    } else {
      result.totalSucesso += rowsToInsert.length;
    }
  }

  return result;
}
