/* eslint-disable */
// READ-ONLY: os video-preferrers têm videos_personalizados (COM saudação) nas semanas
// 1 e 2, ou caem no deck genérico (sem o nome)?
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { derivarPrioridadeFormatos } from '@/lib/season-engine/formato-preferido';

const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe';

async function main() {
  const sb = createSupabaseAdmin();
  const { data: trilhas } = await sb.from('trilhas').select('colaborador_id,temporada_plano,competencia_foco').eq('empresa_id', EMP).eq('status', 'ativa');
  const ids = (trilhas || []).map((t: any) => t.colaborador_id);
  const { data: cs } = await sb.from('colaboradores').select('id,nome_completo,cargo,perfil_dominante,pref_video_curto,pref_video_longo,pref_texto,pref_audio,pref_estudo_caso').in('id', ids);
  const colabs = Object.fromEntries((cs || []).map((c: any) => [c.id, c]));
  const { data: mcAll } = await sb.from('micro_conteudos').select('id,modulo_base_id').eq('empresa_id', EMP);
  const mbByCore = Object.fromEntries((mcAll || []).map((m: any) => [m.id, m.modulo_base_id]));
  const { data: vg } = await sb.from('videos_gerados').select('id,modulo_base_id,cargo,disc_dominante,created_by').eq('empresa_id', EMP).eq('status', 'done');
  const cellByKey = new Map<string, any>((vg || []).map((v: any) => [`${v.modulo_base_id}|${v.cargo}|${String(v.disc_dominante || '').toUpperCase()}`, v]));
  const { data: vp } = await sb.from('videos_personalizados').select('cell_video_id,colaborador_id,status');
  const persoOk = new Set((vp || []).filter((p: any) => p.status === 'done').map((p: any) => `${p.cell_video_id}|${p.colaborador_id}`));
  console.log(`videos_gerados done: ${vg?.length} | videos_personalizados (qualquer status): ${vp?.length} | done: ${(vp || []).filter((p: any) => p.status === 'done').length}\n`);

  for (const SEM of [1, 2]) {
    let comVideo = 0, comSaudacao = 0, semSaudacao = 0;
    const casos: string[] = [];
    for (const t of (trilhas || [])) {
      const c = colabs[(t as any).colaborador_id]; if (!c) continue;
      if (derivarPrioridadeFormatos(c)[0] !== 'video') continue;
      const disc = String(c.perfil_dominante || '').charAt(0).toUpperCase();
      const s = ((t as any).temporada_plano || []).find((x: any) => Number(x.semana) === SEM);
      for (const e of (s?.conteudos_dia || [])) {
        const mb = mbByCore[e.conteudo?.core_id]; if (!mb) continue;
        const cell = cellByKey.get(`${mb}|${c.cargo}|${disc}`);
        if (!cell) continue;
        comVideo++;
        if (persoOk.has(`${cell.id}|${c.id}`)) comSaudacao++;
        else { semSaudacao++; if (casos.length < 6) casos.push(`    ${c.nome_completo} (${c.cargo}/${disc}) — "${e.descritor}"`); }
      }
    }
    console.log(`SEMANA ${SEM} (video-preferrers): ${comVideo} entregas com vídeo`);
    console.log(`   COM saudação (videos_personalizados done): ${comSaudacao}`);
    console.log(`   SEM saudação (cai no deck genérico):        ${semSaudacao}`);
    if (casos.length) { console.log('   exemplos sem saudação:'); casos.forEach((x) => console.log(x)); }
    console.log('');
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
