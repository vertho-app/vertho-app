/**
 * Mede a distribuição REAL de saída da IA4, sem censura.
 *
 * Por que (27/08/2026): o p95 histórico de `ia4_avaliacao` é **16.000** — que é
 * exatamente o teto que vigorava. **59 de 388 chamadas pararam nesse valor.**
 * Distribuição censurada não tem p95: tem um PISO. Todo dimensionamento feito
 * em cima dela (inclusive o meu, que subiu o teto para 64.000) é palpite
 * informado, não medida.
 *
 * 🔑 NÃO PERSISTE. Reavaliar sobrescreveria a nota de gente real por um motivo
 * que é de instrumentação. O núcleo da IA4 é partido em três de propósito —
 * MONTAR / CHAMAR / PERSISTIR — e este script usa só os dois primeiros. As
 * linhas entram no ledger com `source: 'medicao'`, fora da população que o
 * auditor de tetos usa para decidir teto de produção.
 *
 *   npx tsx --env-file=.env.local scripts/_medir-ia4-sem-censura.ts [n]
 */
import { createSupabaseAdmin } from '../lib/supabase';
import { tenantDb } from '../lib/tenant-db';
import { callAI } from '../actions/ai-client';
import { getModelForTask } from '../lib/ai-tasks';
import {
  IA4_SYSTEM, IA4_COLAB_COLS, IA4_MAX_TOKENS, IA4_CALL_OPTIONS,
  carregarContextoLoteIA4, carregarContextoRespostaIA4, buildIA4UserPrompt,
} from '../lib/ia4-avaliacao';

const EMPRESA = '0d99fed1-1710-40e3-b32e-7a95c7d023fe'; // Secretaria Municipal de Ibipeba/BA
const MARCA = 'ia4_medicao_sem_censura';

async function main() {
  const n = Number(process.argv[2] || 15);
  const sb = createSupabaseAdmin();
  const tdb = tenantDb(EMPRESA);

  const { data: emp } = await sb.from('empresas').select('nome').eq('id', EMPRESA).single();
  const modelo = await getModelForTask(EMPRESA, 'ia4_avaliacao');
  console.log(`tenant: ${emp?.nome}\nmodelo: ${modelo} · teto: ${IA4_MAX_TOKENS}\n`);

  // Respostas JÁ avaliadas: reprocessar o prompt delas mede a saída sem tocar
  // em nada que ainda esteja pendente.
  const { data: respostas, error } = await tdb.from('respostas')
    .select('*')
    .not('avaliacao_ia', 'is', null)
    .not('r1', 'is', null)
    .limit(n);
  if (error) throw new Error(error.message);
  if (!respostas?.length) throw new Error('nenhuma resposta avaliada no tenant');

  const colabIds = [...new Set(respostas.map((r: any) => r.colaborador_id).filter(Boolean))];
  const { data: colabs } = await tdb.from('colaboradores').select(IA4_COLAB_COLS).in('id', colabIds);
  const porColab: Record<string, any> = {};
  (colabs || []).forEach((c: any) => { porColab[c.id] = c; });
  const { empresa, contextoPPP } = await carregarContextoLoteIA4(tdb, sb, EMPRESA);

  console.log(`medindo ${respostas.length} resposta(s) — SEM persistir\n`);
  let erros = 0;
  for (const [i, resp] of respostas.entries()) {
    try {
      const ctx = await carregarContextoRespostaIA4(tdb, sb, resp);
      const { cachedUserPrefix, user } = buildIA4UserPrompt(resp, porColab[resp.colaborador_id] || {}, empresa, contextoPPP, ctx);
      const t0 = Date.now();
      await callAI(IA4_SYSTEM, user, { model: modelo }, IA4_MAX_TOKENS, {
        ...IA4_CALL_OPTIONS, cachedUserPrefix,
        taskKey: MARCA, source: 'medicao', empresaId: EMPRESA, colaboradorId: resp.colaborador_id,
      });
      process.stdout.write(`  ${i + 1}/${respostas.length} ok (${Math.round((Date.now() - t0) / 1000)}s)\n`);
    } catch (e: any) {
      erros++;
      process.stdout.write(`  ${i + 1}/${respostas.length} FALHOU: ${String(e?.message).slice(0, 90)}\n`);
    }
  }

  // O ledger é a fonte: ele registra o output_tokens REAL e a truncagem.
  const { data: linhas } = await sb.from('ia_usage_log')
    .select('output_tokens, latency_ms, status, cost_usd')
    .eq('feature', MARCA).eq('source', 'medicao')
    .order('created_at', { ascending: false }).limit(n);

  const outs = (linhas || []).map((l: any) => l.output_tokens).sort((a, b) => a - b);
  if (!outs.length) { console.log('\nsem linhas no ledger — nada a concluir.'); process.exitCode = 1; return; }
  const p = (q: number) => outs[Math.min(outs.length - 1, Math.floor(outs.length * q))];
  const noTeto = outs.filter((o) => o >= IA4_MAX_TOKENS).length;
  const acimaDoAntigo = outs.filter((o) => o > 16000).length;
  const custo = (linhas || []).reduce((s: number, l: any) => s + Number(l.cost_usd || 0), 0);

  console.log(`\n── saída medida (n=${outs.length}, ${erros} erro(s)) ──`);
  console.log(`  min ${outs[0]} · p50 ${p(0.5)} · p95 ${p(0.95)} · max ${outs[outs.length - 1]}`);
  console.log(`  no teto de ${IA4_MAX_TOKENS}: ${noTeto}`);
  console.log(`  ACIMA dos 16.000 antigos: ${acimaDoAntigo} (${Math.round(100 * acimaDoAntigo / outs.length)}%)`);
  console.log(`  custo desta medição: US$ ${custo.toFixed(2)}`);
  console.log('');
  if (noTeto) {
    console.log(`🔴 ${noTeto} bateram no teto NOVO — 64.000 também é censura. Subir de novo.`);
    process.exitCode = 1;
  } else if (acimaDoAntigo) {
    console.log(`✅ o teto de 16.000 CORTAVA de verdade: ${acimaDoAntigo} de ${outs.length} passam dele.`);
    console.log(`   Teto sugerido pela régua (3x o p95): ${Math.ceil(3 * p(0.95) / 1000) * 1000}`);
  } else {
    console.log('⚠️ nenhuma passou de 16.000 nesta amostra — a censura histórica pode ter outra causa,');
    console.log('   ou a amostra não alcançou a cauda. n pequeno não fecha a questão.');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
