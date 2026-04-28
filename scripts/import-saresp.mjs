#!/usr/bin/env node
/**
 * Importa CSV oficial SARESP por escola.
 *
 * Uso:
 *   node scripts/import-saresp.mjs "C:/dados/Proficiência do SARESP por escola de 2025_0.csv" --dry
 *   node scripts/import-saresp.mjs "C:/dados/Proficiência do SARESP por escola de 2025_0.csv"
 */

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const inputPath = args.find((arg) => !arg.startsWith('--'));
const has = (name) => args.includes(name);
const flag = (name, fallback = null) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};

const DRY = has('--dry');
const ANO = flag('--ano') ? Number(flag('--ano')) : null;
const BATCH_SIZE = Math.max(1, Number(flag('--batch-size', '500')));

if (!inputPath) {
  console.error('ERRO: informe o CSV SARESP.');
  process.exit(1);
}

const env = loadEnv();
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('ERRO: configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const filename = basename(inputPath);
const anoBase = ANO || anoFromFilename(filename) || new Date().getFullYear();
const text = readFileSync(inputPath, 'utf-8').replace(/^\uFEFF/, '');
const rows = parseCsv(text);
const result = { totalProcessado: 0, totalSucesso: 0, totalFalha: 0, totalSkipped: 0, totalDedup: 0, erros: [] };
const byKey = new Map();

console.log(DRY ? '== DRY RUN SARESP ==' : '== IMPORT SARESP ==');
console.log(`arquivo: ${inputPath}`);
console.log(`ano: ${anoBase}`);
console.log(`linhas CSV: ${rows.length}`);

// Pré-carrega escolas SP pra cross-match heurístico SP→INEP
console.log('Carregando escolas SP (cross-match)...');
const spEscolas = await loadSpEscolas();
console.log(`  ${spEscolas.length} candidatas carregadas`);
const inepBySp = new Map();
let matchedInep = 0;
console.log('');

for (const r of rows) {
  result.totalProcessado++;
  const codigoSp = String(pick(r, ['CODESC', 'codesc', 'CO_ESCOLA', 'codigo_sp']) || '').trim();
  const ano = Number(pick(r, ['ANO', 'NU_ANO'])) || anoBase;
  const serie = parseSerieAno(pick(r, ['SERIE_ANO', 'serie', 'SERIE', 'NU_ANO_SERIE']));
  const disciplina = parseDisciplina(pick(r, ['ds_comp', 'DS_COMP', 'DISCIPLINA', 'NO_DISCIPLINA']));
  if (!codigoSp || !Number.isFinite(ano) || !Number.isFinite(serie) || !disciplina) {
    result.totalSkipped++;
    continue;
  }

  const escolaNome = String(pick(r, ['NOMESC', 'nomesc', 'NO_ESCOLA']) || '').trim() || null;

  // Cross-match cache por codigo_sp (cada escola aparece em N linhas:
  // série × disciplina × turno; só recompute uma vez)
  let inepResolved = null;
  if (escolaNome) {
    if (inepBySp.has(codigoSp)) {
      inepResolved = inepBySp.get(codigoSp);
    } else {
      inepResolved = bestInepMatch(escolaNome, spEscolas);
      inepBySp.set(codigoSp, inepResolved);
      if (inepResolved) matchedInep++;
    }
  }

  const row = {
    codigo_sp: codigoSp,
    codigo_inep: inepResolved,
    escola_nome: escolaNome,
    dep_administrativa: String(pick(r, ['NomeDepBol', 'DEPADM', 'NomeDep', 'DEP']) || '').trim() || null,
    rede: parseRede(pick(r, ['NomeDepBol', 'DEPADM', 'rede'])),
    turno: String(pick(r, ['periodo', 'turno', 'TURNO']) || '').trim() || null,
    ano,
    serie,
    disciplina,
    proficiencia_media: toNum(pick(r, ['medprof', 'MEDPROF', 'PROFICIENCIA_MEDIA', 'NU_PROFICIENCIA'])),
    distribuicao_niveis: {},
    total_alunos: null,
    atualizado_em: new Date().toISOString(),
  };
  const key = `${row.codigo_sp}|${row.ano}|${row.serie}|${row.disciplina}`;
  if (byKey.has(key)) {
    result.totalDedup++;
    if (shouldReplace(byKey.get(key), row)) byKey.set(key, row);
  } else {
    byKey.set(key, row);
  }
}

const normalized = Array.from(byKey.values());
if (DRY) {
  console.log(JSON.stringify(normalized.slice(0, 5), null, 2));
  console.log('');
  console.log(`normalizados: ${normalized.length} dedup:${result.totalDedup} skip:${result.totalSkipped}`);
  process.exit(0);
}

for (let i = 0; i < normalized.length; i += BATCH_SIZE) {
  const batch = normalized.slice(i, i + BATCH_SIZE);
  const { error } = await sb.from('diag_saresp_snapshots')
    .upsert(batch, { onConflict: 'codigo_sp,ano,serie,disciplina' });
  if (error) {
    result.totalFalha += batch.length;
    if (result.erros.length < 20) result.erros.push({ key: `batch_${i}`, msg: error.message });
  } else {
    result.totalSucesso += batch.length;
  }
}

console.log(`processadas:${result.totalProcessado} normalizadas:${normalized.length} ok:${result.totalSucesso} falha:${result.totalFalha} skip:${result.totalSkipped} dedup:${result.totalDedup}`);
console.log(`cross-match SP→INEP: ${matchedInep} escolas únicas resolvidas (de ${inepBySp.size} tentadas)`);
if (result.erros.length) {
  console.log('erros:');
  for (const e of result.erros) console.log(`- ${e.key}: ${e.msg}`);
}

function pick(row, names) {
  for (const n of names) {
    const v = row[n] ?? row[n.toUpperCase()] ?? row[n.toLowerCase()];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return null;
}

function toNum(v) {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(',', '.').trim());
  return Number.isFinite(n) ? n : null;
}

function parseSerieAno(raw) {
  const s = String(raw || '').toUpperCase();
  const m = s.match(/(\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  if (s.includes('EM') || s.includes('MEDIO') || s.includes('MÉDIO')) return n === 3 ? 12 : n + 9;
  return n;
}

function parseDisciplina(raw) {
  const s = String(raw || '').toLowerCase().trim();
  if (s.includes('port') || s.includes('lp') || s.includes('língua') || s.includes('lingua')) return 'lp';
  if (s.includes('mat')) return 'mat';
  if (s.includes('ciência') || s.includes('ciencia') || s.startsWith('cn') || s.includes('natur')) return 'cn';
  if (s.includes('human') || s.startsWith('ch') || s.includes('história') || s.includes('geografia')) return 'ch';
  return s.slice(0, 8);
}

function parseRede(raw) {
  const s = String(raw || '').toLowerCase().trim();
  if (!s) return null;
  if (s.includes('estadual')) return 'ESTADUAL';
  if (s.includes('municipal')) return 'MUNICIPAL';
  if (s.includes('federal')) return 'FEDERAL';
  if (s.includes('priv')) return 'PRIVADA';
  return s.toUpperCase().slice(0, 30);
}

function parseCsv(csvText) {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const sep = lines[0].split(';').length > lines[0].split(',').length ? ';' : ',';
  const header = splitRow(lines[0], sep).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = splitRow(line, sep);
    const row = {};
    header.forEach((h, i) => { row[h] = (cells[i] || '').trim(); });
    return row;
  });
}

function splitRow(line, sep) {
  const out = [];
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

function shouldReplace(prev, next) {
  return String(prev?.turno || '').toUpperCase() !== 'GERAL'
    && String(next?.turno || '').toUpperCase() === 'GERAL';
}

function anoFromFilename(name) {
  const m = String(name || '').match(/(\d{4})/);
  if (!m) return null;
  const y = Number(m[1]);
  return y >= 2010 && y <= 2030 ? y : null;
}

// ── Cross-match SP→INEP (Jaccard similarity por tokens normalizados) ──
async function loadSpEscolas() {
  const out = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await sb.from('diag_escolas')
      .select('codigo_inep, nome')
      .eq('uf', 'SP')
      .order('codigo_inep')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    for (const e of data) {
      out.push({ codigo_inep: e.codigo_inep, nome: e.nome, tokens: tokenize(normalizarNome(e.nome)) });
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

function normalizarNome(nome) {
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
    .replace(/\s+/g, ' ').trim();
}

function tokenize(s) {
  return new Set(s.split(/\s+/).filter((t) => t.length >= 3));
}

function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union > 0 ? inter / union : 0;
}

function bestInepMatch(nome, candidates) {
  const tokens = tokenize(normalizarNome(nome));
  if (tokens.size < 1) return null;
  let bestScore = 0, secondScore = 0, bestInep = null;
  for (const c of candidates) {
    const s = jaccard(tokens, c.tokens);
    if (s > bestScore) { secondScore = bestScore; bestScore = s; bestInep = c.codigo_inep; }
    else if (s > secondScore) secondScore = s;
  }
  if (bestScore >= 0.72 && bestScore - secondScore >= 0.05) return bestInep;
  if (bestScore >= 0.95) return bestInep;
  return null;
}

function loadEnv() {
  const envPath = new URL('../.env.local', import.meta.url);
  const env = {};
  try {
    Object.assign(env, Object.fromEntries(
      readFileSync(envPath, 'utf-8')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'))
        .map((line) => {
          const i = line.indexOf('=');
          return [line.slice(0, i), line.slice(i + 1).replace(/^["']|["']$/g, '')];
        }),
    ));
  } catch {}
  return {
    ...env,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY,
  };
}
