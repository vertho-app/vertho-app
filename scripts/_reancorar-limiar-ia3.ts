/**
 * Re-ancorar o limiar do `ia3_check` ao Terra: é legítimo ou é inflação?
 *
 * Contexto: o limiar (>=90 aprovado, >=80 ressalvas) foi calibrado quando o
 * auditor era mais leniente. Sob o Terra quase nada passa. Duas saídas:
 *   (a) re-ancorar o limiar à distribuição do Terra;
 *   (b) re-checar a base inteira sob um auditor só.
 *
 * ⚠️ (a) só é legítima sob DUAS condições, e este script testa as duas em vez de
 * assumi-las:
 *
 *   1. O Terra DISCRIMINA. Se ele der 58-65 para tudo, não há o que ancorar —
 *      mover a linha só trocaria um corte arbitrário por outro. Discriminar =
 *      espalhar as notas.
 *   2. Os dois auditores concordam na ORDEM. Se o ranking do Terra bate com o
 *      da nota guardada, os dois medem a mesma coisa em escalas diferentes, e
 *      re-ancorar preserva o julgamento. Se a ordem não bate, eles medem coisas
 *      DIFERENTES — e aí re-ancorar carimba a base com um julgamento que nunca
 *      foi feito. Só (b) resolve.
 *
 * Rank correlation (Spearman) é o teste da condição 2. Alta e positiva → (a).
 * Baixa ou negativa → (b), sem discussão.
 *
 *   node --env-file=.env.local node_modules/.bin/tsx scripts/_reancorar-limiar-ia3.ts
 */
import { setGlobalDispatcher, Agent } from 'undici';
import { createSupabaseAdmin } from '../lib/supabase';
import { callAI } from '../actions/ai-client';
import { extractJSON } from '../actions/utils';
import { montarCheckIA3Prompt, normalizarResultadoCheckIA3 } from '../lib/ia3-cenarios';

setGlobalDispatcher(new Agent({ headersTimeout: 900_000, bodyTimeout: 900_000 }));
const AUDITOR = 'gpt-5.6-terra';
const N = Number(process.env.N_AMOSTRA || 24);

/** Spearman: correlação dos POSTOS, não dos valores. Imune a escalas diferentes. */
function spearman(a: number[], b: number[]): number {
  const posto = (v: number[]) => {
    const idx = v.map((x, i) => [x, i] as [number, number]).sort((p, q) => p[0] - q[0]);
    const r = new Array(v.length).fill(0);
    for (let i = 0; i < idx.length;) {
      let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
      const media = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) r[idx[k][1]] = media;
      i = j + 1;
    }
    return r;
  };
  const ra = posto(a), rb = posto(b), n = a.length;
  const ma = ra.reduce((s, x) => s + x, 0) / n, mb = rb.reduce((s, x) => s + x, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { const x = ra[i] - ma, y = rb[i] - mb; num += x * y; da += x * x; db += y * y; }
  return da && db ? num / Math.sqrt(da * db) : NaN;
}

async function main() {
  const sb = createSupabaseAdmin();
  // Amostra ATRAVESSANDO a faixa de notas, não só o topo: um limiar se calibra
  // com bons E ruins. Puxar só >=88 mediria metade da régua.
  const { data } = await sb.from('banco_cenarios')
    .select('id,titulo,descricao,cargo,competencia_id,empresa_id,ppp_escola_id,alternativas,nota_check,status_check')
    .not('nota_check', 'is', null).order('nota_check', { ascending: true });
  const todos = (data || []) as any[];
  const passo = Math.max(1, Math.floor(todos.length / N));
  const amostra = todos.filter((_, i) => i % passo === 0).slice(0, N);
  console.log(`base com ${todos.length} cenários checados · amostra de ${amostra.length} atravessando a faixa\n`);

  const guardadas: number[] = [], novas: number[] = [];
  for (const cen of amostra) {
    try {
      const { system, user } = await montarCheckIA3Prompt(sb, cen);
      const r = await callAI(system, user, { model: AUDITOR }, 8192, { taskKey: 'ia3_check', source: 'reancoragem', timeoutMs: 600_000 });
      const n = normalizarResultadoCheckIA3(await extractJSON(r));
      const nova = Number(n?.resultado?.nota ?? NaN);
      if (!Number.isFinite(nova)) { console.log(`  ${String(cen.nota_check).padStart(3)} → sem nota`); continue; }
      guardadas.push(cen.nota_check); novas.push(nova);
      console.log(`  guardada ${String(cen.nota_check).padStart(3)} (${String(cen.status_check).padEnd(22)}) → Terra ${String(nova).padStart(3)}`);
    } catch (e: any) {
      console.log(`  ${String(cen.nota_check).padStart(3)} → 🔴 ${String(e?.message || e).slice(0, 44)}`);
    }
  }
  if (novas.length < 8) { console.error('\namostra pequena demais para concluir.'); process.exit(1); }

  const ord = [...novas].sort((a, b) => a - b);
  const q = (p: number) => ord[Math.min(ord.length - 1, Math.floor(ord.length * p))];
  const amplitude = ord[ord.length - 1] - ord[0];
  const rho = spearman(guardadas, novas);

  console.log(`\n── condição 1: o Terra DISCRIMINA? ──`);
  console.log(`   min ${ord[0]} · p25 ${q(0.25)} · mediana ${q(0.5)} · p75 ${q(0.75)} · max ${ord[ord.length - 1]}  (amplitude ${amplitude})`);
  const discrimina = amplitude >= 25;
  console.log(`   ${discrimina ? '✅ espalha as notas — há o que ancorar' : '🔴 satura: quase tudo na mesma faixa, não há o que ancorar'}`);

  console.log(`\n── condição 2: os dois auditores concordam na ORDEM? ──`);
  console.log(`   Spearman(guardada, Terra) = ${rho.toFixed(2)}  (n=${novas.length})`);
  const mesmaOrdem = rho >= 0.4;
  console.log(`   ${mesmaOrdem ? '✅ medem a mesma coisa em escalas diferentes' : '🔴 medem coisas DIFERENTES — a ordem não se preserva'}`);

  console.log(`\n── se re-ancorar aos quartis do Terra ──`);
  console.log(`   aprovado >= ${q(0.75)} · ressalvas >= ${q(0.5)} · revisar abaixo disso`);
  const sob = (apr: number, res: number) => {
    const a = novas.filter((x) => x >= apr).length, b = novas.filter((x) => x >= res && x < apr).length;
    return `aprovado ${a} · ressalvas ${b} · revisar ${novas.length - a - b}`;
  };
  console.log(`   limiar ATUAL  (90/80): ${sob(90, 80)}`);
  console.log(`   re-ancorado          : ${sob(q(0.75), q(0.5))}`);

  console.log('\n── veredito ──');
  if (!discrimina) console.log('🔴 (b) RE-CHECAR. O Terra não separa os cenários; mover a linha é trocar um corte arbitrário por outro.');
  else if (!mesmaOrdem) console.log('🔴 (b) RE-CHECAR. O Terra discrimina, mas NÃO na mesma ordem do histórico — re-ancorar\n   carimbaria a base com um julgamento que nunca foi feito sobre ela.');
  else console.log('✅ (a) RE-ANCORAR é defensável: o Terra discrimina E preserva a ordem do histórico.\n   O que mudou foi a escala, não o julgamento.');
  process.exit(0);
}

main();
