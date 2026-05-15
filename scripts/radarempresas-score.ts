/**
 * Roda o Score de Oportunidade Vertho em lote (standalone, service role).
 * Mesma lógica de actions/radarempresas/scoring.ts mas sem
 * requireAdminSupabase (que exige cookies de admin). Reusa o motor
 * calcularScore de lib/radarempresas/score.ts — zero divergência.
 *
 * Uso: npx tsx scripts/radarempresas-score.ts
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { calcularScore, SCORING_VERSION, type ScoreInput } from '../lib/radarempresas/score';

const env = readFileSync('.env.local', 'utf8').split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a: any, l) => { const i = l.indexOf('='); if (i > 0) a[l.slice(0, i).trim()] = l.slice(i + 1).trim(); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function matchSegmento(cnae: string | null, mapa: any[]) {
  if (!cnae) return null;
  const c = cnae.replace(/\D/g, '');
  for (const m of mapa) if (c.startsWith(m.cnae_prefixo)) return m;
  return null;
}

async function main() {
const { data: job } = await sb.from('radarempresas_jobs')
  .insert({ job_type: 'score', status: 'running', source_version: SCORING_VERSION })
  .select('id').single();
const jobId = (job as any)?.id;

const { data: mapa } = await sb.from('radarempresas_cnae_segmento')
  .select('cnae_prefixo, prefixo_len, segmento_key, people_intensity_score, leadership_complexity_score, onboarding_need_score, standardization_need_score, commercial_fit_score, is_priority')
  .order('prefixo_len', { ascending: false });
console.log(`Mapa CNAE→segmento: ${mapa?.length} regras`);

// Empresas (capital/porte) por cnpj_basico
const empMap = new Map<string, any>();
for (let from = 0; ; from += 1000) {
  const { data } = await sb.from('radarempresas_empresas')
    .select('cnpj_basico, capital_social, porte_empresa').range(from, from + 999);
  if (!data?.length) break;
  for (const e of data as any[]) empMap.set(e.cnpj_basico, e);
  if (data.length < 1000) break;
}
console.log(`Empresas: ${empMap.size}`);

// Contexto CAGED: intensidade de movimentação por CNAE em Jundiaí (352590),
// normalizada por percentil dentro do recorte (0-100). CNAE que mais
// movimenta pessoas no município → contexto alto → +dor.
const cagedCtx = new Map<string, number>();
{
  const [{ data: cg }, { data: rs }] = await Promise.all([
    sb.from('radarempresas_caged_municipio_cnae_6m')
      .select('cnae, admissoes_6m, desligamentos_6m').eq('municipio_ibge', '352590'),
    sb.from('radarempresas_rais_estab_municipio_cnae')
      .select('cnae, estoque_vinculos, tam_medio_estimado').eq('municipio_ibge', '352590'),
  ]);
  const rais = new Map<string, { estoque: number; tam: number }>();
  for (const r of (rs || []) as any[]) {
    rais.set(String(r.cnae).replace(/\D/g, ''), { estoque: r.estoque_vinculos || 0, tam: r.tam_medio_estimado || 0 });
  }
  // Taxa de rotatividade REAL = mov CAGED 6m ÷ estoque RAIS, ajustada por
  // porte. Fallback v2 (volume CAGED puro) quando falta estoque RAIS.
  const raw: { cnae: string; val: number }[] = [];
  for (const c of (cg || []) as any[]) {
    const cnae = String(c.cnae).replace(/\D/g, '');
    const mov = (c.admissoes_6m || 0) + (c.desligamentos_6m || 0);
    const rr = rais.get(cnae);
    let val: number;
    if (rr && rr.estoque > 0) {
      val = mov / rr.estoque;
      if (rr.tam > 0 && rr.tam < 5) val *= 0.5;   // setor de micro → menos dor estruturada
    } else {
      val = mov / 1000;                           // fallback: proxy de volume
    }
    raw.push({ cnae, val });
  }
  raw.sort((a, b) => a.val - b.val);
  const n = raw.length;
  raw.forEach((r, idx) => cagedCtx.set(r.cnae, n > 1 ? Math.round((idx / (n - 1)) * 100) : 50));
  console.log(`Contexto v3 (rotatividade real) Jundiaí: ${n} CNAEs · ${rais.size} com estoque RAIS`);
}

// Multiunidade: nº estab por cnpj_basico
const grupo = new Map<string, number>();
for (let from = 0; ; from += 1000) {
  const { data } = await sb.from('radarempresas_estabelecimentos')
    .select('cnpj_basico').range(from, from + 999);
  if (!data?.length) break;
  for (const r of data as any[]) grupo.set(r.cnpj_basico, (grupo.get(r.cnpj_basico) || 0) + 1);
  if (data.length < 1000) break;
}

let proc = 0, semSeg = 0, err = 0;
const t0 = Date.now();
for (let from = 0; ; from += 500) {
  const { data: ests } = await sb.from('radarempresas_estabelecimentos')
    .select('id, cnpj_basico, cnpj_completo, is_matriz, cnae_principal, has_email, has_phone, company_age_years')
    .range(from, from + 499);
  if (!ests?.length) break;

  const rows = (ests as any[]).map(est => {
    const seg = matchSegmento(est.cnae_principal, mapa || []);
    if (!seg) semSeg++;
    const emp = empMap.get(est.cnpj_basico) || {};
    const input: ScoreInput = {
      porte_empresa: emp.porte_empresa ?? null,
      capital_social: emp.capital_social ?? null,
      is_matriz: !!est.is_matriz,
      company_age_years: est.company_age_years,
      has_email: !!est.has_email,
      has_phone: !!est.has_phone,
      qtd_estabelecimentos_grupo: grupo.get(est.cnpj_basico) || 1,
      segmento_key: seg?.segmento_key || null,
      people_intensity_score: seg?.people_intensity_score ?? 30,
      leadership_complexity_score: seg?.leadership_complexity_score ?? 30,
      onboarding_need_score: seg?.onboarding_need_score ?? 30,
      standardization_need_score: seg?.standardization_need_score ?? 30,
      commercial_fit_score: seg?.commercial_fit_score ?? 25,
      is_priority_cnae: seg?.is_priority ?? false,
      caged_contexto_score: cagedCtx.get(String(est.cnae_principal || '').replace(/\D/g, '')) ?? null,
    };
    const r = calcularScore(input);
    return {
      estabelecimento_id: est.id, cnpj_completo: est.cnpj_completo,
      score_total: r.score_total, score_dor_pessoas: r.score_dor_pessoas,
      score_capacidade_compra: r.score_capacidade_compra, score_fit_vertho: r.score_fit_vertho,
      score_contexto_setorial: r.score_contexto_setorial, classificacao: r.classificacao,
      score_explanation: { ...r.explanation, segmento_key: input.segmento_key },
      scoring_version: SCORING_VERSION, updated_at: new Date().toISOString(),
    };
  });

  const { error } = await sb.from('radarempresas_scores').upsert(rows, { onConflict: 'estabelecimento_id' });
  if (error) { err += rows.length; console.error(error.message); } else proc += rows.length;
  if (proc % 10000 === 0) console.log(`  ${proc} scored...`);
  if (ests.length < 500) break;
}

if (jobId) await sb.from('radarempresas_jobs').update({
  status: 'done', rows_processed: proc, rows_inserted: proc - err, rows_failed: err,
  finished_at: new Date().toISOString(),
}).eq('id', jobId);

console.log(`\n[OK] ${proc} scored, ${semSeg} sem segmento, ${err} erros em ${Math.round((Date.now()-t0)/1000)}s`);

// Distribuição
const { data: dist } = await sb.from('radarempresas_scores')
  .select('classificacao').limit(100000);
const d: any = {};
for (const r of (dist || []) as any[]) d[r.classificacao] = (d[r.classificacao] || 0) + 1;
console.log('Classificação:', d);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
