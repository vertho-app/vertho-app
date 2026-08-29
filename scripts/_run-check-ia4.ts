/* eslint-disable */
// Roda o check da IA4 (2ª IA) nas avaliações pendentes de uma empresa, headless.
// Uso: npx tsx scripts/_run-check-ia4.ts [slug] [modelo]
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { checkAvaliacoesCore } from '@/lib/check-ia4-core';
const SLUG = process.argv[2] || 'ibipeba';
const MODEL = process.argv[3] || 'gpt-5.4-2026-03-05';
async function main() {
  const sb = createSupabaseAdmin();
  const { data: emp } = await sb.from('empresas').select('id,slug').eq('slug', SLUG).single();
  if (!emp) throw new Error('empresa não encontrada: ' + SLUG);
  console.log(`check IA4 headless · empresa=${SLUG} · modelo=${MODEL}`);
  const r = await checkAvaliacoesCore(sb, (emp as any).id, { model: MODEL });
  console.log(r.success ? `✅ ${r.message}` : `❌ ${r.error}`);
  const { data: chk } = await sb.from('respostas')
    .select('id, status_ia4, payload_ia4')
    .eq('empresa_id', (emp as any).id)
    .gte('updated_at', new Date(Date.now() - 3600_000).toISOString());
  for (const c of (chk || [])) {
    const p: any = c.payload_ia4;
    console.log(`  ${String(c.id).slice(0,8)} → ${c.status_ia4}${p ? ` (${p.nota}pts · ${p.tipo_de_erro_predominante || '—'})` : ''}`);
  }
}
main().catch((e) => { console.error('ERRO FATAL:', e?.message || e); process.exit(1); });
