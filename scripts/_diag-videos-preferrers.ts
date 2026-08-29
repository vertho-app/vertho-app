/* eslint-disable */
// READ-ONLY: conta, por semana, quantos combos de vídeo (mb|cargo|disc) faltam pros
// video-preferrers do Ibipeba. NÃO dispara render. Molde: _gerar-videos-sem1.ts.
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { derivarPrioridadeFormatos } from '@/lib/season-engine/formato-preferido';

const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe';

async function main() {
  const sb = createSupabaseAdmin();
  const { data: trilhas } = await sb.from('trilhas').select('colaborador_id,temporada_plano').eq('empresa_id', EMP).eq('status', 'ativa');
  const ids = (trilhas || []).map((t: any) => t.colaborador_id);
  const { data: cs } = await sb.from('colaboradores').select('id,nome_completo,cargo,perfil_dominante,pref_video_curto,pref_video_longo,pref_texto,pref_audio,pref_estudo_caso').in('id', ids);
  const colabs = Object.fromEntries((cs || []).map((c: any) => [c.id, c]));
  const { data: mcAll } = await sb.from('micro_conteudos').select('id,modulo_base_id').eq('empresa_id', EMP);
  const mbById = Object.fromEntries((mcAll || []).map((m: any) => [m.id, m.modulo_base_id]));
  const { data: vg } = await sb.from('videos_gerados').select('modulo_base_id,disc_dominante').eq('empresa_id', EMP).eq('status', 'done');
  const temVid = new Set((vg || []).map((v: any) => v.modulo_base_id + '|' + String(v.disc_dominante || '').toUpperCase()));

  const vprefs = (cs || []).filter((c: any) => derivarPrioridadeFormatos(c)[0] === 'video');
  console.log(`Trilhas ativas: ${trilhas?.length} | colaboradores: ${cs?.length} | VIDEO-preferrers: ${vprefs.length}`);
  console.log(`Vídeos done (mb|disc) já existentes: ${temVid.size}\n`);

  // Por semana: combos únicos (mb|cargo|disc) faltando, separando pílula 1 vs 2 (índice)
  const MAXW = 14;
  console.log('semana | falta(P1) | falta(P2) | falta(total combos únicos)');
  const globalMissing = new Map<string, { mb: string; cargo: string; disc: string; sem: number; pilula: number }>();
  for (let w = 1; w <= MAXW; w++) {
    const missP: [Set<string>, Set<string>] = [new Set(), new Set()];
    for (const t of (trilhas || [])) {
      const c = colabs[(t as any).colaborador_id]; if (!c || derivarPrioridadeFormatos(c)[0] !== 'video') continue;
      const disc = String(c.perfil_dominante || '').charAt(0).toUpperCase();
      const sw = ((t as any).temporada_plano || []).find((s: any) => Number(s.semana) === w);
      const cds = (sw?.conteudos_dia || []).slice(0, 2);
      cds.forEach((e: any, idx: number) => {
        const mb = mbById[e.conteudo?.core_id]; if (!mb) return;
        if (temVid.has(mb + '|' + disc)) return; // já tem vídeo
        const key = `${mb}|${c.cargo}|${disc}`;
        missP[idx]?.add(key);
        if (!globalMissing.has(key + '|' + w)) globalMissing.set(key + '|' + w, { mb, cargo: c.cargo, disc, sem: w, pilula: idx + 1 });
      });
    }
    const uni = new Set([...missP[0], ...missP[1]]);
    if (uni.size) console.log(`  ${String(w).padStart(2)}   |    ${String(missP[0].size).padStart(3)}    |    ${String(missP[1].size).padStart(3)}    |    ${uni.size}`);
  }
  const all = [...globalMissing.values()];
  const distinctCombos = new Set(all.map((x) => `${x.mb}|${x.cargo}|${x.disc}`));
  console.log(`\nTOTAL combos (mb|cargo|disc) DISTINTOS faltando (todas semanas): ${distinctCombos.size}`);
  console.log(`(um vídeo por combo distinto cobre todas as semanas/pílulas que o usam)`);
  // foco semana 2
  const sem2 = all.filter((x) => x.sem === 2);
  const sem2combos = new Set(sem2.map((x) => `${x.mb}|${x.cargo}|${x.disc}`));
  console.log(`SEMANA 2: ${sem2combos.size} combos distintos faltando (P1+P2).`);
}
main().catch((e) => { console.error(e); process.exit(1); });
