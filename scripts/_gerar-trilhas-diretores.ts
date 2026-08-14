/* eslint-disable */
// Gera as trilhas (Temporadas) dos colaboradores que já têm blueprint.
// Headless — o laço roda aqui, não numa aba: Server Action é despachada UMA POR
// VEZ por cliente, então um loop no browser trava a página inteira.
//
// `--max=1` faz o PILOTO: uma trilha lida antes de liberar as 38. O piloto de 3
// módulos de hoje evitou 16 reprovados; o mesmo raciocínio vale aqui, e aqui é
// mais barato ainda porque uma trilha ruim se apaga.
//
// Uso: npx tsx scripts/_gerar-trilhas-diretores.ts <slug> [--cargo=X] [--max=N] [--aplicar]
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { gerarTemporadaCoreHeadless } from '@/lib/season-engine/trilha-core';

const SLUG = process.argv[2] || 'macae';
const CARGO = process.argv.find((a) => a.startsWith('--cargo='))?.slice(8) || 'Diretor(a) Escolar';
const MAX = Number((process.argv.find((a) => a.startsWith('--max='))?.slice(6)) || 999);
const APLICAR = process.argv.includes('--aplicar');

async function main() {
  const sb = createSupabaseAdmin();
  const { data: emp } = await sb.from('empresas').select('id').eq('slug', SLUG).single();
  if (!emp) throw new Error('empresa não encontrada: ' + SLUG);
  const empresaId = (emp as any).id;

  const { data: bps, error } = await sb.from('development_blueprints')
    .select('colaborador_id').eq('empresa_id', empresaId).order('colaborador_id');
  if (error) throw new Error(error.message);
  const comBlueprint = (bps || []).map((b: any) => b.colaborador_id);
  if (!comBlueprint.length) { console.log('nenhum blueprint.'); return; }

  const { data: colabs } = await sb.from('colaboradores')
    .select('id, nome_completo, cargo').eq('empresa_id', empresaId)
    .in('id', comBlueprint).eq('cargo', CARGO).order('id');

  // Quem já tem trilha não entra: gerar de novo criaria uma segunda para a
  // mesma pessoa. Retomável por construção.
  const { data: jaTem } = await sb.from('trilhas')
    .select('colaborador_id').eq('empresa_id', empresaId)
    .in('colaborador_id', (colabs || []).map((c: any) => c.id));
  const comTrilha = new Set((jaTem || []).map((t: any) => t.colaborador_id));
  const pendentes = (colabs || []).filter((c: any) => !comTrilha.has(c.id)).slice(0, MAX);

  console.log(`${colabs?.length || 0} ${CARGO} com blueprint · ${comTrilha.size} já com trilha · ${pendentes.length} a gerar${APLICAR ? '' : ' (dry-run)'}`);
  for (const c of pendentes as any[]) console.log(`  ${String(c.nome_completo).slice(0, 38)}`);
  if (!APLICAR) { console.log('\n(rode com --aplicar)'); return; }

  let ok = 0; const erros: string[] = [];
  for (const [i, c] of (pendentes as any[]).entries()) {
    const r: any = await gerarTemporadaCoreHeadless(sb, { colaboradorId: c.id, empresaIdEsperado: empresaId });
    if (r?.error) { erros.push(`${c.nome_completo}: ${r.error}`); console.log(`  [${i + 1}/${pendentes.length}] ❌ ${c.nome_completo}: ${r.error}`); continue; }
    ok++;
    const semanas = r?.trilha?.semanas?.length ?? r?.semanas?.length ?? '?';
    console.log(`  [${i + 1}/${pendentes.length}] ✅ ${String(c.nome_completo).slice(0, 34).padEnd(36)} ${semanas} semanas · modo ${r?.trilha?.programa_modo || r?.programa_modo || '?'}`);
  }
  console.log(`\n${ok} trilha(s) geradas${erros.length ? `, ${erros.length} com erro` : ''}`);
  for (const e of erros) console.log(`  ✗ ${e}`);
}
main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); });
