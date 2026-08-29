/* eslint-disable */
/**
 * Executa DE VERDADE (persistindo) os modos de cron que ainda não tinham sido observados,
 * para tirar "nunca rodou" da lista de pendências sem esperar o calendário.
 *
 * Diferença do `_health-check.ts`: aquele chama `rodar*` e só IMPRIME — não grava em
 * `pipeline_health_runs` nem alerta. Aqui é `executarHealthCheck`, o MESMO caminho do
 * cron: roda, persiste e alerta. É a diferença entre "exercitei a lógica" e "o cron
 * funciona", que já me confundiu uma vez nesta sessão.
 *
 * `reconciliar` chama o job de vídeo nominal com teto pequeno (o default de produção é 3).
 *
 * Uso: npx tsx --env-file=.env.local scripts/_rodar-cron-observado.ts horizonte|reconciliar
 */
const MODO = process.argv[2];

async function main() {
  if (MODO === 'horizonte') {
    const { executarHealthCheck } = await import('@/lib/pipeline-health/core');
    const r = await executarHealthCheck('horizonte');
    console.log(`horizonte: ${r.message}`);
    for (const run of r.resultados) {
      console.log(`  ${run.empresaSlug} · ${run.severidade} · ${run.achados.length} achado(s)`);
      for (const a of run.achados) console.log(`    [${a.severidade}] ${a.titulo} — ${a.contagem}`);
    }
    return;
  }

  if (MODO === 'reconciliar') {
    const { reconciliarPersonalizados } = await import('@/lib/video/reconciliar-personalizados');
    // `executar: false` primeiro — o job tem efeito (apaga presos e re-enfileira célula),
    // então a primeira observação é read-only. `--executar` para valer.
    const executar = process.argv.includes('--executar');
    const r: any = await reconciliarPersonalizados({ executar, limite: 3 });
    console.log(`reconciliar (${executar ? 'EXECUTAR' : 'dry-run'}):`, JSON.stringify(r, null, 2));
    return;
  }

  console.log('uso: _rodar-cron-observado.ts horizonte|reconciliar');
  process.exitCode = 1;
}
main().then(() => process.exit(process.exitCode || 0)).catch((e) => { console.error('FALHOU:', e?.message || e); process.exit(1); });
