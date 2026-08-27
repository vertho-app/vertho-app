/**
 * CANÁRIO DE CONTRATO — uma chamada REAL por modelo, antes de trocar.
 *
 * Por que existe (26/08/2026): `tests/unit/integrations/ai-contrato-por-modelo.test.ts`
 * trava 83 invariantes sobre o corpo que o wrapper MONTA. Nenhuma delas prova
 * que o fornecedor ACEITA esse corpo — mock testa o nosso código, e essa é
 * regra escrita da casa. O caso concreto: em 07/08 o `claude-opus-5` devolveu
 * 400 `thinking.type.enabled is not supported for this model`. Toda a suíte
 * seguia verde, porque o wrapper mandava exatamente o que a suíte esperava.
 *
 * O que só uma chamada real responde:
 *   · o modelo aceita `output_config.effort` / `reasoning_effort`?
 *   · o teto chega no parâmetro que ESTE modelo lê? (o qwen ignora `max_tokens`)
 *   · sobra orçamento para TEXTO depois do raciocínio, ou volta 200 vazia?
 *   · o JSON sai PARSEÁVEL? — que é a pergunta que decide a troca, porque teto
 *     curto não devolve resposta curta: devolve JSON cortado no meio.
 *
 * Custo: prompts minúsculos, um por modelo. Ordem de centavos.
 * As linhas entram no ledger com `source: 'canario'`, fora da população de
 * produção que o auditor de tetos usa.
 *
 *   npx tsx --env-file=.env.local scripts/_canario-contrato-modelos.ts
 *   npx tsx --env-file=.env.local scripts/_canario-contrato-modelos.ts claude-sonnet-5 gemini-3.7-flash
 */
import { callAI } from '../actions/ai-client';
import { MODELOS_DISPONIVEIS } from '../lib/ai-tasks';

const SYSTEM = 'Você responde APENAS com JSON válido, sem cercas de código, sem texto fora do objeto.';

// Pede estrutura aninhada de propósito: JSON raso sobrevive a truncamento
// (fecha por acaso), aninhado não. É o formato que revela o corte.
const USER = `Devolva EXATAMENTE este objeto, preenchendo os campos:
{"ok":true,"itens":[{"id":1,"nome":"alfa","tags":["a","b"]},{"id":2,"nome":"beta","tags":["c","d"]}],"resumo":"uma frase curta"}`;

// Prefixo estável e grande o bastante para passar do piso de cache do Claude
// (~4.000 chars). Nos demais dialetos ele vai concatenado — e é justamente essa
// diferença que a conta de custo cross-família precisa que seja real.
const PREFIXO = 'Contexto de referência, estável entre chamadas. '.repeat(120);

interface Resultado {
  modelo: string;
  ok: boolean;
  jsonValido: boolean;
  chars: number;
  ms: number;
  erro?: string;
}

async function canario(modelo: string, opts: Record<string, any>, rotulo: string): Promise<Resultado> {
  const t0 = Date.now();
  try {
    const texto = await callAI(SYSTEM, USER, { model: modelo }, 2000, {
      taskKey: 'canario_contrato',
      source: 'canario',
      timeoutMs: 180_000,
      ...opts,
    });
    const limpo = String(texto || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    let jsonValido = false;
    try {
      const o = JSON.parse(limpo);
      // Não basta parsear: um `{}` parseia. Confere a ESTRUTURA pedida.
      jsonValido = Array.isArray(o?.itens) && o.itens.length === 2 && Array.isArray(o.itens[0]?.tags);
    } catch { jsonValido = false; }
    return { modelo: `${modelo} ${rotulo}`, ok: limpo.length > 0, jsonValido, chars: limpo.length, ms: Date.now() - t0 };
  } catch (e: any) {
    return { modelo: `${modelo} ${rotulo}`, ok: false, jsonValido: false, chars: 0, ms: Date.now() - t0, erro: String(e?.message || e).slice(0, 160) };
  }
}

async function main() {
  const pedidos = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const alvos = pedidos.length ? pedidos : MODELOS_DISPONIVEIS.map((m) => m.id);

  console.log(`Canário de contrato · ${alvos.length} modelo(s) · chamada REAL, teto 2.000\n`);
  console.log('Cada modelo passa por três combinações — são elas que quebram na troca:');
  console.log('  [base]   sem opções          · o caminho mais simples');
  console.log('  [effort] reasoningEffort:high · o parâmetro que já devolveu 400');
  console.log('  [cache]  cachedUserPrefix     · breakpoint no Claude, concatenado nos demais\n');

  const linhas: Resultado[] = [];
  for (const modelo of alvos) {
    for (const [rotulo, opts] of [
      ['[base]', {}],
      ['[effort]', { reasoningEffort: 'high' as const }],
      ['[cache]', { cachedUserPrefix: PREFIXO }],
    ] as const) {
      const r = await canario(modelo, opts, rotulo);
      linhas.push(r);
      const sinal = r.erro ? '🔴 ERRO' : !r.ok ? '🔴 VAZIA' : !r.jsonValido ? '⚠️  JSON INVÁLIDO/CORTADO' : '✅';
      console.log(`  ${sinal.padEnd(26)} ${r.modelo.padEnd(34)} ${String(r.chars).padStart(5)} chars  ${String(r.ms).padStart(6)} ms`);
      if (r.erro) console.log(`       ${r.erro}`);
    }
  }

  // Fail-loud: canário que só imprime vira relatório que ninguém lê.
  const quebrados = linhas.filter((l) => l.erro || !l.ok || !l.jsonValido);
  console.log(`\n${linhas.length - quebrados.length} de ${linhas.length} combinações OK.`);
  if (quebrados.length) {
    console.log('\n🔴 NÃO trocar os modelos abaixo antes de resolver:');
    for (const q of quebrados) console.log(`   ${q.modelo}${q.erro ? ` — ${q.erro}` : q.ok ? ' — respondeu, mas o JSON não fecha' : ' — resposta vazia'}`);
    process.exitCode = 1;
  } else {
    console.log('✅ todos aceitaram o corpo e devolveram JSON íntegro.');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
