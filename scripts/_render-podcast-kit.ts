/* eslint-disable */
// Renderiza o TTS de um podcast de kit que ficou sem áudio (renderAudio=false na
// geração). Núcleo de gerarPodcastAudio (actions/conteudos.ts) sem o gate admin —
// caminho headless sancionado. Uso: npx tsx scripts/_render-podcast-kit.ts [conteudoId]
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { extractNarration, generatePodcastAudio } from '@/lib/gemini-tts';

const ID = process.argv[2] || '934e2391-272a-44d1-b75f-ef4761df76f3'; // audio kit MEI×D projetomacae

async function main() {
  const sb = createSupabaseAdmin();
  const { data: c, error } = await sb.from('micro_conteudos')
    .select('id, empresa_id, formato, titulo, competencia, conteudo_inline')
    .eq('id', ID).maybeSingle();
  if (error || !c) throw new Error(`conteúdo não encontrado: ${error?.message || ID}`);
  if (c.formato !== 'audio') throw new Error(`formato ${c.formato} ≠ audio`);
  if (!c.conteudo_inline?.trim()) throw new Error('sem roteiro inline');

  const narracao = extractNarration(c.conteudo_inline);
  if (!narracao || narracao.length < 20) throw new Error('não extraiu narração do roteiro');
  console.log(`narração: ${narracao.length} chars — sintetizando…`);

  const audio = await generatePodcastAudio(narracao);
  const slug = String(c.competencia || 'geral').replace(/[^a-zA-Z0-9]/g, '_');
  const path = `final/audio/${slug}/${c.id}-${Date.now()}.${audio.extension}`;
  const { error: upErr } = await sb.storage.from('conteudos').upload(path, audio.buffer, {
    contentType: audio.contentType, upsert: true,
  });
  if (upErr) throw new Error(`upload: ${upErr.message}`);

  const { data: { publicUrl } } = sb.storage.from('conteudos').getPublicUrl(path);
  const { error: updErr } = await sb.from('micro_conteudos')
    .update({ url: publicUrl, storage_path: path, ativo: true })
    .eq('id', c.id).eq('empresa_id', c.empresa_id);
  if (updErr) throw new Error(`update: ${updErr.message}`);
  console.log(`✅ "${c.titulo}" → ${publicUrl}`);
}
main().catch((e) => { console.error('FALHOU:', e?.message || e); process.exit(1); });
