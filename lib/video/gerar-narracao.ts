/**
 * Gera a NARRAÇÃO (TTS Gemini, voz Kore) de cada cena do roteiro e sobe no
 * Supabase Storage (bucket público `video-assets`). As URLs públicas servem
 * pro `voice.audio_url` do HeyGen (cenas de avatar) E pras cenas de áudio do
 * Remotion (via inputProps). Voz única em todo o vídeo → consistência.
 */
import { generateNarrationAudio } from '@/lib/gemini-tts';
import type { RoteiroScene } from '@/lib/video/roteiro-prompt';

const SUPA = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BUCKET = 'video-assets';
const VOICE = process.env.VIDEO_TTS_VOICE || 'Callirrhoe';
// Narração de vídeo: ritmo mais ágil (conversa fluida) que a devolutiva — validado
// no teste de calibração da Mentora Vertho (voz Callirrhoe).
const VIDEO_NARRATION_STYLE = 'Narre em ritmo natural e ágil, como uma conversa fluida e acolhedora, sem pressa excessiva, em português do Brasil';

export interface NarracaoCena {
  sceneId: string;
  type: string;
  url: string;
  bytes: number;
}

/** Narra todas as cenas (com narração) e devolve as URLs públicas dos mp3. */
export async function gerarNarracaoDoRoteiro(scenes: RoteiroScene[], jobId: string): Promise<NarracaoCena[]> {
  const out: NarracaoCena[] = [];
  for (const s of scenes) {
    if (!s.narration?.trim()) continue;
    const audio = await generateNarrationAudio(s.narration, { voice: VOICE, style: VIDEO_NARRATION_STYLE });
    const path = `${jobId}/${s.id}.mp3`;
    const r = await fetch(`${SUPA}/storage/v1/object/${BUCKET}/${path}`, {
      method: 'POST',
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'audio/mpeg', 'x-upsert': 'true' },
      body: audio.buffer as any,
    });
    if (!r.ok) throw new Error(`upload narração ${path}: ${r.status} ${(await r.text()).slice(0, 150)}`);
    out.push({ sceneId: s.id, type: s.type, url: `${SUPA}/storage/v1/object/public/${BUCKET}/${path}`, bytes: audio.buffer.length });
  }
  return out;
}
