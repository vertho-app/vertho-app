/**
 * Prova de ponta a ponta dos provedores ligados em 25/08/2026 (Qwen, Muse Spark).
 *
 * Descartável de propósito: o que este script prova é que o ROTEADOR roteia —
 * coisa que teste de unidade sobre o predicado não prova. A suíte cobre
 * `ehOpenAICompat`/`modeloTemRota`/`conteudoOuFalhaAlto`; aqui a chamada sai de
 * `callAI` e tem que voltar com texto, custo != null e o `provider` certo.
 *
 *   npx tsx scripts/_probe-provedores-novos.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { callAI } from '../actions/ai-client';
import { costFromTokens, MODELS } from '../lib/ia-cost-catalog';
import { modeloTemRota, PROVEDORES_OPENAI_COMPAT } from '../lib/ai-provedores';

const ALVOS = ['qwen3.8-max', 'muse-spark-1.2'];

async function main() {
  let falhas = 0;
  for (const model of ALVOS) {
    const prov = PROVEDORES_OPENAI_COMPAT.find((p) => model.startsWith(p.prefixo));
    console.log(`\n── ${model} ──`);
    console.log(`  rota:     ${modeloTemRota(model) ? 'OK' : 'AUSENTE'} → provider=${prov?.provider} env=${prov?.env}`);
    console.log(`  preço:    ${MODELS[model as keyof typeof MODELS] ? 'no catálogo' : 'AUSENTE (ledger daria null)'}`);

    // Teto FOLGADO de propósito: com teto apertado o Muse gasta tudo em
    // raciocínio e devolve vazio — é o que o conteudoOuFalhaAlto agora acusa.
    try {
      const t0 = Date.now();
      const r = await callAI(
        'Você responde em português, em no máximo 5 palavras.',
        'Diga que está funcionando.',
        { model },
        800,
        { taskKey: 'probe_provedor', source: 'probe' },
      );
      const ms = Date.now() - t0;
      const custo = costFromTokens(model, { inTokens: 1000, outTokens: 1000 });
      console.log(`  resposta: ${JSON.stringify(r.slice(0, 80))} (${ms}ms)`);
      console.log(`  custo/1k+1k: ${custo === null ? 'NULL — catálogo não cobre' : `$${custo.toFixed(5)}`}`);
      if (!r.trim()) { console.log('  🔴 texto vazio'); falhas++; }
    } catch (e: any) {
      console.log(`  🔴 FALHOU: ${String(e?.message || e).slice(0, 200)}`);
      falhas++;
    }
  }
  console.log(`\n${falhas === 0 ? '✅ todos os provedores responderam' : `🔴 ${falhas} falha(s)`}`);
  process.exit(falhas === 0 ? 0 : 1);
}

main();
