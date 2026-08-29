/* eslint-disable */
// READ-ONLY: em TODAS as semanas, algum core_id do plano aponta p/ conteúdo apagado
// e o overlay NÃO cobre? (o que eu quebrei ao regerar os kits)
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
  const { data: mcAll } = await sb.from('micro_conteudos').select('id').or(`empresa_id.eq.${EMP},empresa_id.is.null`);
  const existe = new Set((mcAll||[]).map((m:any)=>m.id));
  const porSem = new Map<number, string[]>();
  let totGravado = 0;
  for (const t of (trilhas||[])) {
    const c = colabs[(t as any).colaborador_id]; if(!c) continue;
    const disc = String(c.perfil_dominante||'').charAt(0).toUpperCase();
    const plano = JSON.parse(JSON.stringify((t as any).temporada_plano||[]));
    const kitsCache = await precarregarKits(sb,{empresaId:EMP,disc,cargo:c.cargo}).catch(()=>undefined);
    for (const s of plano) {
      if (s?.tipo!=='conteudo') continue;
      // conta órfãos no GRAVADO (antes do overlay)
      for (const e of (s.conteudos_dia||[])) if (e.conteudo?.core_id && !existe.has(e.conteudo.core_id)) totGravado++;
      await overlayKitNaSemana(sb, s, { empresaId:EMP, disc, cargo:c.cargo, formatoPref: formatoPreferido(c) as any, competenciaFoco:(t as any).competencia_foco, kitsCache });
      for (const [i,e] of (s.conteudos_dia||[]).entries()) {
        const cid = e.conteudo?.core_id;
        if (cid && existe.has(cid)) continue;
        const w = Number(s.semana);
        if(!porSem.has(w)) porSem.set(w,[]);
        porSem.get(w)!.push(`${c.nome_completo} (${c.cargo}/${disc}) P${i+1} "${e.descritor}"`);
      }
    }
  }
  console.log(`core_id órfãos no plano GRAVADO (pré-overlay): ${totGravado}`);
  let tot=0;
  console.log(`\nSEM CORE PÓS-OVERLAY (o que a pessoa realmente perde):`);
  for (const w of [...porSem.keys()].sort((a,b)=>a-b)) { const v=porSem.get(w)!; tot+=v.length; console.log(`  semana ${w}: ${v.length}`); v.slice(0,3).forEach(x=>console.log(`     ${x}`)); }
  console.log(tot ? `\n🔴 TOTAL QUEBRADO: ${tot}` : `\n✅ NENHUM quebrado pós-overlay (o overlay cobre todos os órfãos)`);
}
main().catch(e=>{console.error(e);process.exit(1);});
