/**
 * Gerador do PLANO de vídeo de microlearning (Vertho) a partir do roteiro.
 *
 * Etapa barata e revisável do pipeline: o Gemini transforma o roteiro do
 * micro-conteúdo num plano estruturado (voice-over + 20-25 cenas com prompts
 * Veo em inglês + instruções de pós/FFmpeg). O Cloud Run Job consome esse
 * plano para gerar os clipes Veo, o voice-over (Charon) e montar o MP4 final.
 *
 * Saída: 16:9 horizontal 1280x720, voice-over Charon pt-BR, sem legendas,
 * sem personagens falando, sem lip-sync, sem texto na tela.
 */

import { callAI } from '@/actions/ai-client';

const PLAN_MODEL = process.env.VIDEO_PLAN_MODEL || 'gemini-3-flash-preview';

/** Negative prompt padrão aplicado a TODA cena Veo. */
export const VEO_NEGATIVE_PROMPT =
  'No text on screen, no logo, no dialogue, no lip-sync, no cartoon, no childish elements, no clipart, no exaggerated expressions, no fake stock-photo look.';

export interface VideoScene {
  scene_number: number;
  duration_seconds: number;
  narrative_function: string;
  voiceover_excerpt: string;
  visual_description: string;
  veo_prompt: string;
  negative_prompt: string;
  post_production_notes: string;
}

export interface VideoPlan {
  video_title: string;
  target_audience: string;
  format: {
    aspect_ratio: '16:9';
    resolution: '1280x720';
    estimated_duration_seconds: number;
    clip_count: number;
    clip_length_seconds: number;
    voice_over: true;
    subtitles: false;
  };
  tts: {
    model: string;
    voice: 'Charon';
    language: 'pt-BR';
    style_prompt: string;
    voiceover_script: string;
  };
  scenes: VideoScene[];
  editing_instructions: {
    remove_veo_audio: true;
    main_audio: string;
    music: string;
    transitions: string;
    logo_usage: string;
    color_grading: string;
  };
  quality_checklist: string[];
}

const SYSTEM = `Você é um arquiteto de mídia sênior (Gemini API, Veo, Gemini TTS, FFmpeg) que transforma um roteiro-base num PLANO DE VÍDEO institucional premium da Vertho.

OBJETIVO
Microlearning premium de ~3 minutos (≈180s), voice-over com a voz Charon, clipes b-roll gerados por Veo. Estética adulta, editorial, institucional, sofisticada. NUNCA infantil nem "banco de imagem genérico".

REGRAS DURAS
- Voice-over conduz TODA a história. Sem legendas. Sem texto na tela. Personagens NÃO falam (sem lip-sync). Clipes Veo são b-roll; o áudio deles será removido.
- 20 a 25 cenas de 6 a 8 segundos. A soma das durações deve ficar ≈180s.
- Saída de vídeo: 16:9 horizontal, 1280x720.

VOZ (voiceover_script + style_prompt)
- Adapte o roteiro para um voice-over contínuo de ~180s (ritmo moderado ≈ 2,4 palavras/seg → ~430 palavras). Português do Brasil.
- Tom: mentor experiente conversando com um diretor/coordenador escolar. Adulto, calmo, seguro, consultivo, humano e confiável.
- Evite: tom publicitário, entusiasmo excessivo, dramatização, voz infantil, pressa, leitura robótica, tom professoral demais.
- O fechamento traz uma AÇÃO PRÁTICA.
- voiceover_excerpt de cada cena deve ser o trecho exato do voiceover_script que toca naquela cena (em ordem, sem sobreposição, cobrindo o script inteiro).

VISUAL (veo_prompt em INGLÊS, um por cena) — siga este padrão:
"Cinematic realistic shot of [subject] [action] in [environment]. Soft natural light, premium institutional educational style, subtle dark navy and cyan visual accents inspired by Vertho brand colors. Smooth camera movement, shallow depth of field, realistic adult professionals, modern school environment. ${VEO_NEGATIVE_PROMPT}"
Paleta: navy #142F57 dominante, ciano #34C5CC e azul claro #9AE2E6 de acento. Preferir: diretor/coordenador adulto, reuniões pedagógicas, ambiente escolar moderno, laptops/tablets com gráficos abstratos, close em mãos organizando dados, relatórios SEM texto legível, corredores contemporâneos, luz natural, câmera suave, profundidade de campo. Evitar: cartoon, clipart, mascote, excesso de crianças, pessoas falando para a câmera, dashboards com texto legível, pessoas com aparência fake, expressões exageradas.

SAÍDA
Responda SOMENTE com JSON válido (sem markdown, sem comentários) exatamente neste schema:
{
  "video_title": string,
  "target_audience": string,
  "format": { "aspect_ratio": "16:9", "resolution": "1280x720", "estimated_duration_seconds": number, "clip_count": number, "clip_length_seconds": number, "voice_over": true, "subtitles": false },
  "tts": { "model": "gemini-3.1-flash-tts-preview", "voice": "Charon", "language": "pt-BR", "style_prompt": string, "voiceover_script": string },
  "scenes": [ { "scene_number": number, "duration_seconds": number, "narrative_function": string, "voiceover_excerpt": string, "visual_description": string, "veo_prompt": string, "negative_prompt": "${VEO_NEGATIVE_PROMPT}", "post_production_notes": string } ],
  "editing_instructions": { "remove_veo_audio": true, "main_audio": "Gemini TTS voice-over Charon", "music": string, "transitions": string, "logo_usage": string, "color_grading": string },
  "quality_checklist": string[]
}`;

function parseJson(raw: string): VideoPlan {
  let txt = raw.trim();
  // Remove cercas de código se o modelo desobedecer.
  const fence = txt.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) txt = fence[1].trim();
  // Pega do primeiro { ao último } pra tolerar ruído antes/depois.
  const first = txt.indexOf('{');
  const last = txt.lastIndexOf('}');
  if (first >= 0 && last > first) txt = txt.slice(first, last + 1);
  return JSON.parse(txt) as VideoPlan;
}

/**
 * Gera o plano de vídeo a partir do roteiro. Lança em erro — o caller decide.
 * @param roteiro texto/roteiro do micro-conteúdo (conteudo_inline).
 * @param titulo título do conteúdo (dá foco ao plano).
 */
export async function gerarVideoPlano(roteiro: string, titulo?: string): Promise<VideoPlan> {
  if (!roteiro?.trim()) throw new Error('roteiro vazio');
  const user = `TÍTULO: ${titulo || '(sem título)'}\n\nROTEIRO-BASE:\n${roteiro}`;
  const raw = await callAI(SYSTEM, user, { model: PLAN_MODEL }, 16000, { temperature: 0.7 });
  const plan = parseJson(raw);
  if (!Array.isArray(plan.scenes) || plan.scenes.length < 8) {
    throw new Error('plano inválido: poucas cenas');
  }
  // Garante o negative prompt e formato em toda cena.
  for (const s of plan.scenes) s.negative_prompt = VEO_NEGATIVE_PROMPT;
  return plan;
}
