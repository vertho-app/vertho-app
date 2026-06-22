/**
 * Mede o custo REAL de gerar um conteúdo em PODCAST e em TEXTO, usando os prompts
 * de produção (promptPodcastScript / promptTextContent) no modelo default dessas
 * tasks (claude-sonnet-4-6) + o TTS real (Gemini) para o podcast.
 *
 * Lê usage de tokens direto das respostas dos SDKs — nada estimado.
 *   npx tsx scripts/medir-podcast-texto.ts
 */
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'node:fs';
import { promptPodcastScript } from '../lib/season-engine/prompts/podcast-script';
import { promptTextContent } from '../lib/season-engine/prompts/text-content';
import { extractNarration, ensurePodcastBrandNarration } from '../lib/gemini-tts';

const env: Record<string, string> = {};
for (const l of readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim(); }
const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
const GEMINI_KEY = env.GEMINI_API_KEY;
const TTS_MODEL = env.GEMINI_TTS_MODEL || 'gemini-3.1-flash-tts-preview';

// ── preços (USD / 1M tokens) ──────────────────────────────────────────────
const SONNET_IN = 3.0, SONNET_OUT = 15.0;
// Gemini flash-tts (preview) — tarifa publicada do 2.5-flash-tts como proxy.
const GTTS_TEXT_IN = 0.50, GTTS_AUDIO_OUT = 10.0;

const CELULA = { competencia: 'Comunicação Assertiva', descritor: 'Dar feedback difícil sem desmotivar', nivelMin: 1.0, nivelMax: 2.0, cargo: 'coordenador pedagógico', contexto: 'educacional' };

async function claude(system: string, user: string, maxTokens: number) {
  const t0 = Date.now();
  const r = await anthropic.messages.create({ model: 'claude-sonnet-4-6', max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] });
  const txt = r.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
  return { txt, inTok: r.usage.input_tokens, outTok: r.usage.output_tokens, ms: Date.now() - t0 };
}

async function geminiTts(text: string) {
  const styled = `Narre em português do Brasil, com voz masculina de meia-idade, tom acolhedor, seguro e íntimo, ritmo moderado e pausas reflexivas naturais:\n\n${text}`;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent?key=${GEMINI_KEY}`;
  const t0 = Date.now();
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
    contents: [{ parts: [{ text: styled }] }],
    generationConfig: { responseModalities: ['AUDIO'], speechConfig: { languageCode: 'pt-BR', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Charon' } } } },
  }) });
  if (!res.ok) throw new Error(`TTS ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data: any = await res.json();
  const part = data?.candidates?.[0]?.content?.parts?.find((p: any) => p?.inlineData?.data);
  const pcmBytes = part?.inlineData?.data ? Buffer.from(part.inlineData.data, 'base64').length : 0;
  const rate = (part?.inlineData?.mimeType?.match(/rate=(\d+)/)?.[1] ?? 24000) | 0;
  const durSec = pcmBytes / 2 / rate; // PCM 16-bit mono
  const u = data.usageMetadata || {};
  return { promptTok: u.promptTokenCount || 0, audioTok: u.candidatesTokenCount || u.totalTokenCount || 0, durSec, ms: Date.now() - t0 };
}

async function main() {
  const usd = (n: number) => `$${n.toFixed(4)}`;

  // ── 1) PODCAST: roteiro (Sonnet) + TTS (Gemini) ─────────────────────────
  console.log('\n═══ PODCAST ═══');
  const pp = promptPodcastScript({ ...CELULA, duracaoSegundos: 240, podcastFormato: 'solo' });
  const pr = await claude(pp.system, pp.user, 4096);
  const roteiroCost = (pr.inTok * SONNET_IN + pr.outTok * SONNET_OUT) / 1e6;
  console.log(`roteiro: ${pr.inTok} in / ${pr.outTok} out tok · ${(pr.ms/1000).toFixed(1)}s · ${usd(roteiroCost)}`);

  const narr = ensurePodcastBrandNarration(extractNarration(pr.txt));
  console.log(`narração: ${narr.length} chars`);
  const tts = await geminiTts(narr);
  const ttsCost = (tts.promptTok * GTTS_TEXT_IN + tts.audioTok * GTTS_AUDIO_OUT) / 1e6;
  console.log(`TTS: ${tts.promptTok} txt-in / ${tts.audioTok} audio tok · áudio ${tts.durSec.toFixed(1)}s · ${(tts.ms/1000).toFixed(1)}s · ${usd(ttsCost)}`);
  console.log(`>>> PODCAST TOTAL = ${usd(roteiroCost + ttsCost)}`);

  // ── 2) TEXTO: só roteiro (Sonnet), sem TTS ──────────────────────────────
  console.log('\n═══ TEXTO/PDF ═══');
  const tp = promptTextContent(CELULA);
  const tr = await claude(tp.system, tp.user, 8192);
  const textoCost = (tr.inTok * SONNET_IN + tr.outTok * SONNET_OUT) / 1e6;
  console.log(`conteúdo: ${tr.inTok} in / ${tr.outTok} out tok · ${tr.txt.length} chars · ${(tr.ms/1000).toFixed(1)}s · ${usd(textoCost)}`);
  console.log(`>>> TEXTO TOTAL = ${usd(textoCost)} (render do PDF é local/CPU, ~$0)`);

  console.log('\n═══ RESUMO ═══');
  console.log(`PODCAST: ${usd(roteiroCost + ttsCost)}  (roteiro ${usd(roteiroCost)} + TTS ${usd(ttsCost)})`);
  console.log(`TEXTO:   ${usd(textoCost)}`);
}
main().catch((e) => { console.error('ERRO', e?.message || e); process.exit(1); });
