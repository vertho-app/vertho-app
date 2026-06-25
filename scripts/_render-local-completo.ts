/**
 * VÍDEO COMPLETO — render LOCAL de ponta a ponta, exercitando TUDO que ajustamos:
 * roteiro fresco (Opus 4.6 + thinking, prompt anti-texto-corrido) → garante 1 cena
 * data_diagram → narração (pausa dramática determinística + ênfase) → avatar HeyGen
 * (lip-sync da nossa voz) → Whisper (timing) → render Remotion (bundle novo, ícones
 * stroke-draw, SFX OFF) → master −14 LUFS (bed-respiro + bed-pico no clímax + fade)
 * → upload Bunny. Sem trigger.dev / Hetzner — tudo na máquina.
 *
 * Rodar: npx tsx scripts/_render-local-completo.ts
 */
import './_env'; // PRIMEIRO: popula process.env antes dos imports que leem env no topo
import { readFileSync, writeFileSync } from 'node:fs';
import { writeFile, readFile, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import nodePath from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { ensureBrowser, selectComposition, renderMedia } from '@remotion/renderer';
import { buildRoteiroPrompt, parseRoteiro, normalizarRoteiro } from '../lib/video/roteiro-prompt';
import { gerarClipHeyGen, aguardarClipHeyGen } from '../lib/video/heygen';
import { transcribeWords } from '../lib/video/whisper-align';
import { montarInputProps, type AssetMap } from '../lib/video/montar-inputprops';
import { storagePut } from '../lib/video/render-helpers';
// @ts-ignore — .mjs sem tipos
import { masterizarAudio } from '../lib/video/masterizar-audio.mjs';
// @ts-ignore — .mjs sem tipos (MESMA personalização da prod)
import { personalizar, primeiroNome } from '../worker-hetzner/personalizar.mjs';

const exec = promisify(execFile);
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';
const ANTHROPIC = process.env.ANTHROPIC_API_KEY!;
const LIB = process.env.BUNNY_LIBRARY_ID!, BKEY = process.env.BUNNY_STREAM_API_KEY!;
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const log = (...a: any[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

const CELL = { modulo: 'bbcd7218-faef-4da9-9622-2464f4ab6741', empresa: '0d99fed1-1710-40e3-b32e-7a95c7d023fe', cargo: 'Gestão Escolar', disc: 'I' as const };
const VOICE = process.env.VIDEO_TTS_VOICE || 'Vindemiatrix';
const FPS = 30;
const VIDEO_ID = 'local-' + Date.now();
const NOME = process.env.PERSO_NOME || 'Marina Alves'; // nome da saudação "Olá, {nome}"

// estilo de voz por cena (espelha trigger/gerar-video-modulo.ts — com ENFASE)
const ENFASE = ' Dê leve ênfase de entonação às palavras de virada e aos termos-chave da frase, sem exagero teatral; antes de perguntas retóricas, deixe a entonação suspender de leve.';
const STYLE = {
  intro: 'Narre como uma mentora calorosa e próxima, em português do Brasil, abrindo uma conversa. Tom curioso e acolhedor, energia que prende a atenção, ritmo natural com respiros leves. Engaje sem pressa — mas sem arrastar.' + ENFASE,
  outro: 'Narre como uma mentora calorosa e próxima, em português do Brasil, fechando com uma pergunta de reflexão. Ritmo natural, com peso e intimidade; uma leve pausa antes da pergunta final e TERMINE com firmeza, sem arrastar nem deixar silêncio no fim.' + ENFASE,
  miolo: 'Narre como uma mentora calorosa e acolhedora, em português do Brasil, num ritmo natural de conversa. Respiração natural entre as frases, tom íntimo e humano. Mantenha a fluidez — não alongue as pausas.' + ENFASE,
};
const styleForScene = (t: string) => t === 'avatar_intro' ? STYLE.intro : t === 'avatar_outro' ? STYLE.outro : STYLE.miolo;

// Pronúncia — CÓPIA EXATA da prod (trigger/gerar-video-modulo.ts), aplicada antes do TTS.
const PRONUNCIA: Array<[RegExp, string]> = [
  [/\bVertho\b/gi, 'Vértho'],
  [/\bPDI\b/g, 'pê-dê-í'],
  [/\bPPP\b/g, 'pê-pê-pê'],
  [/\bDISC\b/g, 'dísc'],
];
const aplicarPronuncia = (t: string) => PRONUNCIA.reduce((s, [re, sub]) => s.replace(re, sub), t);

async function ffmpegBuf(args: string[], inBuf: Buffer, inExt: string, outExt: string, timeout = 120_000): Promise<Buffer> {
  const dir = await mkdtemp(nodePath.join(os.tmpdir(), 'rlc-'));
  const inP = nodePath.join(dir, 'in.' + inExt), outP = nodePath.join(dir, 'out.' + outExt);
  try { await writeFile(inP, inBuf); await exec(FFMPEG, ['-y', '-i', inP, ...args, outP], { timeout, maxBuffer: 64 * 1024 * 1024 }); return await readFile(outP); }
  finally { await rm(dir, { recursive: true, force: true }).catch(() => {}); }
}
const trimTail = (mp3: Buffer) => ffmpegBuf(['-af', 'areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.6,areverse', '-c:a', 'libmp3lame', '-q:a', '4'], mp3, 'mp3', 'mp3', 60_000).then((o) => o.length > 1000 ? o : mp3).catch(() => mp3);
const normFps = (mp4: Buffer) => ffmpegBuf(['-r', String(FPS), '-fps_mode', 'cfr', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '48000', '-movflags', '+faststart'], mp4, 'mp4', 'mp4', 180_000).catch(() => mp4);
async function ffprobeDur(url: string): Promise<number> {
  try { const { stdout } = await exec(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', url]); const d = parseFloat(String(stdout).trim()); return Number.isFinite(d) && d > 0 ? d : 0; }
  catch { return 0; }
}
async function bunny(buf: Buffer, title: string): Promise<string> {
  const cr = await fetch(`https://video.bunnycdn.com/library/${LIB}/videos`, { method: 'POST', headers: { AccessKey: BKEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
  const { guid } = await cr.json();
  await fetch(`https://video.bunnycdn.com/library/${LIB}/videos/${guid}`, { method: 'PUT', headers: { AccessKey: BKEY }, body: buf as any });
  return guid;
}

// ── Narração LOCAL via ffmpeg (o @breezystack/lamejs não roda sob tsx; em prod o
// gerar-video-modulo usa generateNarrationAudio normalmente). Mesma voz, mesma
// regra de PAUSA dramática determinística após perguntas retóricas. ──────────────
async function ttsPcm(text: string, voice: string, style: string, attempt = 0): Promise<{ pcm: Buffer; rate: number }> {
  const model = process.env.GEMINI_TTS_MODEL || 'gemini-3.1-flash-tts-preview';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const body = { contents: [{ parts: [{ text: `${style}:\n\n${text}` }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { languageCode: 'pt-BR', voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } } };
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if ((res.status === 429 || res.status === 503) && attempt < 5) { await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt)); return ttsPcm(text, voice, style, attempt + 1); }
  if (!res.ok) throw new Error('TTS ' + res.status + ': ' + (await res.text()).slice(0, 200));
  const data: any = await res.json();
  const part = data?.candidates?.[0]?.content?.parts?.find((p: any) => p?.inlineData?.data);
  if (!part) throw new Error('TTS sem áudio');
  const rate = Number(String(part.inlineData.mimeType).match(/rate=(\d+)/)?.[1]) || 24000;
  return { pcm: Buffer.from(part.inlineData.data, 'base64'), rate };
}
function segs(t: string): { text: string; q: boolean }[] {
  const out: { text: string; q: boolean }[] = []; const re = /([^?]*\?)\s+(?=\S)/g; let last = 0; let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) { const x = t.slice(last, m.index + m[1].length).trim(); if (x) out.push({ text: x, q: true }); last = re.lastIndex; }
  const rest = t.slice(last).trim(); if (rest) out.push({ text: rest, q: /\?$/.test(rest) });
  return out.length ? out : [{ text: t.trim(), q: /\?$/.test(t.trim()) }];
}
async function pcmToMp3(pcm: Buffer, rate: number): Promise<Buffer> {
  const dir = await mkdtemp(nodePath.join(os.tmpdir(), 'pcm-')); const inP = nodePath.join(dir, 'in.pcm'), outP = nodePath.join(dir, 'out.mp3');
  try { await writeFile(inP, pcm); await exec(FFMPEG, ['-y', '-f', 's16le', '-ar', String(rate), '-ac', '1', '-i', inP, '-c:a', 'libmp3lame', '-q:a', '4', outP], { timeout: 60_000, maxBuffer: 64 * 1024 * 1024 }); return await readFile(outP); }
  finally { await rm(dir, { recursive: true, force: true }).catch(() => {}); }
}
async function narrarMp3(text: string, voice: string, style: string): Promise<Buffer> {
  const parts: Buffer[] = []; let rate = 24000; let prevQ = false;
  for (const s of segs(text)) {
    const { pcm, rate: r } = await ttsPcm(s.text, voice, style); rate = r;
    if (parts.length) parts.push(Buffer.alloc(Math.round(rate * (prevQ ? 0.7 : 0.22)) * 2)); // pausa: 0.7s pós-"?", 0.22s senão
    parts.push(pcm); prevQ = s.q;
  }
  return pcmToMp3(Buffer.concat(parts), rate);
}

/** Garante ao menos UMA cena data_diagram (converte o 1º concept_reveal/icon_story). */
function garantirDataDiagram(roteiro: any) {
  if (roteiro.scenes.some((s: any) => s.type === 'data_diagram')) { log('roteiro já trouxe data_diagram ✔'); return; }
  const i = roteiro.scenes.findIndex((s: any) => s.type === 'concept_reveal' || s.type === 'icon_story');
  if (i < 0) { log('sem cena convertível p/ data_diagram'); return; }
  const s = roteiro.scenes[i];
  const itens = (s.bullets || s.items || []).slice(0, 4);
  roteiro.scenes[i] = { ...s, type: 'data_diagram', title: s.title, cells: itens.map((x: string) => ({ label: x })), bullets: undefined, items: undefined, icons: undefined };
  log(`convertida cena ${i + 1} (${s.type}) → data_diagram p/ demonstrar o template`);
}

async function main() {
  // 1) ROTEIRO (Opus 4.6 + thinking)
  const { data: m } = await sb.from('modulos_base_conteudo').select('id,locale,nivel_entrada,nivel_destino,titulo,descritor,conteudo_central,conteudo_aplicavel,adaptacao_por_formato,competencias_base(nome)').eq('id', CELL.modulo).maybeSingle();
  if (!m) throw new Error('módulo não encontrado');
  const { data: cargoRow } = await sb.from('cargos_empresa').select('nome,area_depto,descricao,principais_entregas,decisoes_recorrentes,tensoes_comuns').eq('empresa_id', CELL.empresa).ilike('nome', CELL.cargo).limit(1).maybeSingle();
  const cargoBloco = cargoRow ? `CARGO: ${cargoRow.nome}. Área: ${cargoRow.area_depto || ''}. ${cargoRow.descricao || ''} Entregas: ${cargoRow.principais_entregas || ''}. Decisões: ${cargoRow.decisoes_recorrentes || ''}. Tensões: ${cargoRow.tensoes_comuns || ''}`.replace(/\s+/g, ' ').slice(0, 1600) : null;
  const modulo: any = { titulo: m.titulo, descritor: m.descritor, competenciaNome: (m as any).competencias_base?.nome ?? null, nivel_entrada: m.nivel_entrada, nivel_destino: m.nivel_destino, conteudo_central: m.conteudo_central, conteudo_aplicavel: m.conteudo_aplicavel, adaptacao_por_formato: m.adaptacao_por_formato, locale: m.locale, cargoBloco, pppBrief: null, discDominante: CELL.disc };
  log('módulo:', m.titulo);
  const { system, user } = buildRoteiroPrompt(modulo);
  log('gerando roteiro (Opus 4.6 + thinking)…');
  const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': ANTHROPIC, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify({ model: 'claude-opus-4-6', max_tokens: 16000, thinking: { type: 'enabled', budget_tokens: 8000 }, system, messages: [{ role: 'user', content: user }] }) });
  const j: any = await r.json();
  if (!r.ok) throw new Error('anthropic ' + r.status + ': ' + JSON.stringify(j).slice(0, 300));
  const roteiro: any = normalizarRoteiro(parseRoteiro((j.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join(''))!);
  garantirDataDiagram(roteiro);
  log('roteiro:', roteiro.scenes.length, 'cenas →', roteiro.scenes.map((s: any) => s.type).join(', '));

  const assets: AssetMap = {};
  // 2) NARRAÇÃO (pausa determinística + ênfase) → storage + Whisper
  log('narração (Vindemiatrix)…');
  for (const s of roteiro.scenes.filter((x: any) => x.narration?.trim())) {
    const mp3 = await narrarMp3(aplicarPronuncia(s.narration), VOICE, styleForScene(s.type));
    const buf = await trimTail(mp3);
    const src = await storagePut('video-assets', `${VIDEO_ID}/${s.id}.mp3`, buf, 'audio/mpeg');
    const words = await transcribeWords(buf);
    assets[s.id] = { src, durationSec: 0, words: words || undefined };
    log('  ✓', s.id, s.type);
  }
  // 3) AVATAR (HeyGen, lip-sync da nossa voz) → normaliza fps → storage
  const avatares = roteiro.scenes.filter((s: any) => s.type.startsWith('avatar') && assets[s.id]?.src);
  log('avatar HeyGen (', avatares.length, 'cenas — ~1-3 min cada)…');
  for (const s of avatares) {
    const id = await gerarClipHeyGen(assets[s.id].src, { width: 1920, height: 1080 });
    const url = await aguardarClipHeyGen(id);
    const mp4 = Buffer.from(await (await fetch(url)).arrayBuffer());
    const norm = await normFps(mp4);
    const src = await storagePut('video-assets', `${VIDEO_ID}/${s.id}.mp4`, norm, 'video/mp4');
    assets[s.id] = { src, durationSec: 0, audioSrc: assets[s.id].src, words: assets[s.id]?.words };
    log('  ✓ avatar', s.id);
  }
  // 4) durações reais → inputProps
  for (const id of Object.keys(assets)) assets[id].durationSec = await ffprobeDur(assets[id].src);
  const props: any = montarInputProps(roteiro, assets, { fps: FPS, width: 1920, height: 1080 });
  log('timeline:', props.totalFrames, 'frames /', FPS, 'fps =', (props.totalFrames / FPS).toFixed(1), 's');

  // 5) render — IDÊNTICO à prod (render-chunk), EXCETO a ESCALA (knob VIDEO_RENDER_SCALE;
  //    default 1.0 = 1080p nativo = prod; ex.: 0.6667 → 720p p/ teste rápido).
  await ensureBrowser();
  const BUNDLE = nodePath.resolve('spike-bundle');
  const comp = await selectComposition({ serveUrl: BUNDLE, id: 'VerthoVideo', inputProps: props });
  const cru = nodePath.resolve('outputs', `${VIDEO_ID}-cru.mp4`);
  const rawScale = Number(process.env.VIDEO_RENDER_SCALE) || 1;
  const scale = rawScale === 1 ? 1 : Math.round(props.height * rawScale) / props.height; // snap p/ dims inteiras
  log(`renderizando (${Math.round(props.height * scale)}p)…`);
  await renderMedia({ serveUrl: BUNDLE, composition: comp, codec: 'h264', outputLocation: cru, concurrency: 4, chromiumOptions: { gl: 'swangle' }, timeoutInMilliseconds: 120000, inputProps: props, ...(scale !== 1 ? { scale } : {}) });

  // 6) master −14 LUFS (bed-respiro + bed-pico no clímax = início do avatar_outro)
  const outro = props.scenes.find((s: any) => s.type === 'avatar_outro');
  const climaxSec = outro ? outro.fromFrame / FPS : props.totalFrames / FPS - 4;
  const bedR = nodePath.resolve('public/video-spike/audio/bed-respiro.mp3');
  const bedP = nodePath.resolve('public/video-spike/audio/bed-pico.mp3');
  const master = nodePath.resolve('outputs', `${VIDEO_ID}-master.mp4`);
  log('masterizando (−14 LUFS + bed-pico @', climaxSec.toFixed(1), 's)…');
  try { await masterizarAudio({ videoIn: cru, bedRespiro: bedR, bedPico: bedP, climaxStartSec: climaxSec, videoOut: master }); }
  catch (e: any) { log('master falhou (', e?.message, ') → usando render cru'); writeFileSync(master, readFileSync(cru)); }

  // 7) SAUDAÇÃO "Olá, {nome}" — MESMA camada da prod (worker-hetzner/personalizar.mjs):
  //    TTS Vindemiatrix + render da composição AvatarGreeting + prepend ao deck.
  const perso = nodePath.resolve('outputs', `${VIDEO_ID}-perso.mp4`);
  let finalPath = master;
  log(`saudação "Olá, ${primeiroNome(NOME)}" → prepend ao deck…`);
  try {
    await personalizar(master, NOME, perso, { bundleDir: BUNDLE, brand: props.brand, width: props.width, height: props.height, voice: VOICE });
    finalPath = perso;
  } catch (e: any) { log('saudação falhou (', String(e?.message || e).slice(0, 140), ') → envia o deck sem saudação'); }

  // 8) Bunny
  log('upload Bunny…');
  const guid = await bunny(await readFile(finalPath), `LOCAL — saudação + data_diagram + pausas (${VIDEO_ID})`);
  log('PRONTO ✅ → https://iframe.mediadelivery.net/play/' + LIB + '/' + guid);
}
main().catch((e) => { console.error('ERRO:', e?.stack || e?.message || e); process.exit(1); });
