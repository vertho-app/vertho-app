/**
 * `contencao_sobriedade` é o acervo ou é o Terra?
 *
 * A medição de 25/08 mostrou que, quando o `ia3_check` (GPT 5.6 Terra) reprova
 * um cenário do acervo, a dimensão mais baixa é quase sempre a mesma:
 * `contencao_sobriedade` (4, 6, 2, 5, 2, 6, 5 na amostra). Duas leituras:
 *
 *   (i)  o acervo é elaborado/teatral demais para uso real — e o Terra está
 *        certo, o que torna as notas antigas de 88-100 generosas;
 *   (ii) o Terra pesa demais essa dimensão — viés do auditor.
 *
 * Auto-consistência não separa: o Terra concorda consigo mesmo (±2 pontos). O
 * que separa é perguntar a MAIS DE UMA FAMÍLIA. Se as três apontarem a mesma
 * dimensão como a menor, é o acervo. Se só o Terra apontar, é o auditor.
 *
 * Nenhum dos três auditores é da família que GEROU os cenários (Claude), então
 * não há o viés de auto-preferência que contaminou o painel do PDI.
 *
 *   node --env-file=.env.local node_modules/.bin/tsx scripts/_ia3-check-3-familias.ts
 */
import { setGlobalDispatcher, Agent } from 'undici';
import { createSupabaseAdmin } from '../lib/supabase';
import { callAI } from '../actions/ai-client';
import { extractJSON } from '../actions/utils';
import { montarCheckIA3Prompt } from '../lib/ia3-cenarios';

setGlobalDispatcher(new Agent({ headersTimeout: 900_000, bodyTimeout: 900_000 }));

const AUDITORES = [
  { modelo: 'gpt-5.6-terra', familia: 'openai' },
  { modelo: 'gemini-3.7-flash', familia: 'google' },
  { modelo: 'qwen3.8-max', familia: 'alibaba' },
];

async function main() {
  const sb = createSupabaseAdmin();
  const { data } = await sb.from('banco_cenarios')
    .select('id,titulo,descricao,cargo,competencia_id,empresa_id,ppp_escola_id,alternativas,nota_check')
    .not('nota_check', 'is', null).gte('nota_check', 88).limit(4);
  const cenarios = (data || []) as any[];

  // menorDim[auditor] = quantas vezes cada dimensão foi a MENOR
  const menorPorAuditor = new Map<string, Map<string, number>>();
  const notasPorAuditor = new Map<string, number[]>();
  const sobriedadePorAuditor = new Map<string, number[]>();
  const todasPorAuditor = new Map<string, number[]>();

  for (const cen of cenarios) {
    const { system, user } = await montarCheckIA3Prompt(sb, cen);
    for (const a of AUDITORES) {
      try {
        // Teto 8192 (não 4096): Qwen e outros de raciocínio dividem o teto com o
        // pensamento. Com o `max_completion_tokens` já corrigido, o teto vale.
        const r = await callAI(system, user, { model: a.modelo }, 8192, {
          taskKey: 'ia3_check', source: '3familias', timeoutMs: 900_000,
        });
        const j: any = await extractJSON(r);
        const dims = j?.dimensoes || {};
        const pares = Object.entries(dims).map(([k, v]) => [k, Number(v)] as [string, number])
          .filter(([, v]) => Number.isFinite(v)).sort((x, y) => x[1] - y[1]);
        if (!pares.length) { console.log(`  ${a.modelo.padEnd(17)} ${String(cen.titulo).slice(0, 28).padEnd(30)} sem dimensões`); continue; }

        const menor = pares[0][0];
        const m = menorPorAuditor.get(a.modelo) || new Map<string, number>();
        m.set(menor, (m.get(menor) || 0) + 1);
        menorPorAuditor.set(a.modelo, m);

        notasPorAuditor.set(a.modelo, [...(notasPorAuditor.get(a.modelo) || []), Number(j?.nota)]);
        const sob = Number(dims.contencao_sobriedade);
        if (Number.isFinite(sob)) sobriedadePorAuditor.set(a.modelo, [...(sobriedadePorAuditor.get(a.modelo) || []), sob]);
        todasPorAuditor.set(a.modelo, [...(todasPorAuditor.get(a.modelo) || []), ...pares.map(([, v]) => v)]);

        console.log(`  ${a.modelo.padEnd(17)} ${String(cen.titulo).slice(0, 28).padEnd(30)} nota ${String(j?.nota).padStart(3)}  menor=${menor}(${pares[0][1]})`);
      } catch (e: any) {
        console.log(`  ${a.modelo.padEnd(17)} ${String(cen.titulo).slice(0, 28).padEnd(30)} 🔴 ${String(e?.message || e).slice(0, 44)}`);
      }
    }
  }

  const media = (v?: number[]) => (v && v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
  console.log('\n── por auditor ──');
  const sobrieEhMenor: string[] = [];
  for (const a of AUDITORES) {
    const m = menorPorAuditor.get(a.modelo);
    if (!m) { console.log(`  ${a.modelo.padEnd(17)} sem dados`); continue; }
    const ranking = [...m.entries()].sort((x, y) => y[1] - x[1]);
    const nSob = m.get('contencao_sobriedade') || 0;
    const total = [...m.values()].reduce((s, x) => s + x, 0);
    if (nSob > total / 2) sobrieEhMenor.push(a.modelo);
    console.log(`  ${a.modelo.padEnd(17)} nota média ${media(notasPorAuditor.get(a.modelo)).toFixed(1).padStart(5)} · sobriedade média ${media(sobriedadePorAuditor.get(a.modelo)).toFixed(1)} vs todas ${media(todasPorAuditor.get(a.modelo)).toFixed(1)} · foi a menor em ${nSob}/${total}  [${ranking.map(([k, v]) => `${k}:${v}`).join(' ')}]`);
  }

  console.log('\n── leitura ──');
  if (sobrieEhMenor.length >= 2) {
    console.log(`✅ É O ACERVO. ${sobrieEhMenor.length} de ${AUDITORES.length} famílias apontam \`contencao_sobriedade\` como a`);
    console.log('   dimensão mais fraca na maioria dos cenários. O Terra não está enviesado — os');
    console.log('   cenários são elaborados demais, e as notas antigas de 88-100 eram generosas.');
  } else if (sobrieEhMenor.length === 1) {
    console.log(`🔴 É O AUDITOR. Só ${sobrieEhMenor[0]} aponta \`contencao_sobriedade\` como a menor;`);
    console.log('   as outras famílias discordam. O peso dessa dimensão é idiossincrasia do modelo,');
    console.log('   e o `status_check` herda esse viés.');
  } else {
    console.log('⚠️ INCONCLUSIVO: nenhuma família aponta sobriedade como a menor na maioria.');
    console.log('   A hipótese que motivou o teste não se sustenta nesta amostra.');
  }
  process.exit(0);
}

main();
