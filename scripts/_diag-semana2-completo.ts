/* eslint-disable */
// READ-ONLY: raio-x da SEMANA 2 do Ibipeba. Por pessoa × entrega (2 DUO), checa:
// core (texto), áudio ativo, vídeo da célula, desafio de Kit, e se o FORMATO PREFERIDO é servido.
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { resolverDesafioDoKit } from '@/lib/season-engine/kit/desafio-semana';
import { derivarPrioridadeFormatos } from '@/lib/season-engine/formato-preferido';
import { normDescritor } from '@/lib/blueprint/to-descriptors';

const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe';
const SEM = 2;

async function main() {
  const sb = createSupabaseAdmin();
  const { data: trilhas } = await sb.from('trilhas').select('colaborador_id,temporada_plano,competencia_foco').eq('empresa_id', EMP).eq('status', 'ativa');
  const ids = (trilhas || []).map((t: any) => t.colaborador_id);
  const { data: cs } = await sb.from('colaboradores').select('id,nome_completo,cargo,perfil_dominante,pref_video_curto,pref_video_longo,pref_texto,pref_audio,pref_estudo_caso').in('id', ids);
  const colabs = Object.fromEntries((cs || []).map((c: any) => [c.id, c]));

  // catálogo de conteúdo
  const { data: mcAll } = await sb.from('micro_conteudos').select('id,modulo_base_id,formato,ativo,competencia,descritor,cargo').eq('empresa_id', EMP);
  const mcById = Object.fromEntries((mcAll || []).map((m: any) => [m.id, m]));
  // áudio ativo por (competencia|descritor|cargo)
  const audioOk = new Set((mcAll || []).filter((m: any) => m.formato === 'audio' && m.ativo).map((m: any) => `${m.competencia}|${normDescritor(m.descritor)}|${m.cargo}`));
  const caseOk = new Set((mcAll || []).filter((m: any) => (m.formato === 'case' || m.formato === 'estudo_caso') && m.ativo).map((m: any) => `${m.competencia}|${normDescritor(m.descritor)}|${m.cargo}`));
  const { data: vg } = await sb.from('videos_gerados').select('modulo_base_id,cargo,disc_dominante,kit_id').eq('empresa_id', EMP).eq('status', 'done');
  const vidCell = new Map<string, boolean>(); // key → tem kit_id?
  for (const v of (vg || [])) vidCell.set(`${v.modulo_base_id}|${v.cargo}|${String(v.disc_dominante || '').toUpperCase()}`, !!v.kit_id);

  let semCore = 0, semAudio = 0, semVideo = 0, semDesafio = 0, prefNaoAtendido = 0;
  const totEntregas: any[] = [];
  const detalhe: string[] = [];

  for (const t of (trilhas || [])) {
    const c = colabs[(t as any).colaborador_id]; if (!c) continue;
    const disc = String(c.perfil_dominante || '').charAt(0).toUpperCase();
    const pref = derivarPrioridadeFormatos(c)[0];
    const plano = ((t as any).temporada_plano || []) as any[];
    const s = plano.find((x: any) => Number(x.semana) === SEM);
    if (!s) { detalhe.push(`${c.nome_completo}: SEM semana ${SEM} no plano`); continue; }
    const cds = (s.conteudos_dia || []).slice(0, 2);
    if (cds.length < 2) detalhe.push(`${c.nome_completo}: só ${cds.length} entrega(s) na semana ${SEM}`);
    for (const [i, e] of cds.entries()) {
      const comp = e.competencia || (t as any).competencia_foco;
      const key = `${comp}|${normDescritor(e.descritor)}|${c.cargo}`;
      const core = e.conteudo?.core_id ? mcById[e.conteudo.core_id] : null;
      const mb = core?.modulo_base_id;
      const temVideo = mb ? vidCell.has(`${mb}|${c.cargo}|${disc}`) : false;
      const vidComKit = mb ? vidCell.get(`${mb}|${c.cargo}|${disc}`) : false;
      const temAudio = audioOk.has(key);
      const temCase = caseOk.has(key);
      const k = await resolverDesafioDoKit(sb, { empresaId: EMP, competencia: comp, descritor: e.descritor, disc, cargo: c.cargo }).catch(() => null);
      const temDesafio = !!k?.desafio_texto;

      if (!core) semCore++;
      if (!temAudio) semAudio++;
      if (!temVideo) semVideo++;
      if (!temDesafio) semDesafio++;
      // formato preferido servido?
      const servido = pref === 'video' ? temVideo : pref === 'audio' ? temAudio : pref === 'case' ? temCase : !!core;
      if (!servido) { prefNaoAtendido++; detalhe.push(`  pref=${pref} NÃO servido: ${c.nome_completo} (${c.cargo}/${disc}) P${i + 1} "${e.descritor}"`); }
      totEntregas.push({ core: !!core, temAudio, temVideo, vidComKit, temDesafio });
    }
  }

  const n = totEntregas.length;
  console.log(`=== SEMANA ${SEM} — ${trilhas?.length} trilhas, ${n} entregas (2 por pessoa) ===\n`);
  const pct = (x: number) => `${n - x}/${n} (${Math.round(((n - x) / n) * 100)}%)`;
  console.log(`core (texto) presente : ${pct(semCore)}`);
  console.log(`áudio ativo           : ${pct(semAudio)}`);
  console.log(`vídeo da célula       : ${pct(semVideo)}`);
  console.log(`desafio de Kit        : ${pct(semDesafio)}   ← o buraco`);
  console.log(`\nvídeos COM desafio do kit no roteiro: ${totEntregas.filter((e) => e.vidComKit).length}/${totEntregas.filter((e) => e.temVideo).length}`);
  console.log(`formato preferido NÃO servido: ${prefNaoAtendido} entrega(s)`);
  if (detalhe.length) { console.log('\n--- detalhes ---'); detalhe.slice(0, 20).forEach((d) => console.log(d)); }
}
main().catch((e) => { console.error(e); process.exit(1); });
