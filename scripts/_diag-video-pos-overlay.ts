/* eslint-disable */
// READ-ONLY: o overlay troca o core_id quando há kit → muda o MB → muda a CÉLULA de vídeo.
// Os vídeos que gerei (keyed no core_id GRAVADO) ainda resolvem PÓS-overlay?
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { derivarPrioridadeFormatos } from '@/lib/season-engine/formato-preferido';
import { precarregarKits, overlayKitNaSemana, formatoPreferido } from '@/lib/season-engine/kit/entrega-semana';

const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe';
const SEM = 2;

async function main() {
  const sb = createSupabaseAdmin();
  const { data: trilhas } = await sb.from('trilhas').select('colaborador_id,temporada_plano,competencia_foco').eq('empresa_id', EMP).eq('status', 'ativa');
  const ids = (trilhas || []).map((t: any) => t.colaborador_id);
  const { data: cs } = await sb.from('colaboradores').select('id,nome_completo,cargo,perfil_dominante,pref_video_curto,pref_video_longo,pref_texto,pref_audio,pref_estudo_caso').in('id', ids);
  const colabs = Object.fromEntries((cs || []).map((c: any) => [c.id, c]));
  const { data: mcAll } = await sb.from('micro_conteudos').select('id,modulo_base_id,kit_id,formato').or(`empresa_id.eq.${EMP},empresa_id.is.null`);
  const mcById = Object.fromEntries((mcAll || []).map((m: any) => [m.id, m]));
  const { data: vg } = await sb.from('videos_gerados').select('modulo_base_id,cargo,disc_dominante').eq('empresa_id', EMP).eq('status', 'done');
  const vidCell = new Set((vg || []).map((v: any) => `${v.modulo_base_id}|${v.cargo}|${String(v.disc_dominante || '').toUpperCase()}`));

  let mudouCore = 0, videoAntes = 0, videoDepois = 0, prefVideoQuebrou = 0;
  const quebras: string[] = [];

  for (const t of (trilhas || [])) {
    const c = colabs[(t as any).colaborador_id]; if (!c) continue;
    const disc = String(c.perfil_dominante || '').charAt(0).toUpperCase();
    const pref = derivarPrioridadeFormatos(c)[0];
    const plano = JSON.parse(JSON.stringify((t as any).temporada_plano || []));
    const s = plano.find((x: any) => Number(x.semana) === SEM);
    if (!s) continue;
    // core_id ANTES do overlay
    const antes = (s.conteudos_dia || []).map((e: any) => e.conteudo?.core_id);
    // aplica o overlay REAL
    const kitsCache = await precarregarKits(sb, { empresaId: EMP, disc, cargo: c.cargo }).catch(() => undefined);
    await overlayKitNaSemana(sb, s, { empresaId: EMP, disc, cargo: c.cargo, formatoPref: formatoPreferido(c) as any, competenciaFoco: (t as any).competencia_foco, kitsCache });
    const depois = (s.conteudos_dia || []).map((e: any) => e.conteudo?.core_id);

    for (const [i, e] of (s.conteudos_dia || []).entries()) {
      const mbAntes = mcById[antes[i]]?.modulo_base_id;
      const mbDepois = mcById[depois[i]]?.modulo_base_id;
      const vA = mbAntes ? vidCell.has(`${mbAntes}|${c.cargo}|${disc}`) : false;
      const vD = mbDepois ? vidCell.has(`${mbDepois}|${c.cargo}|${disc}`) : false;
      if (vA) videoAntes++;
      if (vD) videoDepois++;
      if (antes[i] !== depois[i]) mudouCore++;
      if (pref === 'video' && vA && !vD) {
        prefVideoQuebrou++;
        if (quebras.length < 6) quebras.push(`   ${c.nome_completo} (${c.cargo}/${disc}) P${i + 1} "${e.descritor}" — vídeo existia p/ o MB gravado, some pós-overlay`);
      }
    }
  }
  console.log(`=== SEMANA ${SEM}: efeito do overlay na célula de vídeo ===`);
  console.log(`core_id TROCADO pelo overlay: ${mudouCore} entrega(s)`);
  console.log(`vídeo resolve com o MB GRAVADO (o que eu medi antes): ${videoAntes}`);
  console.log(`vídeo resolve com o MB PÓS-OVERLAY (o que a pessoa vê): ${videoDepois}`);
  console.log(`\n⚠️ video-preferrers que PERDEM o vídeo pós-overlay: ${prefVideoQuebrou}`);
  if (quebras.length) quebras.forEach((q) => console.log(q));
  if (!prefVideoQuebrou) console.log('   (nenhum — o overlay não quebra a resolução de vídeo)');
}
main().catch((e) => { console.error(e); process.exit(1); });
