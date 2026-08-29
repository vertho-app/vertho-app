/* eslint-disable */
// READ-ONLY: o fix `.is('kit_id', null)` no montarSemanaConteudo é SEGURO?
// Para cada entrega que hoje usa conteúdo de KIT como core, existe conteúdo GENÉRICO
// (kit_id null) servível pro mesmo (competencia, descritor, cargo) num formato útil?
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { normDescritor } from '@/lib/blueprint/to-descriptors';

const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe';
const ehMesmoCargoOuGenerico = (cargoDoConteudo: any, cargo: string) => {
  const c = String(cargoDoConteudo || '').trim().toLowerCase();
  return !c || c === 'todos' || c === String(cargo || '').trim().toLowerCase();
};

async function main() {
  const sb = createSupabaseAdmin();
  const { data: trilhas } = await sb.from('trilhas').select('colaborador_id,temporada_plano,competencia_foco').eq('empresa_id', EMP).eq('status', 'ativa');
  const ids = (trilhas || []).map((t: any) => t.colaborador_id);
  const { data: cs } = await sb.from('colaboradores').select('id,nome_completo,cargo,perfil_dominante').in('id', ids);
  const colabs = Object.fromEntries((cs || []).map((c: any) => [c.id, c]));
  const { data: mcAll } = await sb.from('micro_conteudos').select('id,kit_id,formato,ativo,competencia,descritor,cargo').or(`empresa_id.eq.${EMP},empresa_id.is.null`);
  const mcById = Object.fromEntries((mcAll || []).map((m: any) => [m.id, m]));
  // pool GENÉRICO (kit_id null, ativo) por competência
  const genericos = (mcAll || []).filter((m: any) => !m.kit_id && m.ativo);

  let comKitCore = 0, temGenerico = 0, ficariaSemNada = 0;
  const buracos: string[] = [];
  for (const t of (trilhas || [])) {
    const c = colabs[(t as any).colaborador_id]; if (!c) continue;
    for (const s of ((t as any).temporada_plano || [])) {
      if (s?.tipo !== 'conteudo') continue;
      for (const e of (s.conteudos_dia || [])) {
        const core = e.conteudo?.core_id ? mcById[e.conteudo.core_id] : null;
        if (!core?.kit_id) continue; // só as que usam KIT como core
        comKitCore++;
        const comp = e.competencia || (t as any).competencia_foco;
        // replica o pool do montarSemanaConteudo pós-fix: genérico, mesma competência,
        // cargo do colab ou genérico; prefere o mesmo descritor.
        const permitidos = genericos.filter((m: any) => m.competencia === comp && ehMesmoCargoOuGenerico(m.cargo, c.cargo));
        const mesmoDesc = permitidos.filter((m: any) => normDescritor(m.descritor) === normDescritor(e.descritor));
        const pool = mesmoDesc.length ? mesmoDesc : permitidos;
        if (pool.length) temGenerico++;
        else {
          ficariaSemNada++;
          if (buracos.length < 8) buracos.push(`  sem${s.semana} | ${c.nome_completo} (${c.cargo}) — "${e.descritor}" [${comp}]`);
        }
      }
    }
  }
  console.log(`entregas que hoje usam KIT como core: ${comKitCore}`);
  console.log(`  teriam genérico pra cair (fix SEGURO): ${temGenerico}`);
  console.log(`  ⚠️ ficariam SEM conteúdo (viraria buraco): ${ficariaSemNada}`);
  if (buracos.length) { console.log('\n--- buracos ---'); buracos.forEach((b) => console.log(b)); }
  console.log(`\nVEREDITO: fix ${ficariaSemNada === 0 ? 'É SEGURO (todo kit-core tem genérico de reserva)' : 'NÃO é seguro sozinho — ' + ficariaSemNada + ' entrega(s) perderiam conteúdo'}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
