/* eslint-disable */
// READ-ONLY: os kits do Ibipeba cobrem QUAIS semanas? E os vídeos são kit-backed?
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { normDescritor } from '@/lib/blueprint/to-descriptors';

const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe';

async function main() {
  const sb = createSupabaseAdmin();

  // 1) Kits existentes
  const { data: briefs } = await sb.from('kit_briefs').select('id,competencia,descritor,cargo,empresa_id').or(`empresa_id.eq.${EMP},empresa_id.is.null`);
  console.log(`=== kit_briefs (empresa ou global): ${briefs?.length || 0} ===`);
  const briefIds = (briefs || []).map((b: any) => b.id);
  const { data: kits } = await sb.from('kits').select('id,brief_id,disc,status').in('brief_id', briefIds.length ? briefIds : ['00000000-0000-0000-0000-000000000000']);
  const kitsPorBrief: Record<string, any[]> = {};
  for (const k of (kits || [])) (kitsPorBrief[k.brief_id] ||= []).push(k);
  for (const b of (briefs || [])) {
    const ks = kitsPorBrief[b.id] || [];
    console.log(`  ${b.cargo} › ${b.competencia} › "${b.descritor}" → ${ks.map((k: any) => k.disc + ':' + k.status).sort().join(' ') || '(sem kits)'}`);
  }
  const pub = (kits || []).filter((k: any) => k.status === 'published');
  console.log(`\nkits: ${kits?.length || 0} (published: ${pub.length})`);

  // 2) Descritores por SEMANA nas trilhas → quais semanas os kits cobrem
  const { data: trilhas } = await sb.from('trilhas').select('temporada_plano,competencia_foco').eq('empresa_id', EMP).eq('status', 'ativa');
  const cobertos = new Set<string>();
  for (const b of (briefs || [])) {
    const ks = kitsPorBrief[b.id] || [];
    if (ks.some((k: any) => k.status === 'published')) cobertos.add(`${b.competencia}|${normDescritor(b.descritor)}`);
  }
  const porSemana = new Map<number, { tot: Set<string>; cob: Set<string> }>();
  for (const t of (trilhas || [])) {
    for (const s of ((t as any).temporada_plano || [])) {
      if (s?.tipo === 'aplicacao') continue;
      const w = Number(s.semana);
      if (!porSemana.has(w)) porSemana.set(w, { tot: new Set(), cob: new Set() });
      for (const e of (s?.conteudos_dia || [])) {
        const comp = e.competencia || (t as any).competencia_foco;
        if (!comp || !e.descritor) continue;
        const key = `${comp}|${normDescritor(e.descritor)}`;
        porSemana.get(w)!.tot.add(key);
        if (cobertos.has(key)) porSemana.get(w)!.cob.add(key);
      }
    }
  }
  console.log('\n=== cobertura de KIT por semana (descritores distintos) ===');
  for (const w of [...porSemana.keys()].sort((a, b) => a - b)) {
    const v = porSemana.get(w)!;
    console.log(`  semana ${String(w).padStart(2)}: ${v.cob.size}/${v.tot.size} descritores com kit publicado`);
  }

  // 3) Vídeos: kit-backed ou não?
  const { data: vids } = await sb.from('videos_gerados').select('id,kit_id,created_by,status').eq('empresa_id', EMP).eq('status', 'done');
  const comKit = (vids || []).filter((v: any) => v.kit_id).length;
  console.log(`\n=== vídeos done: ${vids?.length || 0} ===`);
  console.log(`  COM kit_id (roteiro tem o desafio do kit): ${comKit}`);
  console.log(`  SEM kit_id (célula pura): ${(vids || []).length - comKit}`);
  const porOrigem: Record<string, number> = {};
  for (const v of (vids || [])) porOrigem[v.created_by || '(null)'] = (porOrigem[v.created_by || '(null)'] || 0) + 1;
  console.log('  por created_by:', JSON.stringify(porOrigem));
}
main().catch((e) => { console.error(e); process.exit(1); });
