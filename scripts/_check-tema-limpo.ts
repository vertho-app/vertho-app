/* eslint-disable */
// READ-ONLY: o brief deste tema está contaminado? Compara o MB GRAVADO no brief
// com o que a resolução CORRIGIDA (cargo+descritor) escolhe. (Meu script anterior
// comparava cega vs correta — o par errado.)
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { resolverModuloBaseParaConteudo } from '@/lib/season-engine/modulo-base-integration';
const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe';
const T = { competencia: 'Avaliação e monitoramento de resultados', descritor: 'Análise integrada de indicadores', cargo: 'Gestão Educacional' };
async function main() {
  const sb = createSupabaseAdmin();
  const { data: briefs } = await sb.from('kit_briefs').select('id, modulo_base_id')
    .eq('competencia', T.competencia).eq('descritor', T.descritor).eq('cargo', T.cargo)
    .or(`empresa_id.eq.${EMP},empresa_id.is.null`);
  const b = briefs?.[0];
  if (!b) { console.log('brief NÃO existe → seria criado já com o fix ✅'); return; }
  const { data: kits } = await sb.from('kits').select('disc,status').eq('brief_id', b.id);
  const correta = await resolverModuloBaseParaConteudo(sb, { competenciaNome: T.competencia, descritor: T.descritor, nivelMin: 1.0, cargo: T.cargo, empresaId: EMP }).catch(() => null);
  console.log(`brief ${String(b.id).slice(0,8)} | kits: ${(kits||[]).map((k:any)=>k.disc+':'+k.status).sort().join(' ')}`);
  console.log(`MB GRAVADO no brief : ${String(b.modulo_base_id).slice(0,8)}`);
  console.log(`MB CORRETO (fix)    : ${String(correta?.modulo?.id).slice(0,8)} — "${String(correta?.modulo?.titulo||'').slice(0,45)}"`);
  const limpo = b.modulo_base_id === correta?.modulo?.id;
  console.log(`\n→ ${limpo ? '✅ BRIEF LIMPO — basta ADICIONAR o kit I (reusa a espinha, mais barato)' : '⚠️ CONTAMINADO — precisa regerar o tema inteiro (brief fresco + 4 DISC)'}`);
}
main().catch(e=>{console.error(e);process.exit(1);});
