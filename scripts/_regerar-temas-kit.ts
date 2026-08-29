/* eslint-disable */
// Regenera 2 temas de Kit do zero (brief FRESCO com o MB correto + 4 DISC).
// Uso: npx tsx scripts/_regerar-temas-kit.ts            → DRY RUN
//      npx tsx scripts/_regerar-temas-kit.ts --apply    → executa
//
// ⚠️ ORDEM OBRIGATÓRIA: micro_conteudos.kit_id é ON DELETE SET NULL — apagar o brief
// antes do conteúdo transformaria o conteúdo DISC-específico em GENÉRICO (kit_id null),
// e o buildSeason (que agora serve só genérico) passaria a entregá-lo a QUALQUER perfil.
// Então: conteúdo → kits → brief.
process.loadEnvFile('.env.local');
if (!process.env.HCLOUD_TOKEN && process.env['Hetzner Cloud api token']) process.env.HCLOUD_TOKEN = process.env['Hetzner Cloud api token'];
import { createSupabaseAdmin } from '@/lib/supabase';
import { gerarKitSemanal } from '@/actions/kits';

const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe';
const APPLY = process.argv.includes('--apply');
const TEMAS = [
  { competencia: 'Colaboração docente e cultura formativa', descritor: 'Troca de práticas', cargo: 'Coordenação Pedagógica' },
  { competencia: 'Avaliação e monitoramento de resultados', descritor: 'Definição de metas', cargo: 'Gestão Educacional' },
];

async function main() {
  const sb = createSupabaseAdmin();
  console.log(APPLY ? '🔥 APPLY — vai apagar e regerar\n' : '🔍 DRY RUN — nada será alterado\n');

  for (const t of TEMAS) {
    console.log(`══ ${t.cargo} › ${t.descritor}`);
    const { data: briefs } = await sb.from('kit_briefs').select('id, modulo_base_id')
      .eq('competencia', t.competencia).eq('descritor', t.descritor).eq('cargo', t.cargo)
      .or(`empresa_id.eq.${EMP},empresa_id.is.null`);
    if (!briefs?.length) { console.log('   brief não existe → gerarKitSemanal criaria já com o MB correto\n'); continue; }

    for (const b of briefs) {
      const { data: kits } = await sb.from('kits').select('id, disc, status').eq('brief_id', b.id);
      const kitIds = (kits || []).map((k: any) => k.id);
      const { data: conts } = kitIds.length
        ? await sb.from('micro_conteudos').select('id, formato, titulo').in('kit_id', kitIds)
        : { data: [] as any[] };
      const { data: vids } = kitIds.length
        ? await sb.from('videos_gerados').select('id').in('kit_id', kitIds)
        : { data: [] as any[] };
      console.log(`   brief ${String(b.id).slice(0, 8)} (MB contaminado ${String(b.modulo_base_id).slice(0, 8)})`);
      console.log(`     kits a apagar: ${(kits || []).map((k: any) => k.disc + ':' + k.status).join(' ') || '—'}`);
      console.log(`     micro_conteudos a apagar PRIMEIRO: ${conts?.length || 0} (${(conts || []).map((c: any) => c.formato).join(',')})`);
      console.log(`     videos_gerados que perderão kit_id (inofensivo): ${vids?.length || 0}`);

      if (APPLY) {
        if (kitIds.length) {
          const { error: e1, count } = await sb.from('micro_conteudos').delete({ count: 'exact' }).in('kit_id', kitIds);
          if (e1) throw new Error(`apagar conteúdo: ${e1.message}`);
          console.log(`     ✓ ${count} micro_conteudos apagados`);
        }
        const { error: e2 } = await sb.from('kit_briefs').delete().eq('id', b.id);
        if (e2) throw new Error(`apagar brief: ${e2.message}`);
        console.log(`     ✓ brief apagado (kits cascatearam)`);
      }
    }

    if (APPLY) {
      console.log(`   → regerando 4 DISC com brief fresco…`);
      const r: any = await gerarKitSemanal({
        competencia: t.competencia, descritor: t.descritor, cargo: t.cargo,
        empresaId: EMP, sb, discs: ['D', 'I', 'S', 'C'], incluirVideo: true,
      });
      console.log(`   ${r?.success ? '✅' : '⚠️'} ${r?.message || JSON.stringify(r).slice(0, 200)}`);
      const { data: novo } = await sb.from('kit_briefs').select('id, modulo_base_id')
        .eq('competencia', t.competencia).eq('descritor', t.descritor).eq('cargo', t.cargo).eq('empresa_id', EMP).maybeSingle();
      console.log(`   brief NOVO ${String(novo?.id).slice(0, 8)} | MB ${String(novo?.modulo_base_id).slice(0, 8)}`);
    }
    console.log('');
  }
  if (!APPLY) console.log('→ rode com --apply para executar');
}
main().catch((e) => { console.error('FALHOU:', e?.message || e); process.exit(1); });
