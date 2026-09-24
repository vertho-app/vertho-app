/**
 * Mede o custo REAL das imagens do PDF de conteúdo final: capa (1024x1536) +
 * seção (1536x1024) no modelo PRINCIPAL da OpenAI (`gpt-image-2.5-flare`, medium,
 * ou o de `OPENAI_IMAGE_MODEL`). Lê o `usage` da resposta e precifica pelo
 * catálogo. O fallback Gemini tem custo fixo por imagem (1.120 tokens a 1K).
 *   npx tsx scripts/medir-imagem-pdf.ts
 */
import { readFileSync } from 'node:fs';
import { buildCoverPrompt, buildSectionPrompt } from '../lib/imagem-editorial';
import { costFromTokens } from '../lib/ia-cost-catalog';

const env: Record<string, string> = {};
for (const l of readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim(); }
const KEY = env.OPENAI_API_KEY;
const MODEL = env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-flare';
const TEMA = 'Comunicação Assertiva — Dar feedback difícil sem desmotivar';

async function gen(label: string, prompt: string, size: string) {
  const t0 = Date.now();
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: MODEL, prompt, size, quality: 'medium', n: 1 }),
  });
  if (!res.ok) throw new Error(`${label} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data: any = await res.json();
  const u = data.usage || {};
  const inTok = u.input_tokens || 0, outTok = u.output_tokens || 0;
  const cost = costFromTokens(MODEL, { inTokens: inTok, outTokens: outTok });
  if (cost === null) throw new Error(`${MODEL} não está no catálogo de preços (lib/ia-cost-catalog.ts)`);
  console.log(`${label} (${size}): in ${inTok} / out ${outTok} tok · ${((Date.now()-t0)/1000).toFixed(1)}s · $${cost.toFixed(4)}`);
  console.log(`   usage bruto: ${JSON.stringify(u)}`);
  return cost;
}

async function main() {
  console.log(`modelo: ${MODEL}\n`);
  const capa = await gen('CAPA', buildCoverPrompt(TEMA), '1024x1536');
  const secao = await gen('SEÇÃO', buildSectionPrompt(TEMA), '1536x1024');
  console.log(`\n>>> IMAGENS TOTAL (capa+seção) = $${(capa+secao).toFixed(4)}`);
  console.log(`>>> só capa = $${capa.toFixed(4)} (seção é opcional, 1 página com heroImage)`);
}
main().catch((e) => { console.error('ERRO', e?.message || e); process.exit(1); });
