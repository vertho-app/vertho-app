/* eslint-disable */
// READ-ONLY: raio-x da semana 2 PÓS-OVERLAY — o que a pessoa REALMENTE recebe.
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { derivarPrioridadeFormatos } from '@/lib/season-engine/formato-preferido';
import { precarregarKits, overlayKitNaSemana, formatoPreferido } from '@/lib/season-engine/kit/entrega-semana';
const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe';
const SEM = 2;
async function main() {
  const sb = createSupabaseAdmin();
  const { data: trilhas } = await sb.from('trilhas').select('colaborador_id,temporada_plano,competencia_foco').eq('empresa_id', EMP).eq('status','ativa');
  const ids = (trilhas||[]).map((t:any)=>t.colaborador_id);
  const { data: cs } = await sb.from('colaboradores').select('id,nome_completo,cargo,perfil_dominante,pref_video_curto,pref_video_longo,pref_texto,pref_audio,pref_estudo_caso').in('id', ids);
  const colabs = Object.fromEntries((cs||[]).map((c:any)=>[c.id,c]));
  const { data: mcAll } = await sb.from('micro_conteudos').select('id,modulo_base_id').or(`empresa_id.eq.${EMP},empresa_id.is.null`);
  const mcById = Object.fromEntries((mcAll||[]).map((m:any)=>[m.id,m]));
  const { data: vg } = await sb.from('videos_gerados').select('modulo_base_id,cargo,disc_dominante').eq('empresa_id',EMP).eq('status','done');
  const vidCell = new Set((vg||[]).map((v:any)=>`${v.modulo_base_id}|${v.cargo}|${String(v.disc_dominante||'').toUpperCase()}`));
  let tot=0, semCore=0, prefNao=0; const casos:string[]=[];
  for (const t of (trilhas||[])) {
    const c = colabs[(t as any).colaborador_id]; if(!c) continue;
    const disc = String(c.perfil_dominante||'').charAt(0).toUpperCase();
    const pref = derivarPrioridadeFormatos(c)[0];
    const plano = JSON.parse(JSON.stringify((t as any).temporada_plano||[]));
    const s = plano.find((x:any)=>Number(x.semana)===SEM); if(!s) continue;
    const kitsCache = await precarregarKits(sb,{empresaId:EMP,disc,cargo:c.cargo}).catch(()=>undefined);
    await overlayKitNaSemana(sb, s, { empresaId:EMP, disc, cargo:c.cargo, formatoPref: formatoPreferido(c) as any, competenciaFoco:(t as any).competencia_foco, kitsCache });
    for (const [i,e] of (s.conteudos_dia||[]).entries()) {
      tot++;
      const cc = e.conteudo||{};
      const core = cc.core_id ? mcById[cc.core_id] : null;
      if (!core) { semCore++; casos.push(`   SEM CORE: ${c.nome_completo} P${i+1} "${e.descritor}"`); continue; }
      const temVideo = core.modulo_base_id ? vidCell.has(`${core.modulo_base_id}|${c.cargo}|${disc}`) : false;
      const snap = Object.keys(cc.formatos_disponiveis||{});
      const oferecidos = [...snap.filter((f:string)=>f!=='video'), ...(temVideo?['video']:[])];
      if (!oferecidos.includes(pref)) { prefNao++; if(casos.length<8) casos.push(`   pref=${pref} NÃO servido: ${c.nome_completo} (${c.cargo}/${disc}) P${i+1} → ${oferecidos.join('/')||'NADA'}`); }
    }
  }
  console.log(`=== SEMANA ${SEM} PÓS-OVERLAY (o que a pessoa recebe) ===`);
  console.log(`entregas: ${tot}`);
  console.log(`SEM core (conteúdo quebrado): ${semCore}`);
  console.log(`formato preferido NÃO servido: ${prefNao}`);
  if(casos.length){console.log('');casos.slice(0,8).forEach(x=>console.log(x));}
  if(!semCore && !prefNao) console.log('\n✅ ninguém quebrado');
}
main().catch(e=>{console.error(e);process.exit(1);});
