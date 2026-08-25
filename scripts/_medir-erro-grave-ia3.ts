/**
 * O `erro_grave` do ia3_check: o clamp ATUA, e o flag tem LASTRO dimensional?
 *
 * Antes de mexer na régua, confirmar o mecanismo. A conclusão anterior foi que
 * "o erro_grave trava a nota em 60" — mas no caso inspecionado o modelo devolveu
 * `nota = 60` por conta própria, e o clamp é `if (erro_grave && nota > 60)`.
 * Ou seja: ele NÃO atuou. Se for assim em geral, derivar o erro_grave em código
 * não muda nota nenhuma, e o remédio proposto seria para um mecanismo que não é
 * o que produz a divergência.
 *
 * Mede três coisas por cenário:
 *   1. `nota_bruta` vs 60 → o clamp teria efeito?
 *   2. `erro_grave` → o flag disparou?
 *   3. dimensões → alguma está BAIXA, dando lastro ao flag?
 *
 * Só faz sentido derivar em código se houver flag disparando COM nota alta
 * (clamp atuando) e SEM dimensão baixa (sem lastro).
 *
 *   node --env-file=.env.local node_modules/.bin/tsx scripts/_medir-erro-grave-ia3.ts
 */
import { setGlobalDispatcher, Agent } from 'undici';
import { createSupabaseAdmin } from '../lib/supabase';
import { callAI } from '../actions/ai-client';
import { extractJSON } from '../actions/utils';
import { montarCheckIA3Prompt } from '../lib/ia3-cenarios';

setGlobalDispatcher(new Agent({ headersTimeout: 900_000, bodyTimeout: 900_000 }));

async function main() {
  const sb = createSupabaseAdmin();
  const { data } = await sb.from('banco_cenarios')
    .select('id,titulo,descricao,cargo,competencia_id,empresa_id,ppp_escola_id,alternativas,nota_check')
    .not('nota_check', 'is', null).gte('nota_check', 88).limit(8);

  let clampAtuaria = 0, flagSemLastro = 0, flagComLastro = 0, semFlag = 0;
  console.log('guardada  bruta  erro_grave  clamp?   dimensões (menor → maior)');
  for (const cen of (data || []) as any[]) {
    try {
      const { system, user } = await montarCheckIA3Prompt(sb, cen);
      const r = await callAI(system, user, { model: 'gpt-5.6-terra' }, 4096, { taskKey: 'ia3_check', source: 'medicao', timeoutMs: 300_000 });
      const j: any = await extractJSON(r);
      const bruta = Number(j?.nota);
      const flag = j?.erro_grave === true;
      const dims = j?.dimensoes || {};
      const pares = Object.entries(dims).map(([k, v]) => [k, Number(v)] as [string, number]).sort((a, b) => a[1] - b[1]);
      const clamp = flag && bruta > 60;
      // Lastro: a MENOR dimensão está claramente abaixo do meio da própria faixa?
      // As dimensões do prompt vão até ~15 cada; <60% do máximo observado conta
      // como baixa. Sem uma dimensão baixa, o flag não tem onde se apoiar.
      const maior = pares.length ? pares[pares.length - 1][1] : 0;
      const menor = pares.length ? pares[0][1] : 0;
      const temLastro = pares.length > 0 && menor <= maior * 0.6;
      if (clamp) clampAtuaria++;
      if (flag && temLastro) flagComLastro++;
      if (flag && !temLastro) flagSemLastro++;
      if (!flag) semFlag++;
      console.log(`   ${String(cen.nota_check).padStart(3)}    ${String(bruta).padStart(3)}     ${flag ? 'TRUE ' : 'false'}     ${clamp ? '🔴 SIM' : 'não  '}   ${pares.slice(0, 3).map(([k, v]) => `${k.slice(0, 14)}=${v}`).join(' ')}${flag ? (temLastro ? '  [com lastro]' : '  🔴 [SEM lastro]') : ''}`);
    } catch (e: any) {
      console.log(`   ${String(cen.nota_check).padStart(3)}    🔴 ${String(e?.message || e).slice(0, 50)}`);
    }
  }

  console.log(`\nclamp atuaria em: ${clampAtuaria} · flag com lastro: ${flagComLastro} · flag SEM lastro: ${flagSemLastro} · sem flag: ${semFlag}`);
  console.log(clampAtuaria === 0
    ? '\n✅ O CLAMP NUNCA ATUA nesta amostra: o modelo já devolve nota baixa junto do flag.\n'
      + '   Derivar `erro_grave` em código NÃO mudaria nota nenhuma — o remédio proposto\n'
      + '   era para um mecanismo que não é o que produz a divergência. A divergência é\n'
      + '   o auditor pontuando mais baixo, ponto. Reabrir com outra hipótese.'
    : `\n🔴 O clamp atua em ${clampAtuaria} caso(s). Derivar em código muda a nota — e se houver\n   flag SEM lastro (${flagSemLastro}), é bandeira que nenhuma dimensão sustenta.`);
  process.exit(0);
}

main();
