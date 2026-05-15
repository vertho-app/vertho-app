/**
 * Gera amostra pra validação manual comercial (ponto: "o teste mais
 * importante agora é comercial, não técnico").
 *
 * top 50 por segmento prioritário + 50 aleatório score alto →
 * outputs/radar-validacao.csv. O time classifica a coluna
 * avaliacao_manual: A (ótimo) / B (possível) / C (pouco provável) /
 * D (descartar). Meta: >=60% A/B nos top leads, senão recalibrar.
 *
 * Roda DEPOIS do score v4 (precisa priority_rank/confidence).
 * Uso: npx tsx scripts/radarempresas-amostra-validacao.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = readFileSync('.env.local', 'utf8').split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a: any, l) => { const i = l.indexOf('='); if (i > 0) a[l.slice(0, i).trim()] = l.slice(i + 1).trim(); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const SEGMENTOS = ['educacao_privada', 'saude_clinicas', 'varejo_especializado', 'servicos_b2b_pessoas'];
const COLS = ['segmento_alvo', 'cnpj', 'razao_social', 'nome_fantasia', 'municipio', 'cnae',
  'cnae_desc', 'score_total', 'classificacao', 'priority_rank', 'score_confidence',
  'actionability', 'avaliacao_manual'];

function csvLine(v: any[]) {
  return v.map(x => { const s = x == null ? '' : String(x); return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(';');
}

async function main() {
  const linhas: any[][] = [];

  async function topDoSegmento(seg: string, n: number, label: string) {
    // pega scores do segmento, ordenados por priority_rank desc
    const { data } = await sb.from('radarempresas_scores')
      .select('estabelecimento_id, cnpj_completo, score_total, classificacao, priority_rank, score_confidence, commercial_actionability, score_explanation')
      .not('priority_rank', 'is', null)
      .order('priority_rank', { ascending: false })
      .limit(3000);
    const doSeg = (data || []).filter((s: any) => s.score_explanation?.segmento_key === seg).slice(0, n);
    await anexar(doSeg, label);
  }

  async function anexar(scores: any[], label: string) {
    if (!scores.length) return;
    const ids = scores.map((s: any) => s.estabelecimento_id);
    const { data: ests } = await sb.from('radarempresas_estabelecimentos')
      .select('id, cnpj_completo, nome_fantasia, municipio_nome, cnae_principal, cnae_principal_desc, cnpj_basico').in('id', ids);
    const eMap = new Map((ests || []).map((e: any) => [e.id, e]));
    const basicos = [...new Set((ests || []).map((e: any) => e.cnpj_basico))];
    const { data: emps } = await sb.from('radarempresas_empresas').select('cnpj_basico, razao_social').in('cnpj_basico', basicos);
    const empMap = new Map((emps || []).map((e: any) => [e.cnpj_basico, e.razao_social]));
    for (const s of scores) {
      const e: any = eMap.get(s.estabelecimento_id); if (!e) continue;
      linhas.push([label, e.cnpj_completo, empMap.get(e.cnpj_basico) || '', e.nome_fantasia || '',
        e.municipio_nome || '', e.cnae_principal || '', e.cnae_principal_desc || '',
        s.score_total, s.classificacao, s.priority_rank, s.score_confidence,
        s.commercial_actionability, '']);
    }
  }

  for (const seg of SEGMENTOS) await topDoSegmento(seg, 50, `top50_${seg}`);

  // 50 aleatório score alto (qualquer segmento)
  const { data: altos } = await sb.from('radarempresas_scores')
    .select('estabelecimento_id, cnpj_completo, score_total, classificacao, priority_rank, score_confidence, commercial_actionability, score_explanation')
    .gte('score_total', 70).not('priority_rank', 'is', null).limit(2000);
  const shuffled = (altos || []).sort(() => Math.random() - 0.5).slice(0, 50);
  await anexar(shuffled, 'aleatorio_score_alto');

  mkdirSync('outputs', { recursive: true });
  const csv = ['# Classifique avaliacao_manual: A=ótimo B=possível C=pouco provável D=descartar',
    COLS.join(';'), ...linhas.map(csvLine)].join('\n');
  writeFileSync('outputs/radar-validacao.csv', '﻿' + csv, 'utf8');
  console.log(`[OK] outputs/radar-validacao.csv — ${linhas.length} linhas pra classificação manual`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
