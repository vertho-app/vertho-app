/* eslint-disable */
// READ-ONLY: dos kits publicados, quantos AINDA servem >=1 pessoa nas trilhas atuais
// (pós-regen 036b6036) e quantos ficaram ÓRFÃOS (o descritor saiu da trilha daquele cohort).
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { normDescritor } from '@/lib/blueprint/to-descriptors';

const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe';

async function main() {
  const sb = createSupabaseAdmin();

  // Combos VIVOS: (cargo, competencia, descritor, disc) que aparecem em trilha ativa
  // de pelo menos 1 pessoa. Guarda também quantas pessoas e em que semanas.
  const { data: trilhas } = await sb.from('trilhas').select('colaborador_id,temporada_plano,competencia_foco').eq('empresa_id', EMP).eq('status', 'ativa');
  const ids = (trilhas || []).map((t: any) => t.colaborador_id);
  const { data: cs } = await sb.from('colaboradores').select('id,cargo,perfil_dominante').in('id', ids);
  const colabs = Object.fromEntries((cs || []).map((c: any) => [c.id, c]));

  const vivos = new Map<string, { pessoas: Set<string>; semanas: Set<number> }>();
  for (const t of (trilhas || [])) {
    const c = colabs[(t as any).colaborador_id]; if (!c) continue;
    const disc = String(c.perfil_dominante || '').charAt(0).toUpperCase();
    if (!['D', 'I', 'S', 'C'].includes(disc)) continue;
    for (const s of ((t as any).temporada_plano || [])) {
      if (s?.tipo === 'aplicacao') continue;
      for (const e of (s?.conteudos_dia || [])) {
        const comp = e.competencia || (t as any).competencia_foco;
        if (!comp || !e.descritor) continue;
        const key = `${c.cargo}|${comp}|${normDescritor(e.descritor)}|${disc}`;
        if (!vivos.has(key)) vivos.set(key, { pessoas: new Set(), semanas: new Set() });
        vivos.get(key)!.pessoas.add(c.id);
        vivos.get(key)!.semanas.add(Number(s.semana));
      }
    }
  }
  console.log(`Combos VIVOS (cargo×comp×desc×DISC com >=1 pessoa): ${vivos.size}\n`);

  // Kits publicados
  const { data: briefs } = await sb.from('kit_briefs').select('id,competencia,descritor,cargo').or(`empresa_id.eq.${EMP},empresa_id.is.null`);
  const bById = Object.fromEntries((briefs || []).map((b: any) => [b.id, b]));
  const { data: kits } = await sb.from('kits').select('id,brief_id,disc,status').in('brief_id', (briefs || []).map((b: any) => b.id));
  const pub = (kits || []).filter((k: any) => k.status === 'published');

  const alinhados: any[] = [], orfaos: any[] = [];
  for (const k of pub) {
    const b = bById[k.brief_id]; if (!b) continue;
    const key = `${b.cargo}|${b.competencia}|${normDescritor(b.descritor)}|${k.disc}`;
    const v = vivos.get(key);
    if (v) alinhados.push({ b, k, pessoas: v.pessoas.size, semanas: [...v.semanas].sort((x, y) => x - y) });
    else orfaos.push({ b, k });
  }
  console.log(`=== KITS PUBLICADOS: ${pub.length} ===`);
  console.log(`  ALINHADOS (servem >=1 pessoa hoje): ${alinhados.length}`);
  for (const a of alinhados) console.log(`    ${a.k.disc} | ${a.b.cargo} › "${a.b.descritor}" → ${a.pessoas} pessoa(s), semanas ${a.semanas.join(',')}`);
  console.log(`\n  ÓRFÃOS (descritor não está mais na trilha desse cohort): ${orfaos.length}`);
  for (const o of orfaos) console.log(`    ${o.k.disc} | ${o.b.cargo} › "${o.b.descritor}"`);

  const cobertos = new Set(alinhados.map((a) => `${a.b.cargo}|${a.b.competencia}|${normDescritor(a.b.descritor)}|${a.k.disc}`));
  const faltam = [...vivos.keys()].filter((k) => !cobertos.has(k));
  console.log(`\n=== VEREDITO ===`);
  console.log(`combos vivos: ${vivos.size} | com kit alinhado: ${cobertos.size} | SEM kit: ${faltam.length}`);
  console.log(`kits órfãos (trabalho jogado fora pelo regen): ${orfaos.length} de ${pub.length}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
