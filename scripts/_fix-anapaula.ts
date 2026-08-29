/* eslint-disable */
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { gerarBlueprintCore } from '@/lib/blueprint/core';
const EMP='0d99fed1-1710-40e3-b32e-7a95c7d023fe';
async function main(){
  const sb=createSupabaseAdmin();
  const { data:c }=await sb.from('colaboradores').select('id').eq('empresa_id',EMP).ilike('nome_completo','%Ana Paula Araujo%').maybeSingle();
  const r=await gerarBlueprintCore(sb,{colaboradorId:c!.id,empresaIdEsperado:EMP});
  if((r as any).error){console.log('ERRO:',(r as any).error);process.exit(1);}
  const { data:bp }=await sb.from('development_blueprints').select('blueprint').eq('colaborador_id',c!.id).order('gerado_em',{ascending:false}).limit(1).maybeSingle();
  const semanas=(bp?.blueprint as any)?.trilha?.semanas||[];
  const s1=semanas.find((s:any)=>Number(s.semana)===1);
  console.log('Ana Paula regerada (prompt original). sem1 descritores:', (s1?.descritores_foco||[]).length, JSON.stringify(s1?.descritores_foco));
}
main().catch(e=>{console.error(e);process.exit(1);});
