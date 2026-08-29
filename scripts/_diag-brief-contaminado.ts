/* eslint-disable */
// READ-ONLY: os briefs dos 3 temas que vou gerar foram criados ANTES do fix 7258c0a3
// (MB cego a cargo/descritor). O MB que eles usaram é o mesmo que a resolução
// CORRIGIDA (com cargo + descritor) escolheria? Se não, reusar o brief propaga o erro.
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { resolverModuloBaseParaConteudo } from '@/lib/season-engine/modulo-base-integration';

const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe';
const ALVOS = [
  { competencia: 'Colaboração docente e cultura formativa', descritor: 'Troca de práticas', cargo: 'Coordenação Pedagógica', discs: ['S', 'I'] },
  { competencia: 'Avaliação e monitoramento de resultados', descritor: 'Definição de metas', cargo: 'Gestão Educacional', discs: ['C'] },
];

async function main() {
  const sb = createSupabaseAdmin();
  // kit_briefs guarda o modulo_base_id?
  const { data: amostra } = await sb.from('kit_briefs').select('*').limit(1);
  const cols = Object.keys(amostra?.[0] || {});
  console.log('colunas de kit_briefs:', cols.join(', '));
  const temMb = cols.includes('modulo_base_id');
  console.log(`kit_briefs guarda modulo_base_id? ${temMb ? 'SIM' : 'NÃO'}\n`);

  for (const a of ALVOS) {
    const { data: briefs } = await sb.from('kit_briefs')
      .select('*')
      .eq('competencia', a.competencia).eq('descritor', a.descritor)
      .or(`empresa_id.eq.${EMP},empresa_id.is.null`);
    const b = (briefs || []).find((x: any) => String(x.cargo || '').toLowerCase() === a.cargo.toLowerCase()) || briefs?.[0];
    console.log(`── ${a.cargo} › ${a.descritor} (gerar DISC: ${a.discs.join(',')})`);
    if (!b) { console.log('   brief: NÃO EXISTE → seria criado do zero, já COM o fix ✅\n'); continue; }
    const { data: kits } = await sb.from('kits').select('disc,status').eq('brief_id', b.id);
    console.log(`   brief ${String(b.id).slice(0, 8)} EXISTE | kits: ${(kits || []).map((k: any) => k.disc + ':' + k.status).sort().join(' ')}`);
    const mbDoBrief = temMb ? b.modulo_base_id : null;

    const corrigido = await resolverModuloBaseParaConteudo(sb, {
      competenciaNome: a.competencia, descritor: a.descritor, nivelMin: 1.0, cargo: a.cargo, empresaId: EMP,
    }).catch(() => null);
    const cego = await resolverModuloBaseParaConteudo(sb, {
      competenciaNome: a.competencia, nivelMin: 1.0, empresaId: EMP,
    }).catch(() => null);

    console.log(`   MB gravado no brief : ${mbDoBrief ? String(mbDoBrief).slice(0, 8) : '(coluna não existe)'}`);
    console.log(`   MB resolução CEGA   : ${cego?.modulo?.id ? String(cego.modulo.id).slice(0, 8) : 'nenhum'} — "${String(cego?.modulo?.titulo || '').slice(0, 40)}"`);
    console.log(`   MB resolução CORRETA: ${corrigido?.modulo?.id ? String(corrigido.modulo.id).slice(0, 8) : 'nenhum'} — "${String(corrigido?.modulo?.titulo || '').slice(0, 40)}"`);
    const igual = cego?.modulo?.id === corrigido?.modulo?.id;
    console.log(`   → cega == correta? ${igual ? 'SIM — reusar o brief é INÓCUO ✅' : 'NÃO — o brief existente está CONTAMINADO ⚠️'}\n`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
