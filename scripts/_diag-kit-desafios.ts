/* eslint-disable */
// READ-ONLY: quantos combos (competência × descritor × DISC × cargo) das trilhas ativas
// do Ibipeba NÃO têm desafio de Kit publicado (→ caem no genérico). Lista o gap.
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { resolverDesafioDoKit } from '@/lib/season-engine/kit/desafio-semana';
import { normDescritor } from '@/lib/blueprint/to-descriptors';

const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe';

async function main() {
  const sb = createSupabaseAdmin();
  const { data: trilhas } = await sb.from('trilhas').select('colaborador_id,temporada_plano,competencia_foco').eq('empresa_id', EMP).eq('status', 'ativa');
  const ids = (trilhas || []).map((t: any) => t.colaborador_id);
  const { data: cs } = await sb.from('colaboradores').select('id,cargo,perfil_dominante').in('id', ids);
  const colabs = Object.fromEntries((cs || []).map((c: any) => [c.id, c]));

  // Enumera combos DISTINTOS (competencia|descritor|disc|cargo) que aparecem nas trilhas.
  const combos = new Map<string, { competencia: string; descritor: string; disc: string; cargo: string; semanas: Set<number> }>();
  for (const t of (trilhas || [])) {
    const c = colabs[(t as any).colaborador_id]; if (!c) continue;
    const disc = String(c.perfil_dominante || '').charAt(0).toUpperCase();
    if (!['D', 'I', 'S', 'C'].includes(disc)) continue;
    for (const s of ((t as any).temporada_plano || [])) {
      if (s?.tipo === 'aplicacao') continue;
      for (const e of (s?.conteudos_dia || [])) {
        const competencia = e.competencia || (t as any).competencia_foco;
        const descritor = e.descritor;
        if (!competencia || !descritor) continue;
        const key = `${competencia}|${descritor}|${disc}|${c.cargo}`;
        if (!combos.has(key)) combos.set(key, { competencia, descritor, disc, cargo: c.cargo, semanas: new Set() });
        combos.get(key)!.semanas.add(Number(s.semana));
      }
    }
  }

  const todos = [...combos.values()];
  console.log(`Combos DISTINTOS (comp×desc×DISC×cargo) nas trilhas ativas: ${todos.length}\n`);
  let temKit = 0; const faltam: any[] = [];
  const CONC = 6; const fila = [...todos];
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (fila.length) {
      const cb = fila.shift(); if (!cb) continue;
      const k = await resolverDesafioDoKit(sb, { empresaId: EMP, competencia: cb.competencia, descritor: cb.descritor, disc: cb.disc, cargo: cb.cargo }).catch(() => null);
      if (k?.desafio_texto) temKit++; else faltam.push(cb);
    }
  }));

  console.log(`COM desafio de Kit publicado: ${temKit}`);
  console.log(`SEM (caem no genérico): ${faltam.length}\n`);
  // agrupa o gap por (cargo, competencia, descritor) — quantos DISC faltam de cada
  const porTema = new Map<string, Set<string>>();
  for (const f of faltam) {
    const k = `${f.cargo} › ${f.competencia} › ${f.descritor}`;
    if (!porTema.has(k)) porTema.set(k, new Set());
    porTema.get(k)!.add(f.disc);
  }
  console.log(`Temas (cargo×comp×descritor CRU) com algum DISC faltando: ${porTema.size}`);
  for (const [k, discs] of porTema) console.log(`  [${[...discs].sort().join('')}] ${k}`);

  // ── Mesma conta, mas NORMALIZANDO o descritor (o mesmo descritor aparece com 2
  // nomes: "COO03_D1 — Consciência de limites" e "Consciência de limites") ──
  const porTemaNorm = new Map<string, Set<string>>();
  for (const f of faltam) {
    const k = `${f.cargo} › ${f.competencia} › ${normDescritor(f.descritor)}`;
    if (!porTemaNorm.has(k)) porTemaNorm.set(k, new Set());
    porTemaNorm.get(k)!.add(f.disc);
  }
  console.log(`\n=== NORMALIZADO (descritor sem prefixo de código) ===`);
  console.log(`Temas REAIS com algum DISC faltando: ${porTemaNorm.size}  (cru dizia ${porTema.size} → inflado por nome duplicado)`);
  for (const [k, discs] of porTemaNorm) console.log(`  [${[...discs].sort().join('')}] ${k}`);
  const combosNorm = new Set(faltam.map((f) => `${f.cargo}|${f.competencia}|${normDescritor(f.descritor)}|${f.disc}`));
  console.log(`\n→ Kits a gerar: ${porTemaNorm.size} temas reais / ${combosNorm.size} combos (comp×desc×DISC×cargo) — cru dizia ${porTema.size} temas / ${faltam.length} combos.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
