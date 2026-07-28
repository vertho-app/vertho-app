/* eslint-disable */
// READ-ONLY: quem são os 13 órfãos e qual conteúdo GENÉRICO os substituiria.
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { conteudosServiveisPorCargo, conteudosDoBuild } from '@/lib/season-engine/build-season';
import { normDescritor } from '@/lib/blueprint/to-descriptors';
const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe';
async function main() {
  const sb = createSupabaseAdmin();
  const { data: trilhas } = await sb.from('trilhas').select('id,colaborador_id,temporada_plano,competencia_foco').eq('empresa_id', EMP).eq('status','ativa');
  const ids = (trilhas||[]).map((t:any)=>t.colaborador_id);
  const { data: cs } = await sb.from('colaboradores').select('id,nome_completo,cargo,perfil_dominante').in('id', ids);
  const colabs = Object.fromEntries((cs||[]).map((c:any)=>[c.id,c]));
  const { data: mcAll } = await sb.from('micro_conteudos').select('id,kit_id,disc,formato,titulo,url,competencia,descritor,cargo,ativo').or(`empresa_id.eq.${EMP},empresa_id.is.null`);
  const existe = new Set((mcAll||[]).map((m:any)=>m.id));
  const ativos = (mcAll||[]).filter((m:any)=>m.ativo);
  let n=0;
  for (const t of (trilhas||[])) {
    const c = colabs[(t as any).colaborador_id]; if(!c) continue;
    for (const s of ((t as any).temporada_plano||[])) {
      if (s?.tipo!=='conteudo') continue;
      for (const [i,e] of (s.conteudos_dia||[]).entries()) {
        const cid = e.conteudo?.core_id;
        if (!cid || existe.has(cid)) continue;
        n++;
        const comp = e.competencia || (t as any).competencia_foco;
        // pool que o montarSemanaConteudo (pós-fix) usaria
        const cand = ativos.filter((m:any)=>m.competencia===comp);
        const permitidos = conteudosServiveisPorCargo(conteudosDoBuild(cand), c.cargo);
        const mesmoDesc = permitidos.filter((m:any)=>normDescritor(m.descritor)===normDescritor(e.descritor));
        const pool = mesmoDesc.length ? mesmoDesc : permitidos;
        const fmts = [...new Set(pool.map((m:any)=>m.formato))];
        console.log(`${n}. sem${s.semana} P${i+1} | ${c.nome_completo} (${c.cargo}/${String(c.perfil_dominante||'').charAt(0)})`);
        console.log(`     descritor: "${e.descritor}" | core órfão: ${String(cid).slice(0,8)} | formato_core gravado: ${e.conteudo?.formato_core}`);
        console.log(`     genérico disponível: ${pool.length} conteúdo(s) — formatos: ${fmts.join(',')||'NENHUM'} ${mesmoDesc.length?'(match do descritor)':'(pool da competência)'}`);
      }
    }
  }
  console.log(`\nTOTAL órfãos: ${n}`);
}
main().catch(e=>{console.error(e);process.exit(1);});
