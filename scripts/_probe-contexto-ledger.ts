/**
 * Prova ponta a ponta que o contexto declarado chega ao ledger (mig 230).
 *
 * Guard prova que o código CHAMA; só a linha gravada prova que o valor chegou.
 * Roda duas chamadas — uma declarando `trigger`, outra sem declarar nada — e lê
 * as duas de volta. Se a coluna vier nula na declarada, o wiring não vale.
 */
import { callAI } from '../actions/ai-client';
import { comContexto } from '../lib/execucao-contexto';
import { createSupabaseAdmin } from '../lib/supabase';

async function main() {
  const marca = `probe_ctx_${Math.floor(Number(process.env.PROBE_SEQ ?? '1'))}`;

  await comContexto({ runtime: 'trigger', orcamentoMs: 3600 * 1000, onde: 'probe' }, async () => {
    await callAI('Responda apenas OK.', 'OK?', { model: 'claude-sonnet-4-6' }, 64, {
      taskKey: marca, source: 'canario',
    });
  });

  // Sem declarar: tem de cair em 'desconhecido', não em null nem num palpite.
  await callAI('Responda apenas OK.', 'OK?', { model: 'claude-sonnet-4-6' }, 64, {
    taskKey: marca, source: 'canario',
  });

  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from('ia_usage_log')
    .select('feature, runtime, orcamento_ms, latency_ms')
    .eq('feature', marca)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);

  console.log('\nlinhas gravadas:');
  for (const l of data || []) {
    const frac = l.orcamento_ms ? `${Math.round((l.latency_ms / l.orcamento_ms) * 100)}% do orçamento` : 'sem orçamento';
    console.log(`  runtime=${String(l.runtime).padEnd(13)} orcamento_ms=${String(l.orcamento_ms ?? '—').padStart(8)}  latency=${l.latency_ms}ms  → ${frac}`);
  }

  const declarada = (data || []).find((l: any) => l.runtime === 'trigger');
  const anonima = (data || []).find((l: any) => l.runtime === 'desconhecido');
  const falhas: string[] = [];
  if (!declarada) falhas.push('a chamada COM contexto não gravou runtime=trigger');
  if (declarada && declarada.orcamento_ms !== 3600000) falhas.push(`orcamento_ms gravado = ${declarada.orcamento_ms}, esperado 3600000`);
  if (!anonima) falhas.push('a chamada SEM contexto não gravou runtime=desconhecido (virou null ou palpite)');

  if (falhas.length) {
    console.log('\n🔴 o wiring NÃO está valendo:');
    for (const f of falhas) console.log(`   ${f}`);
    process.exitCode = 1;
  } else {
    console.log('\n✅ contexto declarado chega ao ledger, e a ausência dele aparece como `desconhecido`.');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
