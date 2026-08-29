/* eslint-disable */
// READ-ONLY: vazamento de DISC AGRUPADO POR SEMANA — sem corte de exibição.
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { normDescritor } from '@/lib/blueprint/to-descriptors';
const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe';
async function main() {
  const sb = createSupabaseAdmin();
  const { data: trilhas } = await sb.from('trilhas').select('colaborador_id,temporada_plano,competencia_foco').eq('empresa_id', EMP).eq('status','ativa');
  const ids = (trilhas||[]).map((t:any)=>t.colaborador_id);
  const { data: cs } = await sb.from('colaboradores').select('id,nome_completo,cargo,perfil_dominante').in('id', ids);
  const colabs = Object.fromEntries((cs||[]).map((c:any)=>[c.id,c]));
  const { data: mcAll } = await sb.from('micro_conteudos').select('id,kit_id').or(`empresa_id.eq.${EMP},empresa_id.is.null`);
  const kitByCore = new Map((mcAll||[]).map((m:any)=>[m.id,m.kit_id]));
  const { data: briefs } = await sb.from('kit_briefs').select('id,competencia,descritor,cargo').or(`empresa_id.eq.${EMP},empresa_id.is.null`);
  const bById = Object.fromEntries((briefs||[]).map((b:any)=>[b.id,b]));
  const { data: kits } = await sb.from('kits').select('id,brief_id,disc,status').in('brief_id',(briefs||[]).map((b:any)=>b.id));
  const kitById = Object.fromEntries((kits||[]).map((k:any)=>[k.id,k]));
  const existe = new Set((kits||[]).filter((k:any)=>k.status==='published').map((k:any)=>{const b=bById[k.brief_id];return b?`${b.competencia}|${normDescritor(b.descritor)}|${b.cargo}|${k.disc}`:'';}));
  const porSem = new Map<number, any[]>();
  for (const t of (trilhas||[])) {
    const c = colabs[(t as any).colaborador_id]; if(!c) continue;
    const disc = String(c.perfil_dominante||'').charAt(0).toUpperCase();
    for (const s of ((t as any).temporada_plano||[])) {
      if (s?.tipo!=='conteudo') continue;
      for (const e of (s.conteudos_dia||[])) {
        const comp = e.competencia || (t as any).competencia_foco;
        const kid = e.conteudo?.core_id ? kitByCore.get(e.conteudo.core_id) : null;
        const dc = kid ? kitById[kid]?.disc : null;
        if (!dc || dc===disc) continue;
        if (existe.has(`${comp}|${normDescritor(e.descritor)}|${c.cargo}|${disc}`)) continue; // overlay corrige
        const w = Number(s.semana);
        if(!porSem.has(w)) porSem.set(w,[]);
        porSem.get(w)!.push(`${c.nome_completo} (${c.cargo}/${disc}) ← DISC ${dc} — "${e.descritor}"`);
      }
    }
  }
  let tot=0;
  console.log('VAZAMENTO DE DISC POR SEMANA (sem corte):');
  for (const w of [...porSem.keys()].sort((a,b)=>a-b)) { const v=porSem.get(w)!; tot+=v.length; console.log(`\n  semana ${w}: ${v.length}`); v.forEach(x=>console.log(`     ${x}`)); }
  console.log(`\nTOTAL: ${tot}`);
}
main().catch(e=>{console.error(e);process.exit(1);});
