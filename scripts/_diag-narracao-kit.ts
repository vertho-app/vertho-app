/* eslint-disable */
// READ-ONLY: o podcast de kit SEM MP3 (url=null) consegue ser renderizado
// on-demand por /api/conteudo/[id]/podcast? A rota só gera se
// extractNarration(conteudo_inline) tiver >= 20 chars — este script mede isso
// nos áudios de kit da empresa, em vez de deduzir do doc.
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { extractNarration } from '@/lib/gemini-tts';

const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe';

async function main() {
  const sb = createSupabaseAdmin();
  const { data: briefs } = await sb.from('kit_briefs').select('id').or(`empresa_id.eq.${EMP},empresa_id.is.null`);
  const { data: kits } = await sb.from('kits').select('id').in('brief_id', (briefs || []).map((b: any) => b.id)).eq('status', 'published');
  const { data: audios } = await sb.from('micro_conteudos')
    .select('id, titulo, url, ativo, conteudo_inline')
    .in('kit_id', (kits || []).map((k: any) => k.id)).eq('formato', 'audio');

  let ok = 0, curto = 0;
  const amostra: string[] = [];
  for (const a of (audios as any[] || [])) {
    const n = extractNarration(a.conteudo_inline || '');
    if (n.length >= 20) { ok++; if (amostra.length < 2 && !a.url) amostra.push(`  "${n.slice(0, 90)}…" (${n.length} chars)`); }
    else { curto++; if (amostra.length < 4) amostra.push(`  ⚠️ ${a.titulo}: narração ${n.length} chars (inline ${String(a.conteudo_inline || '').length})`); }
  }
  const semUrl = (audios as any[] || []).filter((a) => !a.url).length;
  const inativos = (audios as any[] || []).filter((a) => a.ativo === false).length;
  console.log(`áudios de kit: ${audios?.length || 0} · sem MP3 (url null): ${semUrl} · ativo=false: ${inativos}`);
  console.log(`narração extraível (>=20 chars, renderiza on-demand): ${ok} · curta demais: ${curto}`);
  console.log(amostra.join('\n'));
}
main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); });
