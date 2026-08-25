/**
 * Provedores que falam o dialeto OpenAI — fonte ÚNICA de prefixo → base/chave.
 *
 * Por que vive em `lib/` e não em `actions/ai-client.ts`: a lista responde uma
 * pergunta PURA ("este id de modelo tem rota?") que quatro lugares precisavam
 * fazer — os dois `dispatch` (callAI e callAIChat), o `resolverProvedorCompat` e
 * o guard de `MODELOS_DISPONIVEIS` na suíte. Enquanto cada um tinha a própria
 * cópia, somar um provedor em um só deixava o modelo cair no `callClaude` (que é
 * o último caso do dispatch) e falhar etiquetado como **Anthropic** no Sentry —
 * parece queda de provedor, é modelo sem rota. O `ai-client.ts` já registra a
 * mesma classe de bug entre `callOpenAI` e `callOpenAIChat` ("os gêmeos que
 * divergem"); isto fecha o nível de baixo.
 *
 * Aqui só entram STRINGS estáticas: prefixo, nome do provedor (que vira
 * `ia_usage_log.provider`), NOME da variável de ambiente e URL. A chave em si
 * continua sendo lida em `process.env[env]` no servidor, na hora da chamada.
 */
export const PROVEDORES_OPENAI_COMPAT = [
  { prefixo: 'kimi', provider: 'kimi', env: 'KIMI_API_KEY', url: 'https://api.moonshot.ai/v1/chat/completions' },
  { prefixo: 'grok', provider: 'xai',  env: 'XAI_API_KEY',  url: 'https://api.x.ai/v1/chat/completions' },
  // Qwen (Alibaba) e Muse Spark (Meta Superintelligence Labs), 25/08/2026.
  // URLs e ids CONFERIDOS na própria API com as chaves do projeto, não em blog:
  //   GET dashscope-intl/compatible-mode/v1/models → 162 modelos, `qwen3.8-max` entre eles
  //   GET api.meta.ai/v1/models → `muse-spark-1.2`, `muse-spark-1.2-contributor`, `muse-spark-1.1`
  // Duas fontes de terceiros davam o id errado do Muse (`meta/muse-spark-1.2` é
  // o id do OpenRouter, não o da API de primeira parte). Os dois respondem 200
  // com o corpo que `callOpenAI` monta — `max_tokens`, e não
  // `max_completion_tokens`, porque o `isNew` de lá só cobre gpt-5*/o1..o4.
  { prefixo: 'qwen', provider: 'qwen', env: 'QWEN_API_KEY',       url: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions' },
  { prefixo: 'muse', provider: 'meta', env: 'META_MODEL_API_KEY', url: 'https://api.meta.ai/v1/chat/completions' },
] as const;

/** Prefixos nativos da OpenAI (mesma base/chave default, sem entrada própria). */
const PREFIXOS_OPENAI_NATIVOS = ['gpt', 'o1', 'o3', 'o4'] as const;

/** O modelo fala o dialeto OpenAI? Único predicado de rota do projeto. */
export function ehOpenAICompat(modelId: string): boolean {
  const m = String(modelId || '');
  if (PREFIXOS_OPENAI_NATIVOS.some((p) => m.startsWith(p))) return true;
  return PROVEDORES_OPENAI_COMPAT.some((p) => m.startsWith(p.prefixo));
}

/**
 * O `dispatch` de `ai-client.ts` consegue rotear este id?
 *
 * O último caso do dispatch é `callClaude`, então um prefixo desconhecido NÃO
 * falha limpo: vai para a Anthropic com um id que ela não conhece. Este
 * predicado é o que separa "modelo suportado" de "erro com a etiqueta errada",
 * e é o que o guard da suíte exige de tudo que aparece em `MODELOS_DISPONIVEIS`.
 */
export function modeloTemRota(modelId: string): boolean {
  const m = String(modelId || '');
  return m.startsWith('claude') || m.startsWith('gemini') || ehOpenAICompat(m);
}
/**
 * Extrai o texto da resposta OpenAI-compatible, FALHANDO ALTO quando o modelo
 * gastou tokens e não devolveu conteúdo.
 *
 * `Medido em 25/08/2026` ao ligar o Muse Spark 1.2: com `max_tokens: 32` ele
 * respondeu **HTTP 200** com `content: ""`, `finish_reason: "length"` e
 * `completion_tokens: 32` — todos gastos em `reasoning_tokens`. Com teto de 600,
 * o mesmo prompt devolveu "OK" usando **125 tokens de raciocínio**.
 *
 * É o modo de falha que o Sonnet 5 já tinha aqui (o thinking come o budget de
 * `max_tokens`), mas pior: lá o JSON truncava e o parse acusava; aqui o
 * `|| ''` de antes devolvia string vazia com 200, e o chamador seguia como se
 * a IA tivesse respondido. Uma resposta 200 vazia é exatamente o que fura
 * fail-loud — o caller registra um "sucesso" sem conteúdo.
 *
 * Vazio COM tokens gastos = teto apertado demais para um modelo que raciocina.
 * O conserto é o teto do call-site, e a mensagem diz isso.
 */
export function conteudoOuFalhaAlto(data: any, model: string): string {
  const conteudo = data?.choices?.[0]?.message?.content || '';
  if (conteudo) return conteudo;
  const u = data?.usage;
  const gastos = u?.completion_tokens || 0;
  const raciocinio = u?.completion_tokens_details?.reasoning_tokens || 0;
  if (gastos > 0) {
    throw new Error(
      `${model}: resposta 200 com conteúdo VAZIO após ${gastos} tokens de saída`
      + (raciocinio ? ` (${raciocinio} deles de raciocínio)` : '')
      + `, finish_reason=${data?.choices?.[0]?.finish_reason ?? 'desconhecido'}. `
      + 'Modelo que raciocina divide o teto de max_tokens com o raciocínio: suba o teto no call-site. '
      + 'Falha aqui de propósito — devolver "" faria o chamador tratar isto como resposta válida.',
    );
  }
  return '';
}
