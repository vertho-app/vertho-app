/** Testa o TTS on-demand do podcast (extractNarration + generatePersonalizedPodcastAudio). */
import { createSupabaseAdmin } from '@/lib/supabase';
import { extractNarration, generatePersonalizedPodcastAudio } from '@/lib/gemini-tts';

const E = '0d99fed1-1710-40e3-b32e-7a95c7d023fe';

async function main() {
  const sb = createSupabaseAdmin();
  const { data } = await sb.from('micro_conteudos')
    .select('id, descritor, conteudo_inline')
    .eq('empresa_id', E).eq('formato', 'audio').eq('descritor', 'Rituais formativos').limit(1).maybeSingle();
  if (!data) { console.log('sem áudio'); return; }
  console.log('TTS_BACKEND =', process.env.TTS_BACKEND || 'aistudio', '| GEMINI_API_KEY?', !!process.env.GEMINI_API_KEY);
  const narr = extractNarration(data.conteudo_inline || '');
  console.log('narração extraída:', narr.length, 'chars | início:', narr.slice(0, 100).replace(/\n/g, ' '));
  if (narr.length < 20) { console.log('❌ narração < 20 chars → rota cai no fallback/404'); return; }
  const t0 = Date.now();
  try {
    const audio = await generatePersonalizedPodcastAudio(narr, 'Taluana');
    console.log(`✅ TTS OK: ${audio.buffer.length} bytes ${audio.contentType} em ${Math.round((Date.now()-t0)/1000)}s`);
  } catch (e: any) {
    console.log(`❌ TTS FALHOU em ${Math.round((Date.now()-t0)/1000)}s:`, e?.message || e);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
