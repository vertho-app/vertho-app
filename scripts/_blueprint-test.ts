/* eslint-disable */
// INTERNO/descartável: gera um blueprint real (caminho interno) e imprime o JSON.
// Rodar (de nextjs-app): npx tsx scripts/_blueprint-test.ts
process.loadEnvFile('.env.local');

const COLAB = 'afc866ce-91a9-4bf8-94d2-676b4878308e'; // Elizângela
const EMPRESA = '0d99fed1-1710-40e3-b32e-7a95c7d023fe'; // Ibipeba

(async () => {
  // Headless: chama o NÚCLEO (sem gate de sessão) — a action `gerarBlueprint`
  // é um endpoint e exige sessão admin. Ver lib/blueprint/core.ts.
  const { createSupabaseAdmin } = await import('@/lib/supabase');
  const { gerarBlueprintCore } = await import('@/lib/blueprint/core');
  const { getBlueprint } = await import('@/actions/blueprint');
  const r = await gerarBlueprintCore(createSupabaseAdmin(), { colaboradorId: COLAB, empresaIdEsperado: EMPRESA });
  console.log('gerarBlueprintCore →', JSON.stringify(r));
  if ((r as any).ok) {
    const g = await getBlueprint(EMPRESA, COLAB);
    const bp: any = (g as any).blueprint;
    console.log('\n=== RESUMO DO BLUEPRINT ===');
    console.log('spec_version:', (g as any).spec_version);
    console.log('tese:', bp?.foco_geral?.tese_de_desenvolvimento);
    console.log('competencias:', (bp?.competencias || []).map((c: any) => `${c.nome} [${c.nivel_atual}] objetivos=${(c.objetivos_30_dias||[]).length}`));
    console.log('trilha semanas:', bp?.trilha?.duracao_semanas, '→', (bp?.trilha?.semanas||[]).length, 'entradas');
    const semSemConexao = (bp?.trilha?.semanas||[]).filter((s: any) => !s.conexao_com_pdi || (Array.isArray(s.conexao_com_pdi) && !s.conexao_com_pdi.length));
    console.log('semanas SEM conexao_com_pdi:', semSemConexao.length, '(deve ser 0)');
    console.log('\nmapa semana → conexao_com_pdi:');
    for (const s of (bp?.trilha?.semanas||[])) console.log(`  sem ${s.semana} [${s.tipo}] ${JSON.stringify(s.competencia_foco)} → ${JSON.stringify(s.conexao_com_pdi)}`);
  }
})().catch((e) => { console.error('ERRO', e); process.exit(1); });

export {};
