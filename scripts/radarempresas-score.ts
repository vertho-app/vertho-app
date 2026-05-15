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

// Pesos do "aderente genérico" (fallback híbrido): medianos.
const GENERICO = {
  segmento_key: 'generico', people_intensity_score: 55,
  leadership_complexity_score: 55, onboarding_need_score: 55,
  standardization_need_score: 55, commercial_fit_score: 50, is_priority: false,
};

// Razão social que indica PJ unipessoal / holding (não tem equipe):
// consultoria ou participações no nome → excluído, independente do CNAE
// (pega casos disfarçados em CNAE de educação/saúde).
function nomeBloqueado(razao: string | null | undefined): boolean {
  const r = (razao || '').toUpperCase();
  return /\bCONSULTORIA\b/.test(r) || /PARTICIPAC/.test(r);
}

// 3 vias: allowlist curada → genérico → excluído (denylist).
function classificarCnae(cnae: string | null, mapa: any[], denySet: { p: string }[]) {
  if (!cnae) return { tipo: 'excluido' as const, seg: null };
  const c = cnae.replace(/\D/g, '');
  for (const m of mapa) if (c.startsWith(m.cnae_prefixo)) return { tipo: 'curado' as const, seg: m };
  for (const d of denySet) if (c.startsWith(d.p)) return { tipo: 'excluido' as const, seg: null };
  return { tipo: 'generico' as const, seg: GENERICO };
}

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
console.log(`Allowlist: ${mapa?.length} regras · Denylist: ${denySet.length} prefixos`);

// Empresas (capital/porte) por cnpj_basico
const empMap = new Map<string, any>();
for (let from = 0; ; from += 1000) {
  const { data } = await sb.from('radarempresas_empresas')
    .select('cnpj_basico, capital_social, porte_empresa, razao_social').range(from, from + 999);
  if (!data?.length) break;
  for (const e of data as any[]) empMap.set(e.cnpj_basico, e);
  if (data.length < 1000) break;
}
console.log(`Empresas: ${empMap.size}`);

// Contexto CAGED: intensidade de movimentação por CNAE em Jundiaí (352590),
// normalizada por percentil dentro do recorte (0-100). CNAE que mais
// movimenta pessoas no município → contexto alto → +dor.
// v4: rotatividade real com travas estatísticas (lei dos pequenos números).
//  - piso estoque RAIS >= 30 e movimentação CAGED >= 10 p/ confiança alta
//  - suavização bayesiana: (mov + α·média_global)/(estoque + α), α=30
//  - cap (winsorização) em 1.5 (150% de rotatividade em 6m é teto)
//  - normaliza por percentil; guarda confiança por CNAE
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
  // média global robusta (só CNAEs com estoque e movimentação relevantes)
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
      // bayesiano: encolhe pro prior quando estoque pequeno
      val = Math.min((mov + ALPHA * mediaGlobal) / (rr.estoque + ALPHA), CAP);
      const robusto = rr.estoque >= PISO_EST && mov >= PISO_MOV;
      const meio = rr.estoque >= PISO_EST || mov >= PISO_MOV;
      ctxConf.set(cnae, robusto ? 'alta' : meio ? 'media' : 'baixa');
    } else {
      val = Math.min(mov / 1000, CAP);            // fallback s/ RAIS
      ctxConf.set(cnae, 'baixa');
    }
    raw.push({ cnae, val });
  }
  raw.sort((a, b) => a.val - b.val);
  const n = raw.length;
  raw.forEach((r, idx) => cagedCtx.set(r.cnae, n > 1 ? Math.round((idx / (n - 1)) * 100) : 50));
  console.log(`Contexto v4 Jundiaí: ${n} CNAEs · ${rais.size} c/ RAIS · média global ${mediaGlobal.toFixed(3)}`);
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

let semSeg = 0, err = 0;
const t0 = Date.now();
const allRows: any[] = [];
const elegiveis: { id: string; score: number }[] = [];
for (let from = 0; ; from += 500) {
  const { data: ests } = await sb.from('radarempresas_estabelecimentos')
    .select('id, cnpj_basico, cnpj_completo, is_matriz, cnae_principal, has_email, has_phone, has_fantasia, company_age_years')
    .range(from, from + 499);
  if (!ests?.length) break;

  for (const est of ests as any[]) {
    const emp = empMap.get(est.cnpj_basico) || {};
    let { tipo, seg } = classificarCnae(est.cnae_principal, mapa || [], denySet);
    if (tipo !== 'excluido' && nomeBloqueado(emp.razao_social)) { tipo = 'excluido'; seg = null; }
    if (tipo === 'excluido') semSeg++;
    const cnaeK = String(est.cnae_principal || '').replace(/\D/g, '');
    const input: ScoreInput = {
      porte_empresa: emp.porte_empresa ?? null,
      capital_social: emp.capital_social ?? null,
      is_matriz: !!est.is_matriz,
      company_age_years: est.company_age_years,
      has_email: !!est.has_email,
      has_phone: !!est.has_phone,
      has_fantasia: !!est.has_fantasia,
      qtd_estabelecimentos_grupo: grupo.get(est.cnpj_basico) || 1,
      segmento_key: seg?.segmento_key || null,
      segmento_mapeado: tipo !== 'excluido',
      aderencia_tipo: tipo === 'curado' ? 'curado' : 'generico',
      people_intensity_score: seg?.people_intensity_score ?? 30,
      leadership_complexity_score: seg?.leadership_complexity_score ?? 30,
      onboarding_need_score: seg?.onboarding_need_score ?? 30,
      standardization_need_score: seg?.standardization_need_score ?? 30,
      commercial_fit_score: seg?.commercial_fit_score ?? 25,
      is_priority_cnae: seg?.is_priority ?? false,
      caged_contexto_score: cagedCtx.get(cnaeK) ?? null,
      contexto_confianca: ctxConf.get(cnaeK) ?? null,
      rais_tam_medio_setor: raisTam.get(cnaeK) ?? null,
    };
    const r = calcularScore(input);
    // elegível p/ priority_rank: tem segmento E não é micro sem equipe
    if (input.segmento_mapeado && !r.low_team_probability) {
      elegiveis.push({ id: est.id, score: r.score_total });
    }
    allRows.push({
      estabelecimento_id: est.id, cnpj_completo: est.cnpj_completo,
      score_total: r.score_total, score_dor_pessoas: r.score_dor_pessoas,
      score_capacidade_compra: r.score_capacidade_compra, score_fit_vertho: r.score_fit_vertho,
      score_contexto_setorial: r.score_contexto_setorial, classificacao: r.classificacao,
      score_confidence: r.score_confidence,
      commercial_actionability: r.commercial_actionability,
      low_team_probability: r.low_team_probability,
      priority_rank: null,
      score_explanation: { ...r.explanation, segmento_key: input.segmento_key },
      scoring_version: SCORING_VERSION, updated_at: new Date().toISOString(),
    });
  }
  if (ests.length < 500) break;
}

// priority_rank: percentil do score entre os ELEGÍVEIS (segmento + não-micro)
elegiveis.sort((a, b) => a.score - b.score);
const ne = elegiveis.length;
const rankById = new Map<string, number>();
elegiveis.forEach((e, idx) => rankById.set(e.id, ne > 1 ? Math.round((idx / (ne - 1)) * 1000) / 10 : 50));
for (const row of allRows) row.priority_rank = rankById.get(row.estabelecimento_id) ?? null;
console.log(`Priority rank: ${ne} elegíveis de ${allRows.length}`);

// upsert único (priority_rank já embutido)
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

// Distribuição
const { data: dist } = await sb.from('radarempresas_scores')
  .select('classificacao').limit(100000);
const d: any = {};
for (const r of (dist || []) as any[]) d[r.classificacao] = (d[r.classificacao] || 0) + 1;
console.log('Classificação:', d);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
