/* eslint-disable */
// READ-ONLY: custo REAL da opção A. Para os combos SEM desafio de Kit, resolve o
// módulo-base do jeito que o brief do Kit resolve (por COMPETÊNCIA — sem cargo/descritor)
// e conta quantas CÉLULAS de vídeo (mb × cargo × disc) já têm vídeo `done` (reuso)
// vs quantas renderizariam de verdade.
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { resolverDesafioDoKit } from '@/lib/season-engine/kit/desafio-semana';
import { resolverModuloBaseParaConteudo } from '@/lib/season-engine/modulo-base-integration';
import { normDescritor } from '@/lib/blueprint/to-descriptors';

const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe';
const CUSTO_VIDEO = 0.64; // $/vídeo (memória: HeyGen dominante)

async function main() {
  const sb = createSupabaseAdmin();
  const { data: trilhas } = await sb.from('trilhas').select('colaborador_id,temporada_plano,competencia_foco').eq('empresa_id', EMP).eq('status', 'ativa');
  const ids = (trilhas || []).map((t: any) => t.colaborador_id);
  const { data: cs } = await sb.from('colaboradores').select('id,cargo,perfil_dominante').in('id', ids);
  const colabs = Object.fromEntries((cs || []).map((c: any) => [c.id, c]));

  const combos = new Map<string, { competencia: string; descritor: string; disc: string; cargo: string }>();
  for (const t of (trilhas || [])) {
    const c = colabs[(t as any).colaborador_id]; if (!c) continue;
    const disc = String(c.perfil_dominante || '').charAt(0).toUpperCase();
    if (!['D', 'I', 'S', 'C'].includes(disc)) continue;
    for (const s of ((t as any).temporada_plano || [])) {
      if (s?.tipo === 'aplicacao') continue;
      for (const e of (s?.conteudos_dia || [])) {
        const competencia = e.competencia || (t as any).competencia_foco;
        if (!competencia || !e.descritor) continue;
        const key = `${competencia}|${normDescritor(e.descritor)}|${disc}|${c.cargo}`;
        if (!combos.has(key)) combos.set(key, { competencia, descritor: e.descritor, disc, cargo: c.cargo });
      }
    }
  }

  // Só os que NÃO têm desafio de kit
  const faltam: any[] = [];
  const fila = [...combos.values()];
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (fila.length) {
      const cb = fila.shift(); if (!cb) continue;
      const k = await resolverDesafioDoKit(sb, { empresaId: EMP, competencia: cb.competencia, descritor: cb.descritor, disc: cb.disc, cargo: cb.cargo }).catch(() => null);
      if (!k?.desafio_texto) faltam.push(cb);
    }
  }));
  console.log(`Combos SEM desafio de Kit: ${faltam.length}`);
  const temas = new Set(faltam.map((f) => `${f.cargo}|${f.competencia}|${normDescritor(f.descritor)}`));
  console.log(`Temas reais: ${temas.size}\n`);

  // MB do jeito do brief CORRIGIDO: por (competência × descritor × cargo).
  const mbPorTema = new Map<string, string | null>();
  for (const f of faltam) {
    const ck = `${f.competencia}|${normDescritor(f.descritor)}|${f.cargo}`;
    if (mbPorTema.has(ck)) continue;
    const esc = await resolverModuloBaseParaConteudo(sb, {
      competenciaNome: f.competencia, descritor: f.descritor, nivelMin: 1.0, cargo: f.cargo, empresaId: EMP,
    }).catch(() => null);
    mbPorTema.set(ck, esc?.modulo?.id || null);
  }
  console.log(`MBs distintos resolvidos (comp×desc×cargo): ${new Set([...mbPorTema.values()].filter(Boolean)).size} para ${mbPorTema.size} temas`);

  // Células de vídeo distintas (mb × cargo × disc) e quais já têm `done`
  const { data: vg } = await sb.from('videos_gerados').select('modulo_base_id,cargo,disc_dominante').eq('empresa_id', EMP).eq('status', 'done');
  const done = new Set((vg || []).map((v: any) => `${v.modulo_base_id}|${v.cargo}|${String(v.disc_dominante || '').toUpperCase()}`));

  const celulas = new Map<string, { reused: boolean }>();
  let semMb = 0;
  for (const f of faltam) {
    const mb = mbPorTema.get(`${f.competencia}|${normDescritor(f.descritor)}|${f.cargo}`);
    if (!mb) { semMb++; continue; }
    const key = `${mb}|${f.cargo}|${f.disc}`;
    if (!celulas.has(key)) celulas.set(key, { reused: done.has(key) });
  }
  const total = celulas.size;
  const reused = [...celulas.values()].filter((c) => c.reused).length;
  const novos = total - reused;
  console.log(`\n=== CUSTO REAL DA OPÇÃO A ===`);
  console.log(`combos sem kit: ${faltam.length} | temas: ${temas.size} | combos sem MB resolvido: ${semMb}`);
  console.log(`CÉLULAS de vídeo distintas (mb × cargo × disc): ${total}`);
  console.log(`  já têm vídeo done (REUSO, $0): ${reused}`);
  console.log(`  renderizariam DE VERDADE: ${novos}  → ~$${(novos * CUSTO_VIDEO).toFixed(2)} de vídeo`);
  console.log(`\n(+ IA: ${temas.size} briefs + ${faltam.length} desafios + ${faltam.length * 4} formatos de conteúdo)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
