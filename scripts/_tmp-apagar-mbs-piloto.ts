/* eslint-disable */
// TEMPORÁRIO — apaga os módulos-base do piloto (criados na última hora em macae)
// para o A/B do prompt. Confere referências antes; dry-run por padrão.
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';

const APLICAR = process.argv.includes('--aplicar');

async function main() {
  const sb = createSupabaseAdmin();
  const { data: emp } = await sb.from('empresas').select('id').eq('slug', 'macae').single();
  const desde = new Date(Date.now() - 3 * 3600_000).toISOString();
  const { data: mbs, error } = await sb.from('modulos_base_conteudo')
    .select('id, descritor, nivel_entrada, nivel_destino')
    .eq('empresa_id', (emp as any).id).gte('created_at', desde);
  if (error) throw new Error(error.message);
  const ids = (mbs || []).map((m: any) => m.id);
  console.log(`${ids.length} módulo(s) do piloto:`);
  for (const m of mbs as any[]) console.log(`  ${m.nivel_entrada}→${m.nivel_destino}  ${m.descritor}`);
  if (!ids.length) return;

  for (const t of ['micro_conteudos', 'kit_briefs', 'videos_gerados', 'extracoes_video']) {
    const { count, error: e } = await sb.from(t).select('id', { count: 'exact', head: true }).in('modulo_base_id', ids);
    if (e) { console.log(`  ⚠ ${t}: ${e.message}`); continue; }
    if (count) throw new Error(`${t} referencia ${count} — NÃO apagar`);
  }
  console.log('  ✓ nenhuma referência');

  if (!APLICAR) { console.log('(dry-run — rode com --aplicar)'); return; }
  const { error: eDel } = await sb.from('modulos_base_conteudo').delete().in('id', ids);
  if (eDel) throw new Error(eDel.message);
  console.log(`✅ ${ids.length} apagados`);
}
main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); });
