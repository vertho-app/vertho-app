/**
 * Roda o Score de Oportunidade Vertho em lote (standalone, service role).
 * A lógica de resolução (CNAE 3-vias, nome bloqueado, ScoreInput, teto)
 * vive em lib/radarempresas/score-resolve.ts — FONTE ÚNICA, compartilhada
 * com o pipeline BR (data-pipeline/radarempresas/br). Zero divergência.
 *
 * Este script só faz o IO Supabase + o contexto setorial de Jundiaí
 * (CAGED÷RAIS bayesiano) e o priority_rank (percentil entre elegíveis).
 *
 * Uso: npx tsx scripts/radarempresas-score.ts
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { SCORING_VERSION } from '../lib/radarempresas/score';
import {
  scoreEstab, type CnaeRegra, type ContextoLookup,
} from '../lib/radarempresas/score-resolve';
import { calcularPriorityRank } from '../lib/radarempresas/priority-rank';

const env = readFileSync('.env.local', 'utf8').split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a: any, l) => { const i = l.indexOf('='); if (i > 0) a[l.slice(0, i).trim()] = l.slice(i + 1).trim(); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function main() {
const { data: job } = await sb.from('radarempresas_jobs')
  .insert({ job_type: 'score', status: 'running', source_version: SCORING_VERSION })
  .select('id').single();
const jobId = (job as any)?.id;

const { data: mapa } = await sb.from('radarempresas_cnae_segmento')
  .select('cnae_prefixo, prefixo_len, segmento_key, people_intensity_score, leadership_complexity_score, onboarding_need_score, standardization_need_score, commercial_fit_score, is_priority')
  .order('prefixo_len', { ascending: false });
const { data: denyRaw } = await sb.from('radarempresas_cnae_denylist')
  .select('cnae_prefixo').order('prefixo_len', { ascending: false });
const denySet = (denyRaw || []).map((d: any) => ({ p: d.cnae_prefixo }));
const { data: segTeto } = await sb.from('radarempresas_segmentos')
  .select('key, classificacao_teto').not('classificacao_teto', 'is', null);
const tetoMap = new Map<string, string>((segTeto || []).map((s: any) => [s.key, s.classificacao_teto]));
console.log(`Allowlist: ${mapa?.length} regras · Denylist: ${denySet.length} prefixos · Tetos: ${tetoMap.size}`);

// Empresas (capital/porte/razão) por cnpj_basico
const empMap = new Map<string, any>();
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from('radarempresas_empresas')
    .select('cnpj_basico, capital_social, porte_empresa, razao_social')
    .order('cnpj_basico').range(from, from + 999);
  // Falha ALTO: este mapa alimenta porte e capital de TODO estabelecimento. Uma
  // pagina perdida em silencio pontua mil empresas como se nao tivessem porte
  // nem capital, e o job fecha "done" com 93.710 scores errados.
  if (error) throw new Error(`radarempresas_empresas (offset ${from}): ${error.message}`);
  if (!data?.length) break;
  for (const e of data as any[]) empMap.set(e.cnpj_basico, e);
  if (data.length < 1000) break;
}
console.log(`Empresas: ${empMap.size}`);

// Contexto CAGED÷RAIS de Jundiaí (352590), rotatividade real bayesiana:
//  - piso estoque RAIS >= 30 e movimentação CAGED >= 10 p/ confiança alta
//  - suavização bayesiana: (mov + α·média_global)/(estoque + α), α=30
//  - winsorização em 1.5; normaliza por percentil; guarda confiança
const ALPHA = 30, CAP = 1.5, PISO_EST = 30, PISO_MOV = 10;
const cagedCtx = new Map<string, number>();
const ctxConf = new Map<string, 'alta' | 'media' | 'baixa'>();
const raisTam = new Map<string, number>();
{
  const [{ data: cg }, { data: rs }] = await Promise.all([
    sb.from('radarempresas_caged_municipio_cnae_6m')
      .select('cnae, admissoes_6m, desligamentos_6m').eq('municipio_ibge', '352590'),
    sb.from('radarempresas_rais_estab_municipio_cnae')
      .select('cnae, estoque_vinculos, tam_medio_estimado').eq('municipio_ibge', '352590'),
  ]);
  const rais = new Map<string, { estoque: number; tam: number }>();
  for (const r of (rs || []) as any[]) {
    const k = String(r.cnae).replace(/\D/g, '');
    rais.set(k, { estoque: r.estoque_vinculos || 0, tam: r.tam_medio_estimado || 0 });
    if (r.tam_medio_estimado != null) raisTam.set(k, r.tam_medio_estimado);
  }
  const robustos: number[] = [];
  for (const c of (cg || []) as any[]) {
    const rr = rais.get(String(c.cnae).replace(/\D/g, ''));
    const mov = (c.admissoes_6m || 0) + (c.desligamentos_6m || 0);
    if (rr && rr.estoque >= PISO_EST && mov >= PISO_MOV) robustos.push(mov / rr.estoque);
  }
  const mediaGlobal = robustos.length
    ? robustos.reduce((a, b) => a + b, 0) / robustos.length : 0.3;
  const raw: { cnae: string; val: number }[] = [];
  for (const c of (cg || []) as any[]) {
    const cnae = String(c.cnae).replace(/\D/g, '');
    const mov = (c.admissoes_6m || 0) + (c.desligamentos_6m || 0);
    const rr = rais.get(cnae);
    let val: number;
    if (rr && rr.estoque > 0) {
      val = Math.min((mov + ALPHA * mediaGlobal) / (rr.estoque + ALPHA), CAP);
      const robusto = rr.estoque >= PISO_EST && mov >= PISO_MOV;
      const meio = rr.estoque >= PISO_EST || mov >= PISO_MOV;
      ctxConf.set(cnae, robusto ? 'alta' : meio ? 'media' : 'baixa');
    } else {
      val = Math.min(mov / 1000, CAP);
      ctxConf.set(cnae, 'baixa');
    }
    raw.push({ cnae, val });
  }
  raw.sort((a, b) => a.val - b.val);
  const n = raw.length;
  raw.forEach((r, idx) => cagedCtx.set(r.cnae, n > 1 ? Math.round((idx / (n - 1)) * 100) : 50));
  console.log(`Contexto v4 Jundiaí: ${n} CNAEs · ${rais.size} c/ RAIS · média global ${mediaGlobal.toFixed(3)}`);
}
const ctx: ContextoLookup = (k) => ({
  caged_contexto_score: cagedCtx.get(k) ?? null,
  contexto_confianca: ctxConf.get(k) ?? null,
  rais_tam_medio_setor: raisTam.get(k) ?? null,
});

// Multiunidade: nº estab por cnpj_basico
const grupo = new Map<string, number>();
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from('radarempresas_estabelecimentos')
    .select('cnpj_basico').order('id').range(from, from + 999);
  // Daqui sai `qtd_estabelecimentos_grupo`: pagina perdida = rede contada como
  // unidade unica, e isso muda o score.
  if (error) throw new Error(`contagem de estabelecimentos (offset ${from}): ${error.message}`);
  if (!data?.length) break;
  for (const r of data as any[]) grupo.set(r.cnpj_basico, (grupo.get(r.cnpj_basico) || 0) + 1);
  if (data.length < 1000) break;
}

let semSeg = 0, err = 0;
const t0 = Date.now();
const allRows: any[] = [];
const elegiveis: { id: string; score: number }[] = [];
for (let from = 0; ; from += 500) {
  const { data: ests, error: errEst } = await sb.from('radarempresas_estabelecimentos')
    .select('id, cnpj_basico, cnpj_completo, is_matriz, cnae_principal, has_email, has_phone, has_fantasia, company_age_years')
    .order('id').range(from, from + 499);
  // A varredura principal: parar aqui em silencio nao "processa menos", ele
  // grava um percentil calculado sobre uma amostra e chama de ranking.
  if (errEst) throw new Error(`estabelecimentos (offset ${from}): ${errEst.message}`);
  if (!ests?.length) break;

  for (const est of ests as any[]) {
    const emp = empMap.get(est.cnpj_basico) || {};
    const row = scoreEstab({
      estabelecimento_id: est.id,
      cnpj_completo: est.cnpj_completo,
      cnpj_basico: est.cnpj_basico,
      cnae_principal: est.cnae_principal,
      is_matriz: !!est.is_matriz,
      has_email: !!est.has_email,
      has_phone: !!est.has_phone,
      has_fantasia: !!est.has_fantasia,
      company_age_years: est.company_age_years,
      qtd_estabelecimentos_grupo: grupo.get(est.cnpj_basico) || 1,
      porte_empresa: emp.porte_empresa ?? null,
      capital_social: emp.capital_social ?? null,
      razao_social: emp.razao_social ?? null,
    }, (mapa || []) as CnaeRegra[], denySet, tetoMap, ctx);

    if (row.segmento_key == null) semSeg++;
    if (row.elegivel) elegiveis.push({ id: est.id, score: row.score_total });
    allRows.push({
      estabelecimento_id: row.estabelecimento_id, cnpj_completo: row.cnpj_completo,
      score_total: row.score_total, score_dor_pessoas: row.score_dor_pessoas,
      score_capacidade_compra: row.score_capacidade_compra, score_fit_vertho: row.score_fit_vertho,
      score_contexto_setorial: row.score_contexto_setorial, classificacao: row.classificacao,
      score_confidence: row.score_confidence,
      commercial_actionability: row.commercial_actionability,
      low_team_probability: row.low_team_probability,
      priority_rank: null,
      score_explanation: row.score_explanation,
      scoring_version: row.scoring_version, updated_at: new Date().toISOString(),
    });
  }
  if (ests.length < 500) break;
}

// priority_rank: percentil do score entre os ELEGÍVEIS (segmento + não-micro).
// 🔑 A conta vive em lib/radarempresas/priority-rank.ts — mesma fonte da action
// `rodarScores`. Era o último pedaço duplicado entre os dois, e por isso o B7
// (empate resolvido pela ordem de varredura) existia nos DOIS ao mesmo tempo.
// Quem de fato gravou as 74.285 linhas foi ESTE script: a action não tem
// chamador em tela nenhuma.
const ne = elegiveis.length;
const rankById = calcularPriorityRank(elegiveis);
for (const row of allRows) row.priority_rank = rankById.get(row.estabelecimento_id) ?? null;
console.log(`Priority rank: ${ne} elegíveis de ${allRows.length}`);

let proc = 0;
for (let i = 0; i < allRows.length; i += 1000) {
  const lote = allRows.slice(i, i + 1000);
  const { error } = await sb.from('radarempresas_scores').upsert(lote, { onConflict: 'estabelecimento_id' });
  if (error) { err += lote.length; console.error(error.message); } else proc += lote.length;
  if (proc % 10000 === 0) console.log(`  ${proc} gravados...`);
}

if (jobId) await sb.from('radarempresas_jobs').update({
  status: 'done', rows_processed: proc, rows_inserted: proc - err, rows_failed: err,
  finished_at: new Date().toISOString(),
}).eq('id', jobId);

console.log(`\n[OK] ${proc} scored, ${semSeg} excluídos (denylist), ${err} erros em ${Math.round((Date.now()-t0)/1000)}s`);

const { data: dist } = await sb.from('radarempresas_scores')
  .select('classificacao').limit(100000);
const d: any = {};
for (const r of (dist || []) as any[]) d[r.classificacao] = (d[r.classificacao] || 0) + 1;
console.log('Classificação:', d);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
