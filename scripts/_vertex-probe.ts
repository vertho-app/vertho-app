/** Sonda quais modelos de TTS existem no Vertex (generateContent AUDIO) com a SA.
 *  Para no primeiro que retornar 200. Rodar: npx tsx scripts/_vertex-probe.ts */
import './_env';
import { getGoogleAccessToken, vertexProjectId } from '../lib/tts/google-token';

const LOC = process.env.GOOGLE_VERTEX_LOCATION || 'us-central1';
const VOICE = process.env.VIDEO_TTS_VOICE || 'Vindemiatrix';
const host = LOC === 'global' ? 'aiplatform.googleapis.com' : `${LOC}-aiplatform.googleapis.com`;
const CANDIDATOS = [
  'gemini-3.1-flash-tts-preview',
  'gemini-3.1-flash-preview-tts',
  'gemini-3.1-flash-tts',
  'gemini-3.1-pro-preview-tts',
  'gemini-2.5-flash-preview-tts', // fallback conhecido (já validado)
];
const TESTAR_TODOS = true; // não para no primeiro — quero ver TODOS os 3.1

async function main() {
  const token = await getGoogleAccessToken();
  const proj = vertexProjectId();
  console.log('projeto:', proj, '· location:', LOC, '· voz:', VOICE);
  let winner: string | null = null;
  for (const model of CANDIDATOS) {
    const url = `https://${host}/v1/projects/${proj}/locations/${LOC}/publishers/google/models/${model}:generateContent`;
    const body = { contents: [{ role: 'user', parts: [{ text: 'Olá, teste rápido.' }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { languageCode: 'pt-BR', voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } } } };
    let line: string;
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
      if (r.ok) { const d: any = await r.json(); const has = !!d?.candidates?.[0]?.content?.parts?.find((p: any) => p?.inlineData?.data); line = has ? 'OK ✓ áudio gerado' : 'OK mas SEM áudio'; if (has && !winner) winner = model; }
      else line = `${r.status} · ${(await r.text()).replace(/\s+/g, ' ').slice(0, 140)}`;
    } catch (e: any) { line = 'erro: ' + (e?.message || e); }
    console.log(`  ${model.padEnd(32)} → ${line}`);
    if (winner && !TESTAR_TODOS) break;
  }
  console.log(winner ? `\n>>> USE: GEMINI_TTS_VERTEX_MODEL=${winner}` : '\n>>> nenhum candidato funcionou — ver erros acima (403=permissão/SA, 404=modelo não existe nesta região)');
}
main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); });
