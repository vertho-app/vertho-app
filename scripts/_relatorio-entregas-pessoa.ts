/* eslint-disable */
// READ-ONLY: gera JSON do que CADA pessoa recebe por semana (descritor, formato, título,
// DISC do conteúdo servido, desafio efetivo pós-overlay) → alimenta o artifact de auditoria.
process.loadEnvFile('.env.local');
import fs from 'node:fs';
import { createSupabaseAdmin } from '@/lib/supabase';
import { derivarPrioridadeFormatos } from '@/lib/season-engine/formato-preferido';
import { normDescritor } from '@/lib/blueprint/to-descriptors';

const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe';
const OUT = 'C:/Users/rdnav/AppData/Local/Temp/claude/C--GAS-Vertho-App/94433f1c-58d5-4980-8ba2-3c1207f2e614/scratchpad/entregas.json';

async function main() {
  const sb = createSupabaseAdmin();
  const { data: trilhas } = await sb.from('trilhas').select('colaborador_id,temporada_plano,competencia_foco,data_inicio').eq('empresa_id', EMP).eq('status', 'ativa');
  const ids = (trilhas || []).map((t: any) => t.colaborador_id);
  const { data: cs } = await sb.from('colaboradores').select('id,nome_completo,cargo,perfil_dominante,pref_video_curto,pref_video_longo,pref_texto,pref_audio,pref_estudo_caso').in('id', ids);
  const colabs = Object.fromEntries((cs || []).map((c: any) => [c.id, c]));
  const { data: mcAll } = await sb.from('micro_conteudos').select('id,kit_id,formato,titulo,competencia,descritor,cargo,modulo_base_id').eq('empresa_id', EMP);
  const mcById = Object.fromEntries((mcAll || []).map((m: any) => [m.id, m]));
  const { data: briefs } = await sb.from('kit_briefs').select('id,competencia,descritor,cargo').or(`empresa_id.eq.${EMP},empresa_id.is.null`);
  const bById = Object.fromEntries((briefs || []).map((b: any) => [b.id, b]));
  const { data: kits } = await sb.from('kits').select('id,brief_id,disc,status,desafio').in('brief_id', (briefs || []).map((b: any) => b.id));
  const kitById = Object.fromEntries((kits || []).map((k: any) => [k.id, k]));
  const kitPorChave = new Map<string, any>();
  for (const k of (kits || [])) {
    if (k.status !== 'published') continue;
    const b = bById[k.brief_id]; if (!b) continue;
    kitPorChave.set(`${b.competencia}|${normDescritor(b.descritor)}|${b.cargo}|${k.disc}`, k);
  }
  const { data: vg } = await sb.from('videos_gerados').select('modulo_base_id,cargo,disc_dominante,kit_id').eq('empresa_id', EMP).eq('status', 'done');
  const vidCell = new Set((vg || []).map((v: any) => `${v.modulo_base_id}|${v.cargo}|${String(v.disc_dominante || '').toUpperCase()}`));

  const pessoas: any[] = [];
  for (const t of (trilhas || [])) {
    const c = colabs[(t as any).colaborador_id]; if (!c) continue;
    const disc = String(c.perfil_dominante || '').charAt(0).toUpperCase();
    const pref = derivarPrioridadeFormatos(c)[0];
    const semanas: any[] = [];
    for (const s of ((t as any).temporada_plano || [])) {
      if (s?.tipo !== 'conteudo') { semanas.push({ semana: Number(s.semana), tipo: s.tipo, entregas: [] }); continue; }
      const entregas: any[] = [];
      for (const [i, e] of (s.conteudos_dia || []).entries()) {
        const comp = e.competencia || (t as any).competencia_foco;
        const core = e.conteudo?.core_id ? mcById[e.conteudo.core_id] : null;
        const kitDoCore = core?.kit_id ? kitById[core.kit_id] : null;
        const discDoConteudo = kitDoCore?.disc || null;
        const chaveDela = `${comp}|${normDescritor(e.descritor)}|${c.cargo}|${disc}`;
        const kitDela = kitPorChave.get(chaveDela) || null;
        const temVideo = core?.modulo_base_id ? vidCell.has(`${core.modulo_base_id}|${c.cargo}|${disc}`) : false;
        // desafio EFETIVO = o que o overlay entrega (kit do DISC dela) ou o do plano
        const desafioEfetivo = kitDela?.desafio?.desafio_texto || e.conteudo?.desafio_texto || null;
        const vaza = !!discDoConteudo && discDoConteudo !== disc && !kitDela;
        entregas.push({
          pilula: i + 1, competencia: comp, descritor: e.descritor,
          formato_core: e.conteudo?.formato_core || null, titulo: core?.titulo || e.conteudo?.core_titulo || null,
          disc_do_conteudo: discDoConteudo, kit_do_disc_dela: !!kitDela, tem_video: temVideo,
          desafio: desafioEfetivo, desafio_generico: !kitDela, vaza,
        });
      }
      semanas.push({ semana: Number(s.semana), tipo: s.tipo, entregas });
    }
    pessoas.push({ id: c.id, nome: c.nome_completo, cargo: c.cargo, disc, pref, semanas });
  }
  pessoas.sort((a, b) => a.nome.localeCompare(b.nome));
  fs.writeFileSync(OUT, JSON.stringify({ geradoEm: '2026-07-16', empresa: 'Ibipeba', pessoas }, null, 0));
  const totVaza = pessoas.flatMap((p) => p.semanas.flatMap((s: any) => s.entregas)).filter((e: any) => e.vaza).length;
  const totGen = pessoas.flatMap((p) => p.semanas.flatMap((s: any) => s.entregas)).filter((e: any) => e.desafio_generico).length;
  const tot = pessoas.flatMap((p) => p.semanas.flatMap((s: any) => s.entregas)).length;
  console.log(`pessoas: ${pessoas.length} | entregas: ${tot} | vazamento DISC: ${totVaza} | desafio genérico: ${totGen}`);
  console.log('JSON →', OUT);
}
main().catch((e) => { console.error(e); process.exit(1); });
