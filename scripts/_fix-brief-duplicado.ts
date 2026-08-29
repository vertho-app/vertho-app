/* eslint-disable */
// Conserta o brief DUPLICADO que criei: apaga o meu (contexto='generico') e re-adiciona
// o kit I com contexto='educacional' → reusa o brief original 4a7b2fef (C/D/S).
// ⚠️ ORDEM: micro_conteudos.kit_id é ON DELETE SET NULL → apagar o conteúdo ANTES do
// brief, senão o conteúdo DISC-específico vira genérico e o buildSeason o serve a todos.
process.loadEnvFile('.env.local');
if (!process.env.HCLOUD_TOKEN && process.env['Hetzner Cloud api token']) process.env.HCLOUD_TOKEN = process.env['Hetzner Cloud api token'];
import { createSupabaseAdmin } from '@/lib/supabase';
import { gerarKitSemanal } from '@/actions/kits';

const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe';
const DUP = '7ad83ab7'; // meu brief errado (contexto=generico)
const T = { competencia: 'Avaliação e monitoramento de resultados', descritor: 'Análise integrada de indicadores', cargo: 'Gestão Educacional' };

async function main() {
  const sb = createSupabaseAdmin();
  const { data: briefs } = await sb.from('kit_briefs').select('id, contexto, modulo_base_id')
    .eq('competencia', T.competencia).eq('descritor', T.descritor).eq('cargo', T.cargo).eq('empresa_id', EMP);
  const dup = (briefs || []).find((b: any) => String(b.id).startsWith(DUP));
  if (!dup) { console.log('brief duplicado não encontrado — já limpo?'); }
  else {
    const { data: kits } = await sb.from('kits').select('id, disc').eq('brief_id', dup.id);
    const kitIds = (kits || []).map((k: any) => k.id);
    console.log(`apagando meu brief ${DUP} (contexto=${dup.contexto}) | kits: ${(kits || []).map((k: any) => k.disc).join(',')}`);
    if (kitIds.length) {
      const { error: e1, count } = await sb.from('micro_conteudos').delete({ count: 'exact' }).in('kit_id', kitIds);
      if (e1) throw new Error(`conteúdo: ${e1.message}`);
      console.log(`  ✓ ${count} micro_conteudos apagados PRIMEIRO (FK SET NULL)`);
    }
    const { error: e2 } = await sb.from('kit_briefs').delete().eq('id', dup.id);
    if (e2) throw new Error(`brief: ${e2.message}`);
    console.log('  ✓ brief duplicado apagado (kit cascateou)');
  }

  console.log(`\nre-adicionando o kit I com contexto='educacional'…`);
  const r: any = await gerarKitSemanal({
    competencia: T.competencia, descritor: T.descritor, cargo: T.cargo, contexto: 'educacional',
    empresaId: EMP, sb, discs: ['I'], incluirVideo: true,
  });
  console.log(r?.success ? `✅ ${r.message}` : `⚠️ ${JSON.stringify(r).slice(0, 250)}`);

  const { data: fim } = await sb.from('kit_briefs').select('id, contexto, modulo_base_id')
    .eq('competencia', T.competencia).eq('descritor', T.descritor).eq('cargo', T.cargo).eq('empresa_id', EMP);
  console.log(`\nbriefs deste tema: ${fim?.length} ${fim?.length === 1 ? '✅ (espinha recuperada)' : '⚠️ ainda duplicado'}`);
  for (const b of (fim || [])) {
    const { data: k } = await sb.from('kits').select('disc,status').eq('brief_id', b.id);
    console.log(`  ${String(b.id).slice(0,8)} | contexto=${b.contexto} | MB ${String(b.modulo_base_id).slice(0,8)} | kits: ${(k||[]).map((x:any)=>x.disc+':'+x.status).sort().join(' ')}`);
  }
}
main().catch(e => { console.error('FALHOU:', e?.message || e); process.exit(1); });
