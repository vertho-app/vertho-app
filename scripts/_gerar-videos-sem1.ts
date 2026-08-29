/* eslint-disable */
// Gera os vídeos que faltam pros video-preferrers da semana 1 (Ibipeba). Combo =
// (modulo_base do TEXTO × cargo × DISC) — o mesmo anchor do fix de resolução, então
// o vídeo gerado RESOLVE. Dispara resolverCelulaVideo(gerar:true) por combo.
process.loadEnvFile('.env.local');
if (!process.env.HCLOUD_TOKEN && process.env['Hetzner Cloud api token']) process.env.HCLOUD_TOKEN = process.env['Hetzner Cloud api token'];
import { createSupabaseAdmin } from '@/lib/supabase';
import { resolverCelulaVideo } from '@/actions/gerar-video';
import { derivarPrioridadeFormatos } from '@/lib/season-engine/formato-preferido';

const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe';

async function main() {
  const sb = createSupabaseAdmin();
  const { data: trilhas } = await sb.from('trilhas').select('colaborador_id,temporada_plano').eq('empresa_id', EMP).eq('status', 'ativa');
  const ids = (trilhas || []).map((t: any) => t.colaborador_id);
  const { data: cs } = await sb.from('colaboradores').select('id,cargo,perfil_dominante,pref_video_curto,pref_video_longo,pref_texto,pref_audio,pref_estudo_caso').in('id', ids);
  const colabs = Object.fromEntries((cs || []).map((c: any) => [c.id, c]));
  const { data: mcAll } = await sb.from('micro_conteudos').select('id,modulo_base_id').eq('empresa_id', EMP);
  const mbById = Object.fromEntries((mcAll || []).map((m: any) => [m.id, m.modulo_base_id]));
  const { data: vg } = await sb.from('videos_gerados').select('modulo_base_id,disc_dominante').eq('empresa_id', EMP).eq('status', 'done');
  const temVid = new Set((vg || []).map((v: any) => v.modulo_base_id + '|' + String(v.disc_dominante || '').toUpperCase()));

  // combos (mb|cargo|disc) que faltam, com um colaborador representante
  const combos = new Map<string, { mb: string; cargo: string; disc: string; colab: string }>();
  for (const t of (trilhas || [])) {
    const c = colabs[(t as any).colaborador_id]; if (!c || derivarPrioridadeFormatos(c)[0] !== 'video') continue;
    const disc = String(c.perfil_dominante || '').charAt(0).toUpperCase();
    const s1 = ((t as any).temporada_plano || []).find((s: any) => Number(s.semana) === 1);
    for (const e of (s1?.conteudos_dia || []).slice(0, 2)) {
      const mb = mbById[e.conteudo?.core_id]; if (!mb) continue;
      const key = `${mb}|${c.cargo}|${disc}`;
      if (temVid.has(mb + '|' + disc)) continue; // já tem vídeo
      if (!combos.has(key)) combos.set(key, { mb, cargo: c.cargo, disc, colab: c.id });
    }
  }
  const lista = [...combos.values()];
  console.log(`Combos a gerar: ${lista.length} (roteiro batch em PARALELO, pool 8)\n`);

  let ok = 0, err = 0, jaExistia = 0, feitos = 0;
  const CONC = 8;
  async function fire(cb: any) {
    try {
      const r: any = await resolverCelulaVideo(cb.mb, EMP, cb.cargo, cb.disc as any, 'batch-video-sem1', { sb, gerar: true, colaboradorId: cb.colab });
      if (r?.error) { console.log(`X ${cb.cargo}/${cb.disc} mb=${cb.mb.slice(0, 8)}: ${r.error}`); err++; }
      else if (r?.reused) { jaExistia++; }
      else { console.log(`✓ ${cb.cargo}/${cb.disc} mb=${cb.mb.slice(0, 8)} → video ${String(r?.id || '').slice(0, 8)}`); ok++; }
    } catch (e: any) { console.log(`X ${cb.cargo}/${cb.disc}: THREW ${e?.message || e}`); err++; }
    feitos++; if (feitos % 5 === 0) console.log(`  … ${feitos}/${lista.length}`);
  }
  // pool de concorrência
  const fila = [...lista];
  await Promise.all(Array.from({ length: Math.min(CONC, fila.length) }, async () => {
    while (fila.length) { const cb = fila.shift(); if (cb) await fire(cb); }
  }));
  console.log(`\nDONE: ${ok} disparados, ${jaExistia} já existiam, ${err} erro(s)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
