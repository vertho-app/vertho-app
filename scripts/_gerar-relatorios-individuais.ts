/* eslint-disable */
// Gera os Relatórios Individuais (PDI) de quem já tem trilha — headless.
//
// POR QUE headless: a tela itera chamando a action UMA VEZ POR PESSOA, e Server
// Action é despachada uma por vez por cliente. 38 relatórios seriam ~25 min de
// aba travada. O núcleo é o mesmo da action (`lib/relatorios/individual-core`),
// então não há dois caminhos divergindo.
//
// ⚠️ CONFERIR `pdf_path`, NÃO o `success`: o PDF é best-effort dentro do núcleo
// (try/catch que só loga), e `renderToBuffer` do @react-pdf falha quando a fonte
// não está registrada na mesma instância do módulo — o que acontece sob `tsx`.
// Quando falha, o relatório é salvo com `pdf_path: null`: o conteúdo existe, o
// documento não. Por isso o resumo abaixo conta PDF, e não "gerados".
//
// Uso: npx tsx scripts/_gerar-relatorios-individuais.ts <slug> [--max=N] [--aplicar]
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { gerarRelatorioIndividualCore } from '@/lib/relatorios/individual-core';
import { getModelForTask } from '@/lib/ai-tasks';

const SLUG = process.argv[2] || 'macae';
const MAX = Number(process.argv.find((a) => a.startsWith('--max='))?.slice(6) || 999);
const MODELO = process.argv.find((a) => a.startsWith('--modelo='))?.slice(9) || '';
const APLICAR = process.argv.includes('--aplicar');

async function main() {
  const sb = createSupabaseAdmin();
  const { data: emp } = await sb.from('empresas').select('id').eq('slug', SLUG).single();
  if (!emp) throw new Error('empresa não encontrada: ' + SLUG);
  const empresaId = (emp as any).id;

  const { data: trilhas } = await sb.from('trilhas')
    .select('colaborador_id').eq('empresa_id', empresaId).order('colaborador_id');
  const alvos = [...new Set((trilhas || []).map((t: any) => t.colaborador_id))];

  const { data: jaTem } = await sb.from('relatorios')
    .select('colaborador_id, pdf_path').eq('empresa_id', empresaId).eq('tipo', 'individual');
  // Só conta como pronto quem tem PDF: relatório sem `pdf_path` é justamente o
  // caso que precisa ser refeito.
  const prontos = new Set((jaTem || []).filter((r: any) => r.pdf_path).map((r: any) => r.colaborador_id));
  const pendentes = alvos.filter((id) => !prontos.has(id)).slice(0, MAX);

  const { data: nomes } = await sb.from('colaboradores')
    .select('id, nome_completo').eq('empresa_id', empresaId).in('id', pendentes.length ? pendentes : ['x']);
  const nomePor = new Map((nomes || []).map((c: any) => [c.id, c.nome_completo]));

  console.log(`${alvos.length} com trilha · ${prontos.size} já com PDF · ${pendentes.length} a gerar`);
  if (!APLICAR) { console.log('\n(dry-run — rode com --aplicar)'); return; }

  const modelo = MODELO || await getModelForTask(empresaId, 'pdi_individual');
  console.log(`modelo: ${modelo}`);

  let comPdf = 0, semPdf = 0; const erros: string[] = [];
  for (const [i, id] of pendentes.entries()) {
    const nome = String(nomePor.get(id) || id).slice(0, 32);
    let r: any;
    try {
      r = await gerarRelatorioIndividualCore(sb, empresaId, id, { model: modelo });
    } catch (e: any) { r = { success: false, error: e?.message || String(e) }; }
    if (!r?.success) { erros.push(`${nome}: ${r?.error}`); console.log(`  [${i + 1}/${pendentes.length}] ❌ ${nome}: ${r?.error}`); continue; }

    const { data: rel } = await sb.from('relatorios')
      .select('pdf_path').eq('empresa_id', empresaId).eq('colaborador_id', id).eq('tipo', 'individual').maybeSingle();
    if ((rel as any)?.pdf_path) { comPdf++; console.log(`  [${i + 1}/${pendentes.length}] ✅ ${nome} (PDF)`); }
    else { semPdf++; console.log(`  [${i + 1}/${pendentes.length}] ⚠ ${nome} — relatório salvo SEM PDF`); }
  }
  console.log(`\n${comPdf} com PDF · ${semPdf} sem PDF · ${erros.length} erro(s)`);
  for (const e of erros) console.log(`  ✗ ${e}`);
  if (semPdf) console.log('⚠ PDF ausente costuma ser a fonte do @react-pdf sob tsx — gere esses pela tela do admin.');
}
main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); });
