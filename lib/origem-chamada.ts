/**
 * De ONDE veio uma chamada de IA sem `taskKey`.
 *
 * Por que existe (27/08/2026): `untagged` é 33% da produção (3.630 chamadas,
 * US$ 96 em Sonnet 4.6) e o ledger responde "quanto" sem responder "onde" — o
 * achado F13 da auditoria de 09-10/08, que segue aberto um ano depois porque
 * etiquetar 52 call-sites à mão resolve os de hoje e não os de amanhã.
 *
 * A allowlist estática diz QUAIS sites não têm etiqueta; ela não diz QUAIS
 * rodam. Das 52 entradas, o tráfego recente tem uma assinatura só (input ~2.100,
 * saída ~2.200, 42 s, todo dia) — ou seja, um punhado delas responde por quase
 * tudo, e não dá para saber qual sem medir.
 *
 * ⚠️ O que este módulo NÃO tenta ser: um mapa de arquivo:linha. Em produção o
 * código é bundlado e o stack devolve `chunks/1234.js:56:78`, que muda a cada
 * deploy e não ajuda ninguém. O que sobrevive ao bundle é o NOME DA FUNÇÃO, e é
 * nele que este módulo se apoia. Quando nem isso sobrar, devolve null — que é
 * "não consegui" e aparece como tal, em vez de virar um rótulo inventado.
 *
 * ⚠️ LIMITE MEDIDO: `return callAI(...)` em posição de cauda dentro de uma
 * função async faz o V8 **elidir o frame** dela. Medido em 27/08: a função que
 * chamou sumiu do stack e sobrou a de cima. Por isso a captura acontece na
 * ENTRADA de `callAI`, onde a pilha ainda é síncrona, e não lá dentro depois
 * dos awaits. Mesmo assim, um call-site em cauda pode reportar o chamador dele
 * — é pista direcional, não endereço exato, e serve para escolher o que
 * etiquetar primeiro.
 */

/**
 * Frames que nunca são a resposta: o próprio wrapper e o runtime.
 *
 * ⚠️ Filtrado por NOME DE FUNÇÃO, não por caminho de arquivo. A 1ª versão
 * testava a linha inteira do stack — que inclui o path — contra `/ai-client|
 * origem-chamada/`, e isso tinha dois defeitos opostos: em teste descartava
 * qualquer chamador cujo ARQUIVO tivesse esse nome (o próprio
 * `origem-chamada.test.ts` sumia, e o resultado era sempre null); em produção,
 * onde o código é bundlado em `chunks/1234.js`, não descartaria nada — os
 * quadros do wrapper apareceriam como se fossem a resposta. Nome de função
 * sobrevive ao bundle e não colide com path.
 */
const FUNCOES_DO_WRAPPER = new Set([
  'origemDaChamada', 'callAI', 'callAIChat',
  'callClaude', 'callClaudeChat', 'callGemini', 'callGeminiChat',
  'callOpenAI', 'callOpenAIChat', 'registrarUsoIA', 'withAIRetry', 'dispatch',
]);
const RUIDO_RUNTIME = /(node:internal|processTicksAndRejections|async Promise)/;

/**
 * Nomes que não identificam nada. A lista é CURTA de propósito.
 *
 * ⚠️ A primeira versão também descartava `main`, `run`, `handler` e `fn` — e
 * isso zerava justamente os casos que mais importam: numa task do Trigger o
 * quadro externo É `run`, numa rota É `handler`. Pior, quando o único nome
 * disponível caía aqui o retorno virava `null`, indistinguível de "o stack não
 * tinha nada". Nome genérico ainda é melhor que nada, e combinado com o segundo
 * nome costuma bastar.
 */
const GENERICOS = new Set(['<anonymous>', 'Object', 'Module', 'eval']);

/**
 * Devolve algo como `avaliarUmaRespostaCore ← rodarIA4`, ou null.
 *
 * `profundidade` = quantos nomes encadear. Dois costuma bastar para distinguir
 * dois call-sites do mesmo arquivo sem virar uma cardinalidade que ninguém
 * agrupa.
 */
export function origemDaChamada(profundidade = 2): string | null {
  // O default de `Error.stackTraceLimit` e 10, e entre o ledger e o chamador
  // ha frames do SDK e do proprio wrapper — com 10 o quadro que interessa fica
  // FORA da captura, e o resultado e um `null` que parece "nao deu" quando na
  // verdade e "nao olhei fundo o bastante".
  const limiteOriginal = Error.stackTraceLimit;
  Error.stackTraceLimit = 40;
  const bruto = new Error().stack;
  Error.stackTraceLimit = limiteOriginal;
  if (!bruto) return null;
  if (process.env.DEBUG_ORIGEM) console.log('[origem] stack cru:', bruto);

  const nomes: string[] = [];
  for (const linha of bruto.split('\n').slice(1)) {
    if (RUIDO_RUNTIME.test(linha)) continue;
    // "    at nomeDaFuncao (/caminho:12:34)" | "    at /caminho:12:34"
    const m = linha.match(/^\s*at\s+(?:async\s+)?([^\s(]+)\s*\(/);
    if (!m) continue;
    // `Objeto.metodo` → fica com o método, que é o que identifica.
    const nome = m[1].split('.').pop() || m[1];
    if (!nome || GENERICOS.has(nome) || FUNCOES_DO_WRAPPER.has(nome) || /^\d/.test(nome)) continue;
    if (nomes.includes(nome)) continue;
    nomes.push(nome);
    if (nomes.length >= profundidade) break;
  }
  return nomes.length ? nomes.join(' ← ') : null;
}
