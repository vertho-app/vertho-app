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

/**
 * Lista os ids que o provedor de `modeloExemplo` reconhece hoje.
 *
 * Vive AQUI, e não no health-check que a consome, por duas razões:
 *
 * 1. `tests/unit/integrations/ia-request-cru-guard.test.ts` proíbe qualquer
 *    arquivo de produção montar request HTTP cru para o host da Anthropic — e a
 *    allowlist correspondente está VAZIA de propósito ("acrescentar arquivo ali
 *    para passar o CI é exatamente o bug que esta guarda existe para pegar").
 *    O caminho sancionado é o SDK oficial, que é o que o ramo anthropic usa.
 *    (Sem citar o host literal aqui: o guard casa a STRING, e prosa de
 *    documentação virando violação treina a ignorar o guard — é o que o próprio
 *    arquivo dele diz ao isentar os `-html.ts`.)
 * 2. Quem sabe a base/chave de cada provedor é esta tabela. Uma segunda cópia no
 *    coletor foi justamente o que produziu falso positivo na primeira rodada.
 *
 * O endpoint sai do PREFIXO do id — mesmo critério de `resolverProvedorCompat` —
 * para que o check pergunte ao mesmo lugar que a chamada real usaria.
 */
export type ListagemProvedor = { ids: Set<string> } | { erro: string };

export async function listarModelosDoProvedor(
  familia: string,
  modeloExemplo: string,
): Promise<ListagemProvedor> {
  const json = async (url: string, headers: Record<string, string>) => {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };
  try {
    if (familia === 'anthropic') {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return { erro: 'ANTHROPIC_API_KEY ausente' };
      // SDK oficial: sem URL crua, o guard fica satisfeito por CONSTRUÇÃO em vez
      // de por exceção declarada.
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const lista = await new Anthropic({ apiKey }).models.list({ limit: 100 });
      return { ids: new Set((lista?.data || []).map((m: any) => m.id)) };
    }
    if (familia === 'google') {
      const k = process.env.GEMINI_API_KEY;
      if (!k) return { erro: 'GEMINI_API_KEY ausente' };
      const d = await json(`https://generativelanguage.googleapis.com/v1beta/models?key=${k}&pageSize=200`, {});
      // O Gemini devolve `models/gemini-x`; o projeto configura o id nu.
      return { ids: new Set((d?.models || []).map((m: any) => String(m.name).replace(/^models\//, ''))) };
    }
    const p = PROVEDORES_OPENAI_COMPAT.find((x) => modeloExemplo.startsWith(x.prefixo));
    const env = p?.env ?? 'OPENAI_API_KEY';
    const url = (p?.url ?? 'https://api.openai.com/v1/chat/completions').replace(/\/chat\/completions$/, '') + '/models';
    const k = process.env[env];
    if (!k) return { erro: `${env} ausente` };
    const d = await json(url, { Authorization: `Bearer ${k}` });
    return { ids: new Set((d?.data || []).map((m: any) => m.id)) };
  } catch (err: any) {
    return { erro: String(err?.message || err).slice(0, 80) };
  }
}

/**
 * O provedor deste modelo exige `max_completion_tokens` em vez de `max_tokens`?
 *
 * 🔴 MEDIDO EM 25/08/2026, mandando teto 100 e olhando `completion_tokens`:
 *
 *   modelo           max_tokens:100      max_completion_tokens:100
 *   qwen3.8-max      **1.675** 🔴        102 ✅
 *   muse-spark-1.2   100 ✅              100 ✅
 *   kimi-k3          100 ✅              100 ✅
 *   grok-4.6         100 ✅              100 ✅
 *
 * O Qwen IGNORA `max_tokens` — 16× o teto pedido. Até esta correção o `isNew`
 * testava só `gpt-5|o1|o3|o4`, então `qwen*` recebia o campo legado e rodava
 * SEM TETO EFETIVO: no piloto de cenários, 10 de 10 chamadas passaram dos 6.144
 * que o código achava estar impondo, uma chegou a 16.735.
 *
 * Teto que o código pensa que aplica e o provedor ignora é pior que teto ausente:
 * a conta de custo, a comparação entre modelos e o gate de `maxDuration` são
 * todos feitos sobre um número que não existe.
 *
 * Os quatro honram `max_completion_tokens`, então mandar o campo novo para todos
 * os OpenAI-compatible é seguro e elimina a lista por prefixo — que era a fonte
 * do bug (um provedor novo entra e ninguém lembra de acrescentá-lo).
 */
export function usaMaxCompletionTokens(modelId: string): boolean {
  const m = String(modelId || '');
  if (m.startsWith('gpt-5') || m.startsWith('o1') || m.startsWith('o3') || m.startsWith('o4')) return true;
  // Todo provedor OpenAI-compatible com entrada própria: verificado acima.
  return PROVEDORES_OPENAI_COMPAT.some((p) => m.startsWith(p.prefixo));
}

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
