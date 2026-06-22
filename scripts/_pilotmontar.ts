import pg from 'pg';
import { writeFile, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import { montarInputProps } from '../lib/video/montar-inputprops';
import { transcribeWords } from '../lib/video/whisper-align';

const exec = promisify(execFile);
const ID = '710538a8-48b9-4b62-bf15-ce348d5652d7';
const PFX = `${ID}-b1`; // prefixo dedicado à voz B1 (idempotência só reusa B1, não o lixo antigo)
const SUPA = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)!, SRK = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const HK = process.env.HEYGEN_API_KEY!, TP = process.env.HEYGEN_TALKING_PHOTO_ID!;
const GK = process.env.GEMINI_API_KEY!, MODEL = 'gemini-3.1-flash-tts-preview', VOICE = 'Vindemiatrix';
// Voz escolhida: Vindemiatrix B1-equilibrado, FIXO em todas as cenas.
const B1 = 'Narre como uma mentora calorosa e próxima, conversando com uma pessoa, em português do Brasil. Ritmo natural e fluido de conversa, acolhedor, com respiros leves entre as frases e uma micro-pausa antes da ideia principal. Sem pressa, mas sem arrastar.';
const styleFor = (_t: string) => B1;
const PRON: [RegExp, string][] = [[/\bVertho\b/gi, 'Vértho'], [/\bPDI\b/g, 'pê-dê-í'], [/\bPPP\b/g, 'pê-pê-pê'], [/\bDISC\b/g, 'dísc']];
const aplicar = (t: string) => PRON.reduce((s, [r, x]) => s.replace(r, x), t);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (...a: any[]) => console.log(new Date().toISOString().slice(11, 19), ...a);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });

async function gemTTS(style: string, text: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GK}`;
  const body = { contents: [{ parts: [{ text: `${style}:\n\n${text}` }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { languageCode: 'pt-BR', voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } } } };
  for (let i = 0; i < 6; i++) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.status === 429 || res.status === 503) { await sleep(5000 * 2 ** i); continue; }
    if (!res.ok) throw new Error('tts ' + res.status + ' ' + (await res.text()).slice(0, 200));
    const data: any = await res.json();
    const part = data?.candidates?.[0]?.content?.parts?.find((p: any) => p?.inlineData?.data);
    const pcm = Buffer.from(part.inlineData.data, 'base64');
    const rate = Number((String(part.inlineData.mimeType).match(/rate=(\d+)/) || [])[1] || 24000);
    return { pcm, rate };
  }
  throw new Error('tts retries esgotadas');
}
async function pcmToMp3(pcm: Buffer, rate: number, base: string) {
  const raw = path.join(os.tmpdir(), base + '.pcm'), out = path.join(os.tmpdir(), base + '.mp3');
  await writeFile(raw, pcm);
  await exec('ffmpeg', ['-y', '-f', 's16le', '-ar', String(rate), '-ac', '1', '-i', raw, '-b:a', '128k', out]);
  return readFile(out);
}
async function upload(name: string, buf: Buffer, ct: string) {
  const r = await fetch(`${SUPA}/storage/v1/object/video-assets/${PFX}/${name}`, { method: 'PUT', headers: { Authorization: `Bearer ${SRK}`, 'x-upsert': 'true', 'Content-Type': ct }, body: buf as any });
  if (!r.ok) throw new Error('upload ' + name + ' ' + r.status);
  return `${SUPA}/storage/v1/object/public/video-assets/${PFX}/${name}`;
}
async function heygen(audioUrl: string) {
  const g: any = await (await fetch('https://api.heygen.com/v2/video/generate', { method: 'POST', headers: { 'X-Api-Key': HK, 'Content-Type': 'application/json' }, body: JSON.stringify({ video_inputs: [{ character: { type: 'talking_photo', talking_photo_id: TP }, voice: { type: 'audio', audio_url: audioUrl } }], dimension: { width: 1920, height: 1080 } }) })).json();
  const vid = g?.data?.video_id; if (!vid) throw new Error('heygen gen: ' + JSON.stringify(g).slice(0, 200));
  for (let i = 0; i < 60; i++) { await sleep(8000); const sj: any = await (await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${vid}`, { headers: { 'X-Api-Key': HK } })).json(); if (sj?.data?.status === 'completed') return sj.data.video_url; if (sj?.data?.status === 'failed') throw new Error('heygen failed'); }
  throw new Error('heygen timeout');
}
async function normFps(buf: Buffer) {
  const inp = path.join(os.tmpdir(), 'hgin.mp4'), out = path.join(os.tmpdir(), 'hgout.mp4');
  await writeFile(inp, buf);
  await exec('ffmpeg', ['-y', '-i', inp, '-r', '30', '-fps_mode', 'cfr', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '48000', '-movflags', '+faststart', out], { timeout: 180000, maxBuffer: 64 * 1024 * 1024 });
  return readFile(out);
}
async function ffdur(buf: Buffer, ext: string) {
  const p = path.join(os.tmpdir(), 'dur' + ext); await writeFile(p, buf);
  const { stdout } = await exec('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', p]);
  return parseFloat(String(stdout).trim());
}

const pub = (name: string) => `${SUPA}/storage/v1/object/public/video-assets/${PFX}/${name}`;
async function reusar(name: string): Promise<Buffer | null> {
  const r = await fetch(pub(name));
  return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
}

async function main() {
  const { rows } = await pool.query('SELECT roteiro FROM videos_gerados WHERE id=$1', [ID]);
  const roteiro = rows[0].roteiro;
  const assets: any = {};
  for (const s of roteiro.scenes) {
    if (!s.narration?.trim()) continue;
    let mp3 = await reusar(`${s.id}.mp3`); // idempotente: não re-gera o que já existe
    if (!mp3) {
      const { pcm, rate } = await gemTTS(styleFor(s.type), aplicar(s.narration));
      mp3 = await pcmToMp3(pcm, rate, s.id);
      await upload(`${s.id}.mp3`, mp3, 'audio/mpeg');
      log('narração', s.id, '(novo)');
      await sleep(6000); // throttle p/ não saturar o rate-limit do TTS preview
    } else { log('narração', s.id, '(reuso)'); }
    const words = await transcribeWords(mp3);
    assets[s.id] = { src: pub(`${s.id}.mp3`), durationSec: await ffdur(mp3, '.mp3'), words: words || undefined };
  }
  for (const s of roteiro.scenes) {
    if (!String(s.type).startsWith('avatar') || !assets[s.id]) continue;
    let mp4 = await reusar(`${s.id}.mp4`);
    if (!mp4) {
      log('heygen', s.id, '…');
      const raw = Buffer.from(await (await fetch(await heygen(assets[s.id].src))).arrayBuffer());
      mp4 = await normFps(raw);
      await upload(`${s.id}.mp4`, mp4, 'video/mp4');
      log('avatar', s.id, '(novo)');
    } else { log('avatar', s.id, '(reuso)'); }
    assets[s.id] = { src: pub(`${s.id}.mp4`), durationSec: await ffdur(mp4, '.mp4'), audioSrc: assets[s.id].src, words: assets[s.id]?.words };
  }
  const props: any = montarInputProps(roteiro, assets, { fps: 30 });
  await writeFile('scripts/_inputprops-pilot.json', JSON.stringify(props));
  log('inputprops salvo:', props.scenes.length, 'cenas,', props.captions?.length, 'captions');
  await pool.end();
}
main().catch((e) => { console.error('ERRO', e?.stack || e?.message || e); process.exit(1); });
