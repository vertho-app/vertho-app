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
  'No text on screen, no captions, no subtitles, no logos, no dialogue, no lip-sync, no person talking to camera, no cartoon or illustration, no clipart, no mascot, no childish elements, no whiteboard cliché, children not the main focus, no readable charts or spreadsheets, no exaggerated expressions, no generic stock-photo look.';

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
  style_bible: string;
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
Microlearning premium de ~3 minutos (≈180s), voice-over com a voz Charon, clipes b-roll gerados por Veo. O vídeo deve parecer UMA ÚNICA PEÇA AUDIOVISUAL CONTÍNUA — mesma personagem, mesma escola, mesma paleta, mesmo clima e mesmo padrão cinematográfico — NUNCA uma colagem de microvídeos desconexos. Estética adulta, editorial, institucional, sofisticada. Nunca infantil nem "banco de imagem genérico".

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

BÍBLIA VISUAL (style_bible) — A CHAVE DA CONTINUIDADE
O Veo gera cada clipe ISOLADAMENTE, sem memória entre cenas. A continuidade vem de uma bíblia visual ÚNICA, criada UMA vez para o vídeo inteiro e repetida LITERALMENTE em todos os clipes. Escreva-a em INGLÊS, detalhada e cinematográfica, cobrindo:
- Main character: UMA única pessoa, profissional adulto da educação no Brasil (~40-50 anos), aparência natural, calma e confiável. FIGURINO FIXO (descreva peças e cores exatas, ex: navy blazer + light blouse). Expressão séria e atenta, sem sorriso exagerado, sem atuação teatral. A MESMA pessoa em todas as cenas.
- Environment: UMA escola brasileira contemporânea, institucional premium; liste 3-4 sub-ambientes (ex: principal's office, pedagogical meeting room, school corridor, teachers' workspace) — todos da MESMA escola, no MESMO dia.
- Recurring objects: 3-5 objetos recorrentes (ex: navy folder, laptop with abstract graphics and NO readable text, printed reports, pen, notebook) que reaparecem para criar continuidade.
- Visual identity: paleta Vertho — navy #142F57 dominante, ciano #34C5CC e azul claro #9AE2E6 de acento, cinza claro, branco. Elegante e sutil, não chamativa. Transmite tecnologia humanizada, gestão e decisão baseada em evidências.
- Cinematography: realista, premium, editorial. Soft natural light, shallow depth of field, slow stable camera, discreet push-ins/travelling, ritmo calmo e reflexivo.
- Continuity note: feche reforçando que toda cena pertence ao MESMO vídeo — mesma personagem, mesmo figurino, mesma escola, mesma paleta, mesma luz e mesmo padrão cinematográfico; usar match cuts e transições naturais.

CENAS (veo_prompt) — SOMENTE A AÇÃO
Cada veo_prompt descreve APENAS a ação específica da cena (em INGLÊS): enquadramento/movimento de câmera + o que a MESMA personagem e os objetos recorrentes fazem. NÃO repita figurino, paleta, luz nem restrições (a bíblia já cobre). Referencie "the same director" e os objetos da bíblia. Encadeie as cenas com continuidade (mesmo dia, progressão natural, match cut). 1-2 frases por cena.
Exemplo: "Medium shot slowly pushing in to a discreet close-up: the director sits at her office desk reviewing printed reports and a laptop with abstract graphics, then makes a small note in her notebook, reflecting before a decision."

SAÍDA
Responda SOMENTE com JSON válido (sem markdown, sem comentários) exatamente neste schema:
{
  "video_title": string,
  "target_audience": string,
  "format": { "aspect_ratio": "16:9", "resolution": "1280x720", "estimated_duration_seconds": number, "clip_count": number, "clip_length_seconds": number, "voice_over": true, "subtitles": false },
  "style_bible": string (bíblia visual em INGLÊS — personagem fixa, escola, objetos recorrentes, paleta Vertho, cinematografia, nota de continuidade),
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
  if (!plan.style_bible?.trim()) {
    throw new Error('plano inválido: sem style_bible (bíblia visual de continuidade)');
  }
  // Garante o negative prompt em toda cena.
  for (const s of plan.scenes) s.negative_prompt = VEO_NEGATIVE_PROMPT;
  return plan;
}
