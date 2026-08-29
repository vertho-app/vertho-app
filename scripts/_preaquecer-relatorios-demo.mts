/* eslint-disable */
// Pré-aquecimento da demo (parte 2): gera o relatório comportamental das
// personas do acme-demo que NÃO têm `report_texts` congelado no fixture.
//
// Medido em 24/08: Ana, Bruna, Carla e Paulo têm report_texts (replay do
// fixture, abrem instantâneo); Mariana e Renato NÃO. Abrir o perfil delas na
// apresentação dispara a geração LLM ao vivo — e a Mariana é justamente a
// persona que sustenta o argumento "vai além do comercial" (Financeiro, fit 92).
//
// Chama o NÚCLEO sem gate (`lib/relatorio-comportamental/relatorio-core.ts`),
// que é o mesmo que a tela chama. O render do PDF costuma falhar sob tsx
// (fonte NotoSans registrada em outra instância) — não importa: o
// `persistReportTexts` roda ANTES do render, e é o report_texts que faz a tela
// abrir sem esperar IA. O PDF regenera on-demand dentro do app.
//
// ⚠️ Validade: o reset das 04h recria as personas e só replica os artefatos
// congelados no fixture — o que este script gera some no próximo reset.
import './_env';
import { createSupabaseAdmin } from '@/lib/supabase';
import { gerarEsalvarRelatorioComportamentalCore } from '@/lib/relatorio-comportamental/relatorio-core';

const SLUG = 'acme-demo';

async function main() {
  const sb = createSupabaseAdmin();

  const { data: empresa } = await sb.from('empresas').select('id, nome, is_demo').eq('slug', SLUG).maybeSingle();
  if (!empresa) throw new Error(`tenant ${SLUG} não encontrado`);
  if (!empresa.is_demo) throw new Error(`ABORTADO: ${SLUG} não é is_demo`);

  const { data: colabs } = await sb.from('colaboradores')
    .select('id, nome_completo, email, perfil_dominante, report_texts')
    .eq('empresa_id', empresa.id).order('nome_completo');

  const faltando = (colabs || []).filter((c: any) => !c.report_texts);
  console.log(`${colabs?.length || 0} personas · ${faltando.length} sem report_texts: ${faltando.map((c: any) => c.nome_completo).join(', ') || '(nenhuma)'}`);

  for (const c of faltando) {
    process.stdout.write(`  ${c.nome_completo} (${c.perfil_dominante})... `);
    const r: any = await gerarEsalvarRelatorioComportamentalCore({ colabId: c.id, empresaId: empresa.id });
    console.log(r?.success ? `OK (pdf ${r.path})` : `erro no PDF: ${r?.error}`);
  }

  // Verificação independente do retorno: o que importa é o report_texts no banco.
  const { data: depois } = await sb.from('colaboradores')
    .select('nome_completo, report_texts, report_generated_at')
    .eq('empresa_id', empresa.id).order('nome_completo');
  console.log('\nEstado final (report_texts no banco):');
  for (const c of depois || []) {
    console.log(`  ${c.report_texts ? '✓' : '✗'} ${c.nome_completo}${c.report_generated_at ? ` · ${c.report_generated_at}` : ''}`);
  }
}

main().catch((e) => { console.error('FALHOU:', e?.message || e); process.exit(1); });
