/* eslint-disable */
// Adiciona o kit de UM DISC a um tema cujo brief JÁ está limpo (reusa a espinha).
// resolverOuCriarBrief é idempotente → o brief existente é reusado, C/D/S intactos
// (o upsert de kits é onConflict 'brief_id,disc').
process.loadEnvFile('.env.local');
if (!process.env.HCLOUD_TOKEN && process.env['Hetzner Cloud api token']) process.env.HCLOUD_TOKEN = process.env['Hetzner Cloud api token'];
import { createSupabaseAdmin } from '@/lib/supabase';
import { gerarKitSemanal } from '@/actions/kits';
const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe';
async function main() {
  const sb = createSupabaseAdmin();
  const r: any = await gerarKitSemanal({
    competencia: 'Avaliação e monitoramento de resultados',
    descritor: 'Análise integrada de indicadores',
    cargo: 'Gestão Educacional',
    empresaId: EMP, sb, discs: ['I'], incluirVideo: true,
  });
  console.log(r?.success ? `✅ ${r.message}` : `⚠️ ${JSON.stringify(r).slice(0, 300)}`);
  const { data: briefs } = await sb.from('kit_briefs').select('id, modulo_base_id')
    .eq('competencia', 'Avaliação e monitoramento de resultados')
    .eq('descritor', 'Análise integrada de indicadores').eq('cargo', 'Gestão Educacional').eq('empresa_id', EMP);
  console.log(`briefs deste tema: ${briefs?.length} (esperado 1 — se virar 2, o brief NÃO foi reusado)`);
  for (const b of (briefs || [])) {
    const { data: k } = await sb.from('kits').select('disc,status').eq('brief_id', b.id);
    console.log(`  ${String(b.id).slice(0,8)} | MB ${String(b.modulo_base_id).slice(0,8)} | kits: ${(k||[]).map((x:any)=>x.disc+':'+x.status).sort().join(' ')}`);
  }
}
main().catch(e=>{console.error('FALHOU:', e?.message||e);process.exit(1);});
