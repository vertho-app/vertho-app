/**
 * Spike de custo: gera 4 roteiros de vídeo via Batch API (50% off) reusando o
 * prompt real (buildRoteiroPrompt). Mede tokens reais (input/cache/output) e
 * modela o custo em todos os cenários: síncrono±cache × batch±cache.
 *
 * Rodar: npx tsx scripts/spike-batch-roteiros.ts  (de dentro de nextjs-app)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { buildRoteiroPrompt, type ModuloParaRoteiro } from '../lib/video/roteiro-prompt';

// ---- env ----
const env: Record<string, string> = {};
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const ANTHROPIC = env.ANTHROPIC_API_KEY;
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const SRK = env.SUPABASE_SERVICE_ROLE_KEY;
const MODEL = 'claude-opus-4-6'; // alinhado ao prod (task conteudo_video). Preço = 4.8 ($5/$25).
const MAX_TOKENS = 8000;
const MODULE_IDS = [
  'bbcd7218-faef-4da9-9622-2464f4ab6741',
  'df18ce94-d92f-4050-8b4d-42c6e3f5b3c0',
  '37173540-cb4d-42fb-b8f8-2a2e9330d68e',
  'cca8dc9a-7e21-462a-ab30-26fa416d82ab',
];

// preços/token opus-4.6 (= opus-4.8: $5 in / $25 out)
const IN = 5e-6, OUT = 25e-6, CW = 6.25e-6 /*1.25× (5min)*/, CR = 0.5e-6 /*0.1×*/;
const log = (...a: any[]) => console.log(new Date().toISOString(), ...a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchModulo(id: string): Promise<ModuloParaRoteiro> {
  const cols = 'id,locale,nivel_entrada,nivel_destino,titulo,descritor,conteudo_central,conteudo_aplicavel,adaptacao_por_formato,competencias_base(nome)';
  const r = await fetch(`${SUPA}/rest/v1/modulos_base_conteudo?id=eq.${id}&select=${cols}`, {
    headers: { apikey: SRK, Authorization: `Bearer ${SRK}` },
  });
  const m = (await r.json())[0];
  return {
    titulo: m.titulo, descritor: m.descritor,
    competenciaNome: m.competencias_base?.nome ?? null,
    nivel_entrada: m.nivel_entrada, nivel_destino: m.nivel_destino,
    conteudo_central: m.conteudo_central, conteudo_aplicavel: m.conteudo_aplicavel,
    adaptacao_por_formato: m.adaptacao_por_formato, locale: m.locale,
    cargoBloco: null, pppBrief: null, discDominante: null,
  };
}

async function countTokens(system: string, user: string): Promise<number> {
  const r = await fetch('https://api.anthropic.com/v1/messages/count_tokens', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, system, messages: [{ role: 'user', content: user }] }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error('count_tokens: ' + JSON.stringify(j));
  return j.input_tokens;
}

async function main() {
  if (!ANTHROPIC || !SUPA || !SRK) throw new Error('faltam env vars');
  log('carregando 4 módulos…');
  const modulos = await Promise.all(MODULE_IDS.map(fetchModulo));
  const prompts = modulos.map(buildRoteiroPrompt);

  // system idêntico? (mesma transição, sem personalização)
  const sysIguais = prompts.every((p) => p.system === prompts[0].system);
  const sysTokens = await countTokens(prompts[0].system, '.');
  log(`system idêntico entre os 4: ${sysIguais} · system ≈ ${sysTokens} tokens`);

  // ---- cria o batch ----
  const requests = prompts.map((p, i) => ({
    custom_id: `roteiro-${i}`,
    params: {
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: [{ type: 'text', text: p.system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: p.user }],
    },
  }));
  log('criando batch…');
  const cr = await fetch('https://api.anthropic.com/v1/messages/batches', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ requests }),
  });
  const batch = await cr.json();
  if (!cr.ok) throw new Error('create batch: ' + JSON.stringify(batch));
  log(`batch ${batch.id} · status ${batch.processing_status}`);

  // ---- poll ----
  let b = batch;
  for (let i = 0; i < 240; i++) {
    await sleep(15000);
    const pr = await fetch(`https://api.anthropic.com/v1/messages/batches/${batch.id}`, {
      headers: { 'x-api-key': ANTHROPIC, 'anthropic-version': '2023-06-01' },
    });
    b = await pr.json();
    log(`[poll ${i}] ${b.processing_status} · ok=${b.request_counts?.succeeded} err=${b.request_counts?.errored} proc=${b.request_counts?.processing}`);
    if (b.processing_status === 'ended') break;
  }
  if (b.processing_status !== 'ended') throw new Error('batch não terminou a tempo');

  // ---- resultados (JSONL) ----
  const rr = await fetch(b.results_url, { headers: { 'x-api-key': ANTHROPIC, 'anthropic-version': '2023-06-01' } });
  const text = await rr.text();
  const rows = text.trim().split('\n').map((l) => JSON.parse(l));

  type U = { input_tokens: number; cache_creation_input_tokens: number; cache_read_input_tokens: number; output_tokens: number };
  const usages: U[] = [];
  for (const row of rows) {
    if (row.result?.type !== 'succeeded') { log('FALHOU', row.custom_id, JSON.stringify(row.result).slice(0, 200)); continue; }
    const u = row.result.message.usage;
    usages.push({
      input_tokens: u.input_tokens || 0,
      cache_creation_input_tokens: u.cache_creation_input_tokens || 0,
      cache_read_input_tokens: u.cache_read_input_tokens || 0,
      output_tokens: u.output_tokens || 0,
    });
  }

  // por request: total_input = input + cache_read + cache_creation; user = total_input - sysTokens
  const S = sysTokens;
  let sumOut = 0, sumUser = 0;
  const perReq = usages.map((u) => {
    const totalIn = u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens;
    const user = Math.max(0, totalIn - S);
    sumOut += u.output_tokens; sumUser += user;
    return { totalIn, user, out: u.output_tokens, u };
  });
  const N = perReq.length;

  // cenários (custo total dos N roteiros)
  const cSyncNoCache = perReq.reduce((a, r) => a + (S + r.user) * IN + r.out * OUT, 0);
  const cSyncCache = perReq.reduce((a, r, i) => a + (i === 0 ? S * CW : S * CR) + r.user * IN + r.out * OUT, 0);
  const cBatchNoCache = cSyncNoCache * 0.5;
  const cBatchCacheBest = cSyncCache * 0.5;
  const cBatchActual = 0.5 * usages.reduce((a, u) =>
    a + u.input_tokens * IN + u.cache_creation_input_tokens * CW + u.cache_read_input_tokens * CR + u.output_tokens * OUT, 0);

  const cacheCreated = usages.reduce((a, u) => a + u.cache_creation_input_tokens, 0);
  const cacheRead = usages.reduce((a, u) => a + u.cache_read_input_tokens, 0);

  const f = (n: number) => '$' + n.toFixed(4);
  const fp = (n: number) => '$' + (n / N).toFixed(4);
  const report = [
    `===== SPIKE BATCH + CACHE — ${N} roteiros (${MODEL}) =====`,
    `system compartilhado: ${S} tokens · idêntico entre os 4: ${sysIguais}`,
    `user médio: ${Math.round(sumUser / N)} tok · output médio: ${Math.round(sumOut / N)} tok`,
    `batch — cache_creation total: ${cacheCreated} tok · cache_read total: ${cacheRead} tok`,
    ``,
    `CUSTO TOTAL (${N} roteiros)            por roteiro`,
    `1) Síncrono, SEM cache   ${f(cSyncNoCache).padEnd(12)} ${fp(cSyncNoCache)}`,
    `2) Síncrono, COM cache   ${f(cSyncCache).padEnd(12)} ${fp(cSyncCache)}`,
    `3) Batch,    SEM cache   ${f(cBatchNoCache).padEnd(12)} ${fp(cBatchNoCache)}`,
    `4) Batch,    COM cache*  ${f(cBatchCacheBest).padEnd(12)} ${fp(cBatchCacheBest)}   (*melhor caso teórico)`,
    `5) Batch, MEDIDO de fato ${f(cBatchActual).padEnd(12)} ${fp(cBatchActual)}   (cache real no batch)`,
    ``,
    `Economia batch vs síncrono (sem cache): ${(100 * (1 - cBatchNoCache / cSyncNoCache)).toFixed(0)}%`,
    `Economia cache vs sem cache (síncrono): ${(100 * (1 - cSyncCache / cSyncNoCache)).toFixed(0)}%`,
    `Batch medido vs síncrono sem cache:     ${(100 * (1 - cBatchActual / cSyncNoCache)).toFixed(0)}%`,
  ].join('\n');

  writeFileSync('scripts/_batch-report.txt', report);
  console.log('\n' + report);
}

main().catch((e) => { console.error('ERRO', e); process.exit(1); });
