/* eslint-disable */
// READ-ONLY: o `formatos_disponiveis` do plano (SNAPSHOT do build) serve o áudio?
// O week page monta: Object.keys(formatos_disponiveis).filter(f=>f!=='video') + (temVideo?['video']:[])
// → áudio/texto/case dependem do SNAPSHOT; vídeo é resolvido ao vivo.
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { derivarPrioridadeFormatos } from '@/lib/season-engine/formato-preferido';
import { normDescritor } from '@/lib/blueprint/to-descriptors';

const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe';

async function main() {
  const sb = createSupabaseAdmin();
  const { data: trilhas } = await sb.from('trilhas').select('colaborador_id,temporada_plano,competencia_foco').eq('empresa_id', EMP).eq('status', 'ativa');
  const ids = (trilhas || []).map((t: any) => t.colaborador_id);
  const { data: cs } = await sb.from('colaboradores').select('id,nome_completo,cargo,perfil_dominante,pref_video_curto,pref_video_longo,pref_texto,pref_audio,pref_estudo_caso').in('id', ids);
  const colabs = Object.fromEntries((cs || []).map((c: any) => [c.id, c]));
  const { data: mcAll } = await sb.from('micro_conteudos').select('id,formato,ativo,competencia,descritor,cargo,modulo_base_id').eq('empresa_id', EMP);
  const mcById = Object.fromEntries((mcAll || []).map((m: any) => [m.id, m]));
  const audioExiste = new Set((mcAll || []).filter((m: any) => m.formato === 'audio' && m.ativo).map((m: any) => `${m.competencia}|${normDescritor(m.descritor)}|${m.cargo}`));
  const { data: vg } = await sb.from('videos_gerados').select('modulo_base_id,cargo,disc_dominante').eq('empresa_id', EMP).eq('status', 'done');
  const vidCell = new Set((vg || []).map((v: any) => `${v.modulo_base_id}|${v.cargo}|${String(v.disc_dominante || '').toUpperCase()}`));

  const porSemana = new Map<number, { tot: number; snapAudio: number; existeAudio: number }>();
  let prefAudioNaoServido = 0, prefVideoNaoServido = 0;
  const casos: string[] = [];

  for (const t of (trilhas || [])) {
    const c = colabs[(t as any).colaborador_id]; if (!c) continue;
    const disc = String(c.perfil_dominante || '').charAt(0).toUpperCase();
    const pref = derivarPrioridadeFormatos(c)[0];
    for (const s of ((t as any).temporada_plano || [])) {
      if (s?.tipo !== 'conteudo') continue;
      const w = Number(s.semana);
      if (!porSemana.has(w)) porSemana.set(w, { tot: 0, snapAudio: 0, existeAudio: 0 });
      const agg = porSemana.get(w)!;
      for (const e of (s.conteudos_dia || [])) {
        const comp = e.competencia || (t as any).competencia_foco;
        const chave = `${comp}|${normDescritor(e.descritor)}|${c.cargo}`;
        const snap = Object.keys(e.conteudo?.formatos_disponiveis || {});
        const core = e.conteudo?.core_id ? mcById[e.conteudo.core_id] : null;
        const temVideo = core?.modulo_base_id ? vidCell.has(`${core.modulo_base_id}|${c.cargo}|${disc}`) : false;
        agg.tot++;
        if (snap.includes('audio')) agg.snapAudio++;
        if (audioExiste.has(chave)) agg.existeAudio++;
        // o que o week page REALMENTE oferece:
        const oferecidos = [...snap.filter((f) => f !== 'video'), ...(temVideo ? ['video'] : [])];
        if (pref === 'audio' && !oferecidos.includes('audio')) {
          prefAudioNaoServido++;
          if (casos.length < 10) casos.push(`  sem${w} | ${c.nome_completo} (prefere ÁUDIO) → só ${oferecidos.join('/') || 'nada'} | áudio existe no catálogo? ${audioExiste.has(chave) ? 'SIM (snapshot velho)' : 'não'}`);
        }
        if (pref === 'video' && !oferecidos.includes('video')) prefVideoNaoServido++;
      }
    }
  }

  console.log('semana | entregas | áudio no SNAPSHOT | áudio EXISTE no catálogo');
  for (const w of [...porSemana.keys()].sort((a, b) => a - b)) {
    const v = porSemana.get(w)!;
    const flag = v.existeAudio > v.snapAudio ? `  ← ${v.existeAudio - v.snapAudio} com áudio pronto que o plano NÃO serve` : '';
    console.log(`  ${String(w).padStart(2)}   |   ${String(v.tot).padStart(3)}    |       ${String(v.snapAudio).padStart(3)}         |        ${String(v.existeAudio).padStart(3)}${flag}`);
  }
  console.log(`\nprefere ÁUDIO e NÃO recebe áudio: ${prefAudioNaoServido} entrega(s)`);
  console.log(`prefere VÍDEO e NÃO recebe vídeo: ${prefVideoNaoServido} entrega(s)`);
  if (casos.length) { console.log('\n--- casos (áudio) ---'); casos.forEach((x) => console.log(x)); }
}
main().catch((e) => { console.error(e); process.exit(1); });
