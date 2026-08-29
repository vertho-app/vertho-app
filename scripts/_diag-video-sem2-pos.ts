/* eslint-disable */
// READ-ONLY: vídeo dos video-preferrers na semana 2, PÓS-OVERLAY (core real).
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { derivarPrioridadeFormatos } from '@/lib/season-engine/formato-preferido';
import { precarregarKits, overlayKitNaSemana, formatoPreferido } from '@/lib/season-engine/kit/entrega-semana';
const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe';
async function main() {
  const sb = createSupabaseAdmin();
  const { data: trilhas } = await sb.from('trilhas').select('colaborador_id,temporada_plano,competencia_foco').eq('empresa_id', EMP).eq('status','ativa');
  const ids = (trilhas||[]).map((t:any)=>t.colaborador_id);
  const { data: cs } = await sb.from('colaboradores').select('id,nome_completo,cargo,perfil_dominante,pref_video_curto,pref_video_longo,pref_texto,pref_audio,pref_estudo_caso').in('id', ids);
  const colabs = Object.fromEntries((cs||[]).map((c:any)=>[c.id,c]));
  const { data: mcAll } = await sb.from('micro_conteudos').select('id,modulo_base_id').or(`empresa_id.eq.${EMP},empresa_id.is.null`);
  const mcById = Object.fromEntries((mcAll||[]).map((m:any)=>[m.id,m]));
  const { data: vg } = await sb.from('videos_gerados').select('id,modulo_base_id,cargo,disc_dominante').eq('empresa_id',EMP).eq('status','done');
  const cellBy = new Map((vg||[]).map((v:any)=>[`${v.modulo_base_id}|${v.cargo}|${String(v.disc_dominante||'').toUpperCase()}`, v]));
  const { data: vp } = await sb.from('videos_personalizados').select('cell_video_id,colaborador_id,status');
  const persoOk = new Set((vp||[]).filter((p:any)=>p.status==='done').map((p:any)=>`${p.cell_video_id}|${p.colaborador_id}`));
  let vpref=0, comVideo=0, comSaud=0, semSaud=0, semVideo=0; const casos:string[]=[];
  for (const t of (trilhas||[])) {
    const c = colabs[(t as any).colaborador_id]; if(!c) continue;
    if (derivarPrioridadeFormatos(c)[0] !== 'video') continue;
    const disc = String(c.perfil_dominante||'').charAt(0).toUpperCase();
    const plano = JSON.parse(JSON.stringify((t as any).temporada_plano||[]));
    const s = plano.find((x:any)=>Number(x.semana)===2); if(!s) continue;
    const kitsCache = await precarregarKits(sb,{empresaId:EMP,disc,cargo:c.cargo}).catch(()=>undefined);
    await overlayKitNaSemana(sb, s, { empresaId:EMP, disc, cargo:c.cargo, formatoPref: formatoPreferido(c) as any, competenciaFoco:(t as any).competencia_foco, kitsCache });
    for (const [i,e] of (s.conteudos_dia||[]).entries()) {
      vpref++;
      const core = e.conteudo?.core_id ? mcById[e.conteudo.core_id] : null;
      const cell = core?.modulo_base_id ? cellBy.get(`${core.modulo_base_id}|${c.cargo}|${disc}`) : null;
      if (!cell) { semVideo++; if(casos.length<5) casos.push(`   SEM VÍDEO: ${c.nome_completo} (${c.cargo}/${disc}) P${i+1} "${e.descritor}"`); continue; }
      comVideo++;
      if (persoOk.has(`${cell.id}|${c.id}`)) comSaud++; else { semSaud++; casos.push(`   sem saudação: ${c.nome_completo} (${c.cargo}/${disc}) P${i+1} "${e.descritor}"`); }
    }
  }
  console.log(`SEMANA 2 · video-preferrers PÓS-OVERLAY`);
  console.log(`  entregas: ${vpref}`);
  console.log(`  com vídeo: ${comVideo}  (COM saudação ${comSaud} · sem saudação ${semSaud})`);
  console.log(`  SEM vídeo (cai noutro formato): ${semVideo}`);
  if(casos.length){console.log('');casos.slice(0,6).forEach(x=>console.log(x));}
}
main().catch(e=>{console.error(e);process.exit(1);});
