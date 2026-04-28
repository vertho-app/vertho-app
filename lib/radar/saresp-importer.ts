/**
 * Cross-match heurístico SP→INEP por nome:
 *
 * Pre-carrega todas escolas com UF='SP' do diag_escolas. Pra cada linha
 * SARESP, normaliza o nome (remove acentos/títulos/prefixos), tokeniza e
 * computa Jaccard similarity contra cada escola candidata. Match único
 * com score >= 0.72 vira codigo_inep gravado.
 *
 * Limitações conhecidas:
 *  - Sem município/coordenadoria no CSV SARESP, todo nome compete com
 *    todas as 5.5k escolas SP. Threshold conservador evita falsos positivos.
 *  - Algumas escolas com nomes muito similares ficam ambíguas (não match).
 *  - Resolução completa requer tabela DE-PARA oficial — V1.5.
 */
function normalizarNome(nome: string): string {
  return String(nome || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\bESCOLA ESTADUAL\b/g, '')
    .replace(/\bE\.?\s?E\.?\b/g, '')
    .replace(/\bESCOLA\b/g, '')
    .replace(/\bPROFESSORA?\b/g, '')
    .replace(/\bPROFA?\.?\b/g, '')
    .replace(/\bDOUTORA?\b/g, '')
    .replace(/\bDR\.?\b/g, '')
    .replace(/\bDRA\.?\b/g, '')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(s: string): Set<string> {
  return new Set(s.split(/\s+/).filter((t) => t.length >= 3));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union > 0 ? inter / union : 0;
}

type SpEscolaCandidate = {
  codigo_inep: string;
  nome: string;
  tokens: Set<string>;
};

async function loadSpEscolas(sb: any): Promise<SpEscolaCandidate[]> {
  // Limit alto pra cobrir todas escolas SP (~5.5k estaduais + outras)
  const { data, error } = await sb
    .from('diag_escolas')
    .select('codigo_inep, nome')
    .eq('uf', 'SP')
    .limit(20000);
  if (error || !data) return [];
  return data.map((e: any) => ({
    codigo_inep: e.codigo_inep,
    nome: e.nome,
    tokens: tokenize(normalizarNome(e.nome)),
  }));
}

function bestInepMatch(sarespNome: string, candidates: SpEscolaCandidate[]): string | null {
  const tokens = tokenize(normalizarNome(sarespNome));
  if (tokens.size < 1) return null;

  let bestScore = 0;
  let bestInep: string | null = null;
  let secondScore = 0;

  for (const c of candidates) {
    const s = jaccard(tokens, c.tokens);
    if (s > bestScore) {
      secondScore = bestScore;
      bestScore = s;
      bestInep = c.codigo_inep;
    } else if (s > secondScore) {
      secondScore = s;
    }
  }

  // Match único: score alto E gap suficiente entre 1º e 2º (evita ambíguos)
  if (bestScore >= 0.72 && (bestScore - secondScore) >= 0.05) return bestInep;
  // Match exato fingerprint: score 1.0 sempre vence
  if (bestScore >= 0.95) return bestInep;
  return null;
}

/**
 * Importador SARESP (Seduc-SP) — formato oficial 2025.
 *
 * Header real (ponto-e-vírgula):
 *   DEPADM;DepBol;NomeDepBol;codRMet;CODESC;NOMESC;SERIE_ANO;
 *   cod_per;periodo;co_comp;ds_comp;medprof
 *
 * Particularidade: `CODESC` é o **código SP estadual** (5-6 dígitos),
 * NÃO o INEP de 8 dígitos. A correlação com `diag_escolas` exige tabela
 * DE-PARA SP→INEP (V1.5). Por enquanto, gravamos pelo `codigo_sp`.
 *
 * Outros tópicos:
 *   - Não há "ANO" no CSV — extraído do nome do arquivo (ex: 2025) ou
 *     fornecido via opts.ano
 *   - Não há distribuição por nível, só `medprof` (proficiência média)
 *   - Não há total de alunos
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

function parseSerieAno(raw: any): number | null {
  // "9º Ano EF" → 9 / "5º Ano EF" → 5 / "3ª Série EM" → 12 / "7º Ano EF" → 7
  const s = String(raw || '').toUpperCase();
  const m = s.match(/(\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  if (s.includes('EM') || s.includes('MÉDIO') || s.includes('MEDIO')) {
    // 3ª Série EM = 12 (convenção interna nossa para segregar etapa)
    return n === 3 ? 12 : n + 9;
  }
  return n;
}

function parseDisciplina(raw: any): 'lp' | 'mat' | 'cn' | 'ch' | string {
  const s = String(raw || '').toLowerCase().trim();
  if (s.includes('port') || s.includes('lp') || s.includes('língua') || s.includes('lingua')) return 'lp';
  if (s.includes('mat')) return 'mat';
  if (s.includes('ciência') || s.includes('ciencia') || s.startsWith('cn') || s.includes('natur')) return 'cn';
  if (s.includes('human') || s.startsWith('ch') || s.includes('história') || s.includes('geografia')) return 'ch';
  return s.slice(0, 8);
}

function parseRede(raw: any): string | null {
  const s = String(raw || '').toLowerCase().trim();
  if (!s) return null;
  if (s.includes('estadual')) return 'ESTADUAL';
  if (s.includes('municipal')) return 'MUNICIPAL';
  if (s.includes('federal')) return 'FEDERAL';
  if (s.includes('priv')) return 'PRIVADA';
  return s.toUpperCase().slice(0, 30);
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

function shouldReplaceSarespRow(prev: any, next: any): boolean {
  const prevTurno = String(prev?.turno || '').toUpperCase();
  const nextTurno = String(next?.turno || '').toUpperCase();
  if (prevTurno !== 'GERAL' && nextTurno === 'GERAL') return true;
  return false;
}

/** Tenta deduzir ano do nome do arquivo (ex: "...2025_0.csv" → 2025). */
export function anoFromFilename(filename: string | undefined | null): number | null {
  if (!filename) return null;
  const m = filename.match(/(\d{4})/);
  if (m) {
    const y = Number(m[1]);
    if (y >= 2010 && y <= 2030) return y;
  }
  return null;
}

export async function importarSarespCsv(
  text: string,
  opts: { ingestRunId: string; ano?: number; arquivoNome?: string } = { ingestRunId: '' },
): Promise<IngestResult & { matchedInep: number }> {
  const sb = createSupabaseAdmin();
  const result: IngestResult & { matchedInep: number } = {
    totalProcessado: 0, totalSucesso: 0, totalFalha: 0, totalSkipped: 0, erros: [], matchedInep: 0,
  };

  const anoBase = opts.ano || anoFromFilename(opts.arquivoNome) || new Date().getFullYear();

  const rows = parseCsv(text);
  if (!rows.length) {
    result.erros.push({ key: 'parse', msg: 'CSV vazio ou sem header' });
    result.totalFalha = 1;
    return result;
  }

  // Pré-carrega candidatos SP pra cross-match heurístico
  const spEscolas = await loadSpEscolas(sb);
  // Cache de resoluções por codigo_sp (evita recomputar pra mesma escola)
  const inepBySp = new Map<string, string | null>();

  const rowsToInsert: any[] = [];
  const batchKeyIndex = new Map<string, number>();

  for (const r of rows) {
    result.totalProcessado++;

    // Suporta tanto formato oficial (CODESC) quanto microdados (CO_ESCOLA)
    const codigoSp = String(pick(r, ['CODESC', 'codesc', 'CO_ESCOLA', 'codigo_sp']) || '').trim();
    const codigoInep = String(pick(r, ['CODIGO_INEP', 'INEP']) || '').trim() || null;
    const ano = Number(pick(r, ['ANO', 'NU_ANO'])) || anoBase;
    const serieRaw = pick(r, ['SERIE_ANO', 'serie', 'SERIE', 'NU_ANO_SERIE']);
    const serie = parseSerieAno(serieRaw);
    const discRaw = pick(r, ['ds_comp', 'DS_COMP', 'DISCIPLINA', 'NO_DISCIPLINA']);
    const disciplina = parseDisciplina(discRaw);

    if (!codigoSp || !Number.isFinite(ano) || !Number.isFinite(serie as number) || !disciplina) {
      result.totalSkipped++;
      continue;
    }

    const proficiencia = toNum(pick(r, ['medprof', 'MEDPROF', 'PROFICIENCIA_MEDIA', 'NU_PROFICIENCIA']));
    const totalAlunos = toNum(pick(r, ['TOTAL_ALUNOS', 'NU_ALUNOS', 'QT_ALUNOS', 'qt_alunos']));

    const dist: Record<string, number> = {};
    const ab = toNum(pick(r, ['PCT_ABAIXO_BASICO', 'ABAIXO_BASICO']));
    const ba = toNum(pick(r, ['PCT_BASICO', 'BASICO']));
    const ad = toNum(pick(r, ['PCT_ADEQUADO', 'ADEQUADO']));
    const av = toNum(pick(r, ['PCT_AVANCADO', 'AVANCADO']));
    if (ab != null) dist.abaixo_basico = ab;
    if (ba != null) dist.basico = ba;
    if (ad != null) dist.adequado = ad;
    if (av != null) dist.avancado = av;

    const escolaNome = String(pick(r, ['NOMESC', 'nomesc', 'NO_ESCOLA']) || '').trim() || null;

    // Cross-match heurístico SP→INEP por nome (1 lookup por escola única)
    let inepResolved: string | null = codigoInep && codigoInep.length === 8 ? codigoInep : null;
    if (!inepResolved && escolaNome && spEscolas.length > 0) {
      if (inepBySp.has(codigoSp)) {
        inepResolved = inepBySp.get(codigoSp) || null;
      } else {
        inepResolved = bestInepMatch(escolaNome, spEscolas);
        inepBySp.set(codigoSp, inepResolved);
        if (inepResolved) result.matchedInep++;
      }
    }

    const rowToInsert = {
      codigo_sp: codigoSp,
      codigo_inep: inepResolved,
      escola_nome: escolaNome,
      dep_administrativa: String(pick(r, ['NomeDepBol', 'DEPADM', 'NomeDep', 'DEP']) || '').trim() || null,
      rede: parseRede(pick(r, ['NomeDepBol', 'DEPADM', 'rede'])),
      turno: String(pick(r, ['periodo', 'turno', 'TURNO']) || '').trim() || null,
      ano,
      serie: serie!,
      disciplina,
      proficiencia_media: proficiencia,
      distribuicao_niveis: dist,
      total_alunos: totalAlunos != null ? Math.round(totalAlunos) : null,
      ingest_run_id: opts.ingestRunId || null,
      atualizado_em: new Date().toISOString(),
    };

    const batchKey = `${rowToInsert.codigo_sp}|${rowToInsert.ano}|${rowToInsert.serie}|${rowToInsert.disciplina}`;
    const existingIndex = batchKeyIndex.get(batchKey);
    if (existingIndex != null) {
      if (shouldReplaceSarespRow(rowsToInsert[existingIndex], rowToInsert)) {
        rowsToInsert[existingIndex] = rowToInsert;
      }
      continue;
    }
    batchKeyIndex.set(batchKey, rowsToInsert.length);
    rowsToInsert.push(rowToInsert);

    if (rowsToInsert.length >= 200) {
      const { error } = await sb
        .from('diag_saresp_snapshots')
        .upsert(rowsToInsert, { onConflict: 'codigo_sp,ano,serie,disciplina' });
      if (error) {
        result.totalFalha += rowsToInsert.length;
        result.erros.push({ key: 'batch', msg: error.message });
      } else {
        result.totalSucesso += rowsToInsert.length;
      }
      rowsToInsert.length = 0;
      batchKeyIndex.clear();
    }
  }

  if (rowsToInsert.length > 0) {
    const { error } = await sb
      .from('diag_saresp_snapshots')
      .upsert(rowsToInsert, { onConflict: 'codigo_sp,ano,serie,disciplina' });
    if (error) {
      result.totalFalha += rowsToInsert.length;
      result.erros.push({ key: 'batch', msg: error.message });
    } else {
      result.totalSucesso += rowsToInsert.length;
    }
  }

  return result;
}
