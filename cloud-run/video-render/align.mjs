/**
 * Alinhamento de legendas pelo ÁUDIO REAL (Gemini multimodal).
 *
 * A cronometragem por estimativa de caracteres (buildSrt em render.mjs) assume
 * ritmo de fala constante e acumula drift ao longo de ~3 min. Aqui mandamos o
 * WAV do voice-over + o transcript exato (voiceover_script) ao Gemini e pedimos
 * os timestamps reais de cada trecho — alinhamento forçado (o texto é verdade
 * de base, então é mais confiável que ASR livre).
 *
 * Reusa a GEMINI_API_KEY que o Job já tem (sem infra nova). Degrada gracioso:
 * em qualquer falha/resposta inválida, retorna null e o caller cai no buildSrt.
 *
 * Env:
 *   SUBTITLE_ALIGN_MODEL  default gemini-3-flash-preview (multimodal c/ áudio)
 */

const ALIGN_MODEL = process.env.SUBTITLE_ALIGN_MODEL || 'gemini-3-flash-preview';

const PROMPT = `Você recebe um ÁUDIO de narração em português do Brasil e o TRANSCRITO EXATO dessa narração.

Divida o transcrito em legendas curtas (cues) e informe, para cada cue, o instante REAL de início e fim em que ela é falada no áudio.

Regras:
- Use as palavras do transcrito VERBATIM, na ordem, sem inventar nem omitir nada.
- Cada cue com no máximo ~80 caracteres, quebrando em fronteira de frase/pausa natural.
- Os cues devem cobrir todo o áudio, sem lacunas e sem sobreposição (o fim de um = início do próximo, aproximadamente).
- Timestamps em SEGUNDOS com casas decimais (ex: 12.34), baseados em QUANDO o trecho é de fato falado.
- O primeiro cue começa em ~0 e o último termina na duração total do áudio.

Responda SOMENTE com um array JSON válido (sem markdown, sem comentários):
[{"start": number, "end": number, "text": string}]

TRANSCRITO:
`;

function parseCues(raw) {
  let txt = String(raw || '').trim();
  const fence = txt.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) txt = fence[1].trim();
  const first = txt.indexOf('[');
  const last = txt.lastIndexOf(']');
  if (first < 0 || last <= first) return null;
  let arr;
  try { arr = JSON.parse(txt.slice(first, last + 1)); } catch { return null; }
  if (!Array.isArray(arr)) return null;
  return arr;
}

/**
 * Normaliza/valida os cues: ordena, força monotonicidade, clampa em [0,total].
 * Retorna null se a forma for inválida (poucos cues, tempos não crescentes).
 */
function sanitize(cues, totalDur) {
  const out = [];
  for (const c of cues) {
    const text = (c?.text ?? '').toString().replace(/\s+/g, ' ').trim();
    let start = Number(c?.start);
    let end = Number(c?.end);
    if (!text || !Number.isFinite(start) || !Number.isFinite(end)) continue;
    out.push({ start, end, text });
  }
  if (out.length < 3) return null;
  out.sort((a, b) => a.start - b.start);

  let prev = 0;
  for (let i = 0; i < out.length; i++) {
    const c = out[i];
    // Início monotônico, nunca antes do fim do anterior.
    c.start = Math.min(Math.max(c.start, prev), totalDur);
    if (!(c.end > c.start)) c.end = c.start + 0.4;
    c.end = Math.min(c.end, totalDur);
    prev = c.start;
  }
  // Encadeia: fim de cada cue = início do próximo (evita buracos/overlaps).
  for (let i = 0; i < out.length - 1; i++) {
    if (out[i].end > out[i + 1].start) out[i].end = out[i + 1].start;
    if (!(out[i].end > out[i].start)) out[i].end = Math.min(out[i].start + 0.4, out[i + 1].start);
  }
  out[out.length - 1].end = totalDur;

  // Sanidade: tempos têm que ser crescentes e cobrir uma fração razoável.
  if (!(out[out.length - 1].end > out[0].start)) return null;
  const cobertura = out[out.length - 1].end - out[0].start;
  if (cobertura < totalDur * 0.5) return null;
  return out;
}

/**
 * Alinha as legendas pelo áudio. Retorna [{start,end,text}] ou null (fallback).
 * @param {string} apiKey GEMINI_API_KEY
 * @param {Buffer} wavBuffer WAV do voice-over
 * @param {string} script transcript exato (voiceover_script)
 * @param {number} totalDur duração real do áudio (s)
 */
export async function alignCues(apiKey, wavBuffer, script, totalDur) {
  if (!apiKey || !wavBuffer?.length || !script?.trim() || !(totalDur > 0)) return null;
  try {
    const b64 = Buffer.from(wavBuffer).toString('base64');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${ALIGN_MODEL}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inlineData: { mimeType: 'audio/wav', data: b64 } },
            { text: `${PROMPT}${script.trim()}\n\nDuração total do áudio: ${totalDur.toFixed(2)}s.` },
          ],
        }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json' },
      }),
    });
    if (!res.ok) {
      console.warn(`[align] Gemini ${res.status}: ${(await res.text()).slice(0, 200)} — fallback`);
      return null;
    }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p?.text || '').join('') || '';
    const cues = parseCues(text);
    if (!cues) { console.warn('[align] resposta sem array JSON — fallback'); return null; }
    const clean = sanitize(cues, totalDur);
    if (!clean) { console.warn('[align] cues inválidos — fallback'); return null; }
    console.log(`[align] ${clean.length} cues alinhados pelo áudio`);
    return clean;
  } catch (e) {
    console.warn('[align] falhou, fallback p/ estimativa:', e?.message || e);
    return null;
  }
}
