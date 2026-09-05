/**
 * 🔴 A8 (auditoria 22/08) — ESTE ARQUIVO NÃO É MAIS `'use server'`, de propósito.
 *
 * Com a diretiva, todo export virava endpoint HTTP: `callAI` e `callAIChat`
 * estavam no `server-reference-manifest.json` (medido no build de 24/08, 485
 * entradas — os dois ids entre elas). O servidor ACEITAVA os ids. Quem os
 * tivesse executava prompt arbitrário, com `model` e `maxTokens` à escolha, na
 * conta da Vertho — sem sessão, sem `taskKey`, sem teto.
 *
 * O atenuante era acidental: os ids não apareciam em `.next/static/chunks`,
 * então o browser não os publicava. "Não publicado hoje" não é gate, e a
 * advisory GHSA-955p-x3mx-jcvp (que afeta a faixa em que estamos) baixa o custo
 * de enumerar exatamente esse tipo de id.
 *
 * `Medido antes de tirar:` os **62 importadores** deste módulo são todos de
 * SERVIDOR — nenhum client component o importa. A diretiva não servia a
 * ninguém; só criava dois endpoints. É o padrão que o CLAUDE.md já descreve:
 * núcleo sem gate fora de `'use server'`, e a action que precisar aplica o gate.
 *
 * ⚠️ Se um dia uma tela precisar chamar IA do cliente, o caminho NÃO é devolver
 * a diretiva aqui — é criar uma action fina, com gate e `taskKey`, que delega.
 */

import Anthropic from '@anthropic-ai/sdk';
import { cookies } from 'next/headers';
import { AppLocale, defaultLocale } from '@/i18n/routing';
import { localeCookieName, localeLanguageName, resolveAppLocale } from '@/lib/i18n';
import { costFromTokens } from '@/lib/ia-cost-catalog';
// Predicados PUROS vivem em lib/. ⚠️ Este comentário dizia que o arquivo é
// `'use server'` e que todo export precisa ser async — deixou de valer em 24/08
// (A8, ver o cabeçalho acima). A regra de ORGANIZAÇÃO continua: predicado puro
// mora em `lib/`, não aqui.
import { isCapDeContaAIError, isRateLimitPorBilling } from '@/lib/ai-erros';
import { PROVEDORES_OPENAI_COMPAT, ehOpenAICompat, conteudoOuFalhaAlto, usaMaxCompletionTokens } from '@/lib/ai-provedores';
import { fallbackRespeitandoDual } from '@/lib/ai-tasks';
import { contextoAtual, fracaoDoOrcamento } from '@/lib/execucao-contexto';
import { origemDaChamada } from '@/lib/origem-chamada';

const DEFAULT_MODEL = 'claude-sonnet-4-6';

// Timeout por chamada de IA. Sem isto, uma request que "pendura" (rede/modelo)
// bloqueia a função até o maxDuration da rota (até 300s), travando lotes
// inteiros. 120s cobre gerações longas (IA3 ~60-90s) e ainda deixa margem p/
// retry dentro do limite da rota.
const AI_TIMEOUT_MS = 120000;

export interface AIConfig {
  model?: string;
}

export interface AICallOptions {
  /** Identificador da tentativa, para conciliar custo sem aproximação por horário. */
  correlationId?: string;
  temperature?: number;
  thinking?: boolean;
  thinkingBudget?: number;
  locale?: AppLocale;
  // Override do timeout/maxRetries do SDK (Claude) por chamada. Chamadas densas
  // legítimas (segmentação/autoria de módulo) precisam de mais que os 120s
  // default sem disparar o retry do SDK (que dobra o tempo e estoura a rota).
  timeoutMs?: number;
  maxRetries?: number;
  // Prefixo GRANDE e ESTÁVEL do user message (ex.: régua + cenário + rubrica,
  // idênticos entre os colaboradores do MESMO lote) — vira um bloco com
  // `cache_control` próprio no Claude (2º breakpoint, além do system). Em lote
  // (ex.: IA4 sobre N colabs da mesma competência) as chamadas seguintes em 5min
  // pagam ~10% nesse trecho. Gemini/OpenAI: concatenado ao user (sem cache).
  cachedUserPrefix?: string;
  // Etiqueta da tarefa no ledger de IA (ia_usage_log.feature). Sem ela a
  // chamada é registrada como 'untagged' — adoção incremental pelos call-sites.
  taskKey?: string;
  // Atribuição opcional (para custo por empresa/colaborador no ledger).
  // Não obrigatório: o eixo primário do ledger é feature × modelo × tokens.
  empresaId?: string | null;
  colaboradorId?: string | null;
  // Origem da chamada no ledger (ia_usage_log.source). Default 'wrapper'.
  // O simulador de temporada marca 'simulator' para que as rodadas de medição
  // sejam isoláveis do tráfego real e o overhead do "aluno" seja netável.
  source?: string;
  // Sufixo VOLÁTIL do system (ex.: instrução do turno no chat socrático), que
  // muda a cada chamada. Fica DEPOIS do breakpoint de cache → o prefixo estável
  // (persona/régua/contexto) é cacheado e lido a 0,1× nos turnos seguintes,
  // enquanto o sufixo não quebra o cache. Prompt caching é output-neutral: a
  // resposta é byte-idêntica, só muda o billing. (Claude: 2 blocos de system;
  // Gemini/OpenAI: concatenado, sem cache.)
  systemSuffix?: string;
  // Parte VOLÁTIL de um chat multi-turn (grounding + instrução do turno) que
  // deve ficar FORA do prefixo cacheado. Com cacheHistory=true (Claude): migra
  // p/ a cauda da última mensagem do usuário e cache_control vai na última
  // assistant → cacheia system+histórico. Sem cacheHistory: volta pro system
  // (byte-idêntico). Gemini/OpenAI: sempre concatenado ao system.
  userSuffix?: string;
  // Liga o history caching (relocação do userSuffix + cache_control). Só Claude.
  // O caller gateia por flag (IA_CACHE_HISTORY) até a qualidade ser validada.
  cacheHistory?: boolean;
  // Desliga o auto-cache do system. O default (`system.length > 4000`) trata
  // COMPRIMENTO como sinal de ESTABILIDADE, e nos geradores de conteúdo isso é
  // falso: o system passa dos 4.000 chars justamente porque foi enriquecido com
  // módulo-base + kit (actions/conteudos.ts), que são únicos por chamada. O
  // prefixo nunca repete, então cada chamada paga o write (1,25×) de um cache
  // que ninguém lê. Medido em 30/08, 30 dias de ia_usage_log: conteudo_texto
  // 282.120 tokens escritos contra 0 lidos, conteudo_podcast 276.536 contra 0,
  // conteudo_case 275.633 contra 2.845. Passe `false` só com a leitura do
  // ledger na mão — em conteudo_video o mesmo call-site LÊ (75.366 contra
  // 234.545 escritos), e ali desligar sairia mais caro que manter.
  cacheSystem?: boolean;
  // Esforço de raciocínio. GPT-5.6 também aceita none/minimal; `none` é a
  // baseline oficial para fluxos sensíveis a latência, como o Copiloto ao vivo.
  // Medido no kimi-k3 (20/07): low=7 tokens de thinking
  // vs high=62 no mesmo prompt — em tarefa de redação, low corta o custo dominante.
  //  - OpenAI-compatible (kimi-k3, gpt-5.x): vira `reasoning_effort` no body.
  //  - Claude geração 5 / 4.7+ : vira `output_config.effort` (07/08). Antes era
  //    IGNORADO no ramo Anthropic, então "opus-5 em high" rodava em esforço
  //    PADRÃO com o rótulo errado — pior que falhar, porque a tabela mente.
  //  - Gemini: ignorado.
  reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  /**
   * INTERNO — preenchido por `callAI`/`callAIChat` quando falta `taskKey`.
   * Capturado na ENTRADA, onde a pilha ainda e sincrona: dentro de
   * `registrarUsoIA`, depois de varios awaits, o frame do chamador ja foi
   * elidido pelo V8 (medido em 27/08). Nao passe isto a mao.
   */
  _origemCodigo?: string | null;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

async function resolveAILocale(explicitLocale?: AppLocale): Promise<AppLocale> {
  if (explicitLocale) return explicitLocale;

  try {
    const store = await cookies();
    return resolveAppLocale(store.get(localeCookieName)?.value);
  } catch {
    return defaultLocale;
  }
}

function withLanguageInstruction(system: string, locale: AppLocale): string {
  const language = localeLanguageName(locale);

  return `${system}

═══ IDIOMA DA EXPERIÊNCIA ═══
Use ${language} em todo texto destinado ao usuário final.
Mantenha nomes de campos JSON, enums técnicos, códigos e identificadores exatamente como especificados no prompt.
Se o prompt exigir JSON, retorne JSON válido e traduza apenas os valores textuais voltados ao usuário.`;
}

/**
 * Universal AI router — routes to Claude, Gemini, or OpenAI based on model prefix.
 */
// Erro transitório de provedor (sobrecarga/limite) — vale retry com backoff.
// Ex.: Anthropic 529 overloaded_error, 429 rate_limit, 503.
function isTransientAIError(e: any): boolean {
  const s = e?.status ?? e?.statusCode;
  const m = String(e?.message || e || '').toLowerCase();
  return s === 429 || s === 503 || s === 529
    || /overloaded|rate.?limit|too many requests|temporarily unavailable|\b(429|503|529)\b/.test(m);
}

/** Reexecuta `fn` com backoff exponencial + jitter em erros transitórios. */
async function withAIRetry<T>(fn: () => Promise<T>, label: string, max = 4): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e: any) {
      // Cap de conta não se resolve esperando: sai na hora, sem queimar retries.
      if (isCapDeContaAIError(e) || i >= max || !isTransientAIError(e)) throw e;
      const wait = Math.min(20000, 1500 * 2 ** i) + Math.floor(Math.random() * 500);
      const causa = isRateLimitPorBilling(e) ? 'rate limit por BILLING (não é pico)' : 'transitório';
      console.warn(`[callAI] ${label} ${causa} (${e?.status || ''} ${String(e?.message || '').slice(0, 60)}) — retry ${i + 1}/${max} em ${Math.round(wait / 1000)}s`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

// Fallback de PROVEDOR quando o primário (Claude) fica sobrecarregado mesmo após
// retries (ex.: outage de 529 da Anthropic). Gera por GPT 5.6 Terra (OpenAI) em vez de
// falhar. Sobrescreva com a env AI_FALLBACK_MODEL (alinhar no Vercel se mudar aqui).
// ⚠️ NÃO é a mesma coisa que OPENAI_FALLBACK_MODEL: essa outra é knob EXCLUSIVA do
// Radar (lib/radar/*, default gpt-5.1) e NÃO afeta este fallback central. Manter
// os dois nomes separados de propósito — são fallbacks de subsistemas diferentes.
const AI_FALLBACK_MODEL = process.env.AI_FALLBACK_MODEL || 'gpt-5.6-terra';
// Escada consultada quando o preferido acima cairia na família do parceiro
// Dual-IA da task. Ordem = quem tem mais cobertura de rota/preço primeiro.
const AI_FALLBACK_ESCADA = ['gemini-3.7-flash', 'claude-sonnet-4-6', 'grok-4.6'];

export async function callAI(
  system: string,
  user: string,
  aiConfig: AIConfig = {},
  maxTokens: number = 4096,
  options: AICallOptions = {},
): Promise<string> {
  const model = aiConfig?.model || DEFAULT_MODEL;
  // Sem etiqueta: guarda de onde veio ANTES de qualquer await (mig 231).
  if (!options.taskKey && options._origemCodigo === undefined) {
    options = { ...options, _origemCodigo: origemDaChamada() };
  }
  const locale = await resolveAILocale(options.locale);
  const localizedSystem = withLanguageInstruction(system, locale);

  // Providers sem prompt caching (Gemini/OpenAI) recebem o prefixo concatenado.
  const combinedUser = options.cachedUserPrefix ? `${options.cachedUserPrefix}\n\n${user}` : user;
  // Gemini/OpenAI: sufixo volátil concatenado ao system (sem cache). Claude: via
  // options (2 blocos). Sem systemSuffix, comportamento inalterado.
  const sysForConcat = options.systemSuffix ? `${localizedSystem}\n\n${options.systemSuffix}` : localizedSystem;
  const dispatch = (m: string) => {
    if (m.startsWith('gemini')) return callGemini(sysForConcat, combinedUser, m, maxTokens, options);
    // kimi* (Moonshot) é OpenAI-compatible — mesmo caminho REST, base/chave próprias.
    if (ehOpenAICompat(m)) return callOpenAI(sysForConcat, combinedUser, m, maxTokens, options);
    return callClaude(localizedSystem, user, m, maxTokens, options);
  };

  try {
    return await withAIRetry(() => dispatch(model), model);
  } catch (err: any) {
    // CAP DE CONTA: falha limpa e etiquetada, sem fallback (F-E5). Cair para outro
    // provedor aqui gastaria em outra conta sem ninguém pedir e esconderia a causa.
    if (isCapDeContaAIError(err)) {
      console.error(`[callAI] CAP DE CONTA em ${model} — sem retry e sem fallback, de propósito:`, err?.message ?? err);
      throw new Error(
        `AI indisponível por CAP DE CONTA (${model}): ${err?.message ?? err}. `
        + 'Nenhum retry ou fallback foi tentado — cap não passa com espera, e trocar de provedor '
        + 'automaticamente gastaria em outra conta e esconderia o problema. Ação: revisar crédito/billing do provedor.',
      );
    }
    // Primário sobrecarregado após retries → fallback de provedor.
    // 🔴 NÃO é mais o knob global direto: `AI_FALLBACK_MODEL` é único para a
    // base inteira e vale `gpt-5.6-terra`, que é o AUDITOR de 6 dos 9 pares
    // Dual-IA. Num outage da Anthropic, todo gerador Claude cairia justamente na
    // família do próprio auditor — e o resultado não seria falhar, seria APROVAR
    // com o mesmo modelo dos dois lados, sem erro e sem log. (26/08/2026)
    if (isTransientAIError(err) && !model.startsWith('gemini')) {
      const alvo = fallbackRespeitandoDual(model, options.taskKey, AI_FALLBACK_MODEL, AI_FALLBACK_ESCADA);
      if (alvo && alvo !== model) {
        if (alvo !== AI_FALLBACK_MODEL) {
          console.warn(`[callAI] fallback padrão (${AI_FALLBACK_MODEL}) violaria o Dual-IA de '${options.taskKey}' — usando ${alvo}`);
        }
        console.warn(`[callAI] ${model} sobrecarregado após retries — fallback p/ ${alvo}`);
        try {
          return await withAIRetry(() => dispatch(alvo), alvo, 2);
        } catch (e2: any) {
          console.error(`[callAI] fallback ${alvo} também falhou:`, e2?.message ?? e2);
        }
      } else if (!alvo) {
        // Falhar é o comportamento CORRETO: sem substituto de outra família, um
        // fallback qualquer transformaria a auditoria em eco.
        console.error(`[callAI] sem fallback cross-família para '${options.taskKey}' (primário ${model}) — falhando em vez de auditar com a mesma família.`);
      }
    }
    console.error(`[callAI] Error with model ${model}:`, err);
    throw new Error(`AI call failed (${model}): ${err?.message ?? err}`);
  }
}

/**
 * Multi-turn AI call — sends full message history for conversational use.
 */
export async function callAIChat(
  system: string,
  messages: ChatMessage[],
  aiConfig: AIConfig = {},
  maxTokens: number = 4096,
  options: AICallOptions = {},
): Promise<string> {
  const model = aiConfig?.model || DEFAULT_MODEL;
  // Sem etiqueta: guarda de onde veio ANTES de qualquer await (mig 231).
  if (!options.taskKey && options._origemCodigo === undefined) {
    options = { ...options, _origemCodigo: origemDaChamada() };
  }
  const locale = await resolveAILocale(options.locale);
  const localizedSystem = withLanguageInstruction(system, locale);

  // Gemini/OpenAI não têm caching por breakpoint: os sufixos voláteis
  // (systemSuffix e userSuffix) são concatenados ao system. Claude recebe os
  // sufixos em options e decide (2 blocos / history caching).
  const suffixConcat = [localizedSystem, options.systemSuffix, options.userSuffix].filter(Boolean).join('\n\n');
  const dispatch = (m: string) => {
    if (m.startsWith('gemini')) return callGeminiChat(suffixConcat, messages, m, maxTokens, options);
    if (ehOpenAICompat(m)) return callOpenAIChat(suffixConcat, messages, m, maxTokens, options);
    return callClaudeChat(localizedSystem, messages, m, maxTokens, options);
  };

  try {
    return await withAIRetry(() => dispatch(model), model);
  } catch (err: any) {
    // Mesmo tratamento do gêmeo `callAI`: o knob global aterrissaria na família
    // do parceiro Dual-IA. Este ramo ficou para trás na primeira correção e o
    // guard `ai-fallback-dual` pegou — os dois caminhos, sempre.
    if (isTransientAIError(err) && !model.startsWith('gemini')) {
      const alvo = fallbackRespeitandoDual(model, options.taskKey, AI_FALLBACK_MODEL, AI_FALLBACK_ESCADA);
      if (alvo && alvo !== model) {
        if (alvo !== AI_FALLBACK_MODEL) {
          console.warn(`[callAIChat] fallback padrão (${AI_FALLBACK_MODEL}) violaria o Dual-IA de '${options.taskKey}' — usando ${alvo}`);
        }
        console.warn(`[callAIChat] ${model} sobrecarregado após retries — fallback p/ ${alvo}`);
        try {
          return await withAIRetry(() => dispatch(alvo), alvo, 2);
        } catch (e2: any) {
          console.error(`[callAIChat] fallback ${alvo} também falhou:`, e2?.message ?? e2);
        }
      } else if (!alvo) {
        console.error(`[callAIChat] sem fallback cross-família para '${options.taskKey}' (primário ${model}) — falhando de propósito.`);
      }
    }
    console.error(`[callAIChat] Error with model ${model}:`, err);
    throw new Error(`AI chat call failed (${model}): ${err?.message ?? err}`);
  }
}

// ── Claude (Anthropic SDK) ──────────────────────────────────────────────────

/**
 * Extracts text from Claude response content blocks.
 * When extended thinking is enabled, response contains both 'thinking' and 'text' blocks.
 */
function extractClaudeText(content: any[]): string {
  const textBlock = content.find((block) => block.type === 'text');
  return textBlock?.text || '';
}

// ── Ledger central de IA (Sprint 1) ─────────────────────────────────────────
// Toda chamada de IA que passa pelo wrapper grava usage REAL em ia_usage_log
// (mig 177): tokens in/out/cache, custo na tabela vigente, latência, provider.
// Cobertura por construção: o log vive AQUI, não nos call-sites. Falha de log
// nunca derruba a chamada (try/catch). `feature` = options.taskKey || 'untagged'.
// ⚠️ Batch API (lib/ai-batch) não passa por aqui — ledger do batch é fatia S1.2.

interface LedgerUsage {
  inTokens: number;
  outTokens: number;
  cacheRead?: number;
  cacheWrite?: number;
  /**
   * Motivo de parada do provedor, normalizado. `'truncado'` quando a resposta
   * bateu no teto (`max_tokens` / `length` / `MAX_TOKENS`).
   *
   * Existe porque em 25/08 descobriu-se que `ia4_avaliacao` truncava em 19,9%
   * das chamadas com Sonnet 5 — e a ÚNICA forma de detectar era a coincidência
   * `output_tokens == teto`, que só funciona quando se sabe o teto e ele nunca
   * mudou. Sem este campo, "quais avaliações foram cortadas" é irrespondível
   * retroativamente, que foi exatamente o que aconteceu.
   */
  truncou?: boolean;
}

async function registrarUsoIA(
  provider: 'anthropic' | 'gemini' | 'openai' | 'kimi' | 'xai' | 'qwen' | 'meta',
  model: string,
  u: LedgerUsage | null,
  latencyMs: number,
  options: AICallOptions,
) {
  try {
    if (!u) return;
    // Mantém a linha grep-ável [ai-cache] quando há cache (contrato da 1ª instrumentação).
    const read = u.cacheRead || 0, write = u.cacheWrite || 0;
    if (read || write) {
      const base = read + write + u.inTokens;
      console.log(`[ai-cache] ${model} hit=${base ? Math.round((read / base) * 100) : 0}% read=${read} write=${write} fresh=${u.inTokens}`);
    }
    const ctx = contextoAtual();
    // O INSERT (e o aviso de falha) vivem em `lib/ia-ledger.ts` desde 29/08/2026,
    // porque o TTS também precisa gravar e duas cópias do mesmo registro divergem.
    // A MONTAGEM da linha continua aqui: o que o wrapper sabe (cache, truncagem,
    // origem do call-site) o TTS não sabe.
    const { gravarLinhaLedger } = await import('@/lib/ia-ledger');
    await gravarLinhaLedger({
      feature: options.taskKey || 'untagged',
      ...(options.correlationId ? { correlation_id: options.correlationId } : {}),
      empresa_id: options.empresaId ?? null,
      colaborador_id: options.colaboradorId ?? null,
      provider,
      model,
      input_tokens: u.inTokens,
      output_tokens: u.outTokens,
      cache_read_tokens: read || null,
      cache_write_tokens: write || null,
      cost_usd: costFromTokens(model, u),
      latency_ms: latencyMs,
      // `status` era a constante 'ok' — coluna que nunca variava. Agora carrega
      // a truncagem, sem precisar de migration.
      status: u.truncou ? 'truncado' : 'ok',
      source: options.source || 'wrapper',
      // Onde isto rodou e com quanto tempo disponível (mig 230). `source`
      // distingue batch de síncrono, não rota de Trigger — e os orçamentos
      // diferem por ordem de grandeza. Sem o denominador, "estamos perto do
      // timeout?" não é respondível pelo dado; foi assim que uma premissa
      // errada sobre `modulo_base_autor` sobreviveu por não ser contestável.
      // Declarado por quem sabe (`lib/execucao-contexto.ts`); quem não declara
      // fica 'desconhecido', que é cobertura faltando e não chute.
      runtime: ctx.runtime,
      orcamento_ms: ctx.orcamentoMs ?? null,
      // Só quando falta etiqueta (mig 231). `untagged` é 33% da produção e o
      // ledger respondia "quanto" sem responder "onde" — e a allowlist estática
      // dos 52 call-sites sem `taskKey` diz quais EXISTEM, não quais RODAM.
      // Custo: um `new Error().stack` na fração de chamadas que ainda não têm
      // etiqueta, e que encolhe conforme elas ganham uma.
      origem_codigo: options.taskKey ? null : (options._origemCodigo ?? null),
    });
    // Alerta na trilha quente: 80% do orçamento é onde a próxima chamada um
    // pouco mais longa vira timeout — e timeout, aqui, é trabalho pago e perdido.
    const fracao = fracaoDoOrcamento(latencyMs, ctx);
    if (fracao !== null && fracao >= 0.8) {
      console.warn(
        `[ia-ledger] ${options.taskKey || 'untagged'} consumiu ${Math.round(fracao * 100)}% do orçamento `
        + `(${Math.round(latencyMs / 1000)}s de ${Math.round((ctx.orcamentoMs || 0) / 1000)}s, ${ctx.onde || ctx.runtime}).`,
      );
    }
  } catch (e: any) {
    console.warn('[ia-ledger] falha ao registrar uso:', e?.message);
  }
}

export type OpenAIWebSearchSource = {
  title: string;
  url: string;
};

type OpenAIJsonSchemaFormat = {
  name: string;
  strict: boolean;
  schema: Record<string, unknown>;
};

/**
 * Busca pública com a Responses API da OpenAI.
 *
 * Vive no mesmo wrapper das demais gerações para que autenticação do provedor,
 * timeout e ledger de custo não nasçam num segundo caminho invisível. O caller
 * deve mandar apenas dados que podem ir para a internet; o copiloto, por
 * exemplo, envia nome/site públicos e mantém briefing/transcrição fora daqui.
 */
export async function callOpenAIWebSearch(
  prompt: string,
  format: OpenAIJsonSchemaFormat,
  options: AICallOptions & { model?: string; maxOutputTokens?: number } = {},
): Promise<{ text: string; sources: OpenAIWebSearchSource[] }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY não configurada');

  const model = options.model || process.env.OPENAI_WEB_SEARCH_MODEL || 'gpt-5.5';
  const startedAt = Date.now();
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      store: false,
      tools: [{ type: 'web_search' }],
      tool_choice: 'auto',
      include: ['web_search_call.action.sources'],
      input: prompt,
      max_output_tokens: options.maxOutputTokens || 12000,
      ...(options.reasoningEffort ? { reasoning: { effort: options.reasoningEffort } } : {}),
      text: { format: { type: 'json_schema', ...format } },
    }),
    signal: AbortSignal.timeout(options.timeoutMs ?? 180000),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`OpenAI Responses ${res.status}: ${detail.slice(0, 1200)}`);
  }

  const data: any = await res.json();
  const usage = data?.usage;
  const cachedInput = usage?.input_tokens_details?.cached_tokens || 0;
  await registrarUsoIA('openai', model, usage ? {
    inTokens: Math.max(0, (usage.input_tokens || 0) - cachedInput),
    outTokens: usage.output_tokens || 0,
    cacheRead: cachedInput,
    truncou: data?.status === 'incomplete',
  } : null, Date.now() - startedAt, {
    ...options,
    taskKey: options.taskKey || 'openai_web_search',
    source: options.source || 'responses-web-search',
  });

  const text = typeof data?.output_text === 'string'
    ? data.output_text
    : (data?.output || [])
        .filter((item: any) => item?.type === 'message')
        .flatMap((item: any) => item?.content || [])
        .map((part: any) => part?.text || part?.output_text || '')
        .filter(Boolean)
        .join('\n');

  const candidates: OpenAIWebSearchSource[] = [];
  for (const item of data?.output || []) {
    if (item?.type === 'web_search_call') {
      for (const source of item?.action?.sources || []) {
        candidates.push({ title: source?.title || source?.url || 'Fonte', url: source?.url || '' });
      }
    }
    if (item?.type === 'message') {
      for (const part of item?.content || []) {
        for (const annotation of part?.annotations || []) {
          if (annotation?.type === 'url_citation') {
            candidates.push({ title: annotation?.title || annotation?.url || 'Fonte', url: annotation?.url || '' });
          }
        }
      }
    }
  }

  const seen = new Set<string>();
  const sources = candidates.filter((source) => {
    try {
      const parsed = new URL(source.url);
      if (!['http:', 'https:'].includes(parsed.protocol) || seen.has(parsed.href)) return false;
      source.url = parsed.href;
      seen.add(parsed.href);
      return true;
    } catch {
      return false;
    }
  }).slice(0, 16);

  if (!text.trim()) throw new Error('A pesquisa não retornou conteúdo estruturado');
  return { text, sources };
}

// ── Thinking / effort por geração de modelo Claude ──────────────────────────
// A geração 5 (e Opus 4.7/4.8) REMOVEU `thinking:{type:'enabled',budget_tokens}`
// — mandar isso devolve 400 "not supported for this model. Use thinking.type.
// adaptive and output_config.effort". Medido em 07/08 tentando rodar opus-5 com
// thinking no comparativo de PDI. O 4.6 e anteriores continuam no formato antigo.
//
// ⚠️ Em Opus 5 o thinking é LIGADO POR PADRÃO (ao contrário do 4.8/4.7), e
// `max_tokens` limita thinking + texto JUNTOS: rota que nunca setou `thinking` e
// dimensionou max_tokens justo pode truncar no meio da resposta.
function ehClaudeAdaptativo(model: string): boolean {
  return /^claude-(opus-5|sonnet-5|fable-5|mythos-5|opus-4-7|opus-4-8)/.test(model);
}

/** Aplica thinking/effort no corpo da chamada Claude conforme a geração. */
function aplicarThinkingClaude(params: any, model: string, options: AICallOptions) {
  if (ehClaudeAdaptativo(model)) {
    // A geração 5 (e Opus 4.7/4.8) REMOVEU os parâmetros de sampling: mandar
    // `temperature` devolve 400 "`temperature` is deprecated for this model".
    // Medido em 24/08/2026 ao trocar o Modo Cena para opus-5 — a 1ª chamada
    // morreu no 400. Isto NÃO é problema de um caller: 16 arquivos passam
    // `temperature` hoje (arguicao, cenarios-b, conteudos, extrator de cargo…)
    // e a tela de modelos JÁ oferece opus-5 e sonnet-5. Qualquer um deles
    // quebraria no instante em que o operador escolhesse um modelo da geração 5.
    // Por isso o corte é aqui, na função, e não no chamador que descobriu.
    delete params.temperature;
    delete params.top_p;
    delete params.top_k;
    if (options.thinking) params.thinking = { type: 'adaptive' };
    // `effort` é GA nesses modelos e vive DENTRO de output_config.
    if (options.reasoningEffort) {
      params.output_config = { ...(params.output_config || {}), effort: options.reasoningEffort };
    }
    return;
  }
  if (options.thinking) {
    const budgetTokens = Math.min(options.thinkingBudget || 32768, 65536);
    params.thinking = { type: 'enabled', budget_tokens: budgetTokens };
    if (params.max_tokens < budgetTokens + 4096) {
      params.max_tokens = budgetTokens + 4096;
    }
  }
}

async function callClaude(
  system: string,
  user: string,
  model: string,
  maxTokens: number,
  options: AICallOptions = {},
): Promise<string> {
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    timeout: options.timeoutMs ?? AI_TIMEOUT_MS,
    maxRetries: options.maxRetries ?? 1,
  });

  // Com systemSuffix: 2 blocos — [estável cacheado] + [volátil sem cache]. O
  // prefixo estável (>1024 tok) é lido a 0,1× nas chamadas seguintes; o sufixo
  // (ex.: instrução do turno) não quebra o cache. Sem suffix: igual a antes.
  // `cacheSystem: false` desliga o write do system (ver AICallOptions): cachear
  // um prefixo que nunca repete é 1,25× por nada.
  const cacheDoSystem = options.cacheSystem !== false;
  const systemBlock: any = options.systemSuffix
    ? [
        { type: 'text', text: system, ...(cacheDoSystem ? { cache_control: { type: 'ephemeral' } } : {}) },
        { type: 'text', text: options.systemSuffix },
      ]
    : (cacheDoSystem && typeof system === 'string' && system.length > 4000
        ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
        : system);

  // 2º breakpoint: prefixo estável do user (régua/cenário) num bloco próprio com
  // cache_control quando vale a pena (> ~1024 tokens ≈ 4000 chars). Abaixo disso
  // o cache é no-op → só concatena (evita write inútil).
  const userContent: any = options.cachedUserPrefix && options.cachedUserPrefix.length > 4000
    ? [
        { type: 'text', text: options.cachedUserPrefix, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: user },
      ]
    : (options.cachedUserPrefix ? `${options.cachedUserPrefix}\n\n${user}` : user);

  const params: any = {
    model,
    max_tokens: maxTokens,
    system: systemBlock,
    messages: [{ role: 'user', content: userContent }],
    ...(options.temperature != null ? { temperature: options.temperature } : {}),
  };

  aplicarThinkingClaude(params, model, options);

  const t0 = Date.now();
  if (maxTokens > 8192) {
    let text = '';
    const uso: LedgerUsage = { inTokens: 0, outTokens: 0, cacheRead: 0, cacheWrite: 0 };
    // C1 (auditoria 22/08): o `timeout` do construtor limita o FETCH, e o fetch
    // de um stream resolve quando chegam os HEADERS — o corpo e consumido
    // depois, sem relogio nenhum. No ramo que gera as respostas CARAS
    // (maxTokens > 8192: blueprint, modulo-base, IA4) nao havia deadline.
    //
    // Medido em 24/08, 30 dias de ia_usage_log: tres features tem p95 ACIMA do
    // teto nominal de 120 s — modulo_base_autor 227 s, blueprint_gerar 164 s
    // (max 277 s), ia4_avaliacao 156 s — e registram 100% de sucesso. Se o
    // relogio valesse, elas falhariam; o proprio dado prova que ele nao valia.
    // E esse p95 e de SOBREVIVENTES: o log tem 3632 linhas 'ok' e nenhuma de
    // erro, porque a chamada que morre nao chega a registrar. O real e maior.
    const abortador = new AbortController();
    const relogio = setTimeout(() => abortador.abort(), options.timeoutMs ?? AI_TIMEOUT_MS);
    try {
      const stream = await client.messages.stream(params, { signal: abortador.signal });
      for await (const event of stream as any) {
        if (event.type === 'content_block_delta' && event.delta?.text) {
          text += event.delta.text;
        } else if (event.type === 'message_start' && event.message?.usage) {
          uso.inTokens = event.message.usage.input_tokens || 0;
          uso.cacheRead = event.message.usage.cache_read_input_tokens || 0;
          uso.cacheWrite = event.message.usage.cache_creation_input_tokens || 0;
        } else if (event.type === 'message_delta') {
          if (event.usage?.output_tokens != null) uso.outTokens = event.usage.output_tokens;
          // `max_tokens` aqui = resposta cortada no teto. No stream o sinal vem
          // no delta; sem lê-lo, truncagem só apareceria como coincidência.
          if (event.delta?.stop_reason === 'max_tokens') uso.truncou = true;
        }
      }
      await registrarUsoIA('anthropic', model, uso, Date.now() - t0, options);
      return text;
    } finally {
      clearTimeout(relogio);
    }
  }

  const response = await client.messages.create(params);
  const u = (response as any).usage;
  await registrarUsoIA('anthropic', model, u ? {
    inTokens: u.input_tokens || 0, outTokens: u.output_tokens || 0,
    cacheRead: u.cache_read_input_tokens || 0, cacheWrite: u.cache_creation_input_tokens || 0,
    truncou: (response as any).stop_reason === 'max_tokens',
  } : null, Date.now() - t0, options);
  // Sempre extrai o bloco de texto (não content[0]): modelos com adaptive
  // thinking por padrão (Sonnet 5, Opus 4.8+) devolvem `thinking` em content[0].
  return extractClaudeText(response.content as any[]);
}

async function callClaudeChat(
  system: string,
  messages: ChatMessage[],
  model: string,
  maxTokens: number,
  options: AICallOptions = {},
): Promise<string> {
  // C9: os overrides do chamador valiam em `callAI` e eram IGNORADOS aqui — quem
  // passava timeoutMs/maxRetries para uma conversa recebia o default sem aviso,
  // e a leitura do call-site dizia outra coisa.
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    timeout: options.timeoutMs ?? AI_TIMEOUT_MS,
    maxRetries: options.maxRetries ?? 1,
  });

  // HISTORY CACHING (S3, o lever medido como o maior): cacheia o prefixo
  // `system + histórico congelado`, lido a 0,1× nos turnos seguintes. O piloto
  // provou que o cache estava MORTO porque a parte VOLÁTIL (grounding + instrução
  // do turno) ficava DENTRO do prefixo cacheado e o envenenava. A correção:
  //  - a parte volátil vem em `options.userSuffix`;
  //  - com cacheHistory: migra p/ a cauda da ÚLTIMA mensagem do usuário, e o
  //    cache_control vai na ÚLTIMA mensagem ASSISTANT (congelada) → o prefixo não
  //    inclui o volátil e é lido a 0,1× no turno seguinte (validado por probe:
  //    turno 2 leu 2073 tok, turno 3 leu 2479);
  //  - sem cacheHistory: o userSuffix volta pro system (posição original) →
  //    saída BYTE-IDÊNTICA. É um behavior-change (posição system→mensagem), por
  //    isso atrás de flag no caller até validar qualidade (ia-sinais/goldens).
  const cacheHistory = options.cacheHistory === true;
  const sysText = options.userSuffix && !cacheHistory ? `${system}\n\n${options.userSuffix}` : system;

  // Bloco de system (com systemSuffix: 2 blocos estável/volátil — feature à parte).
  // `cacheSystem: false` vale aqui pelo mesmo motivo que em `callClaude`: opção
  // declarada no tipo e ignorada num dos dois ramos é config sem consumidor.
  const cacheDoSystem = options.cacheSystem !== false;
  const systemBlock: any = options.systemSuffix
    ? [
        { type: 'text', text: sysText, ...(cacheDoSystem ? { cache_control: { type: 'ephemeral' } } : {}) },
        { type: 'text', text: options.systemSuffix },
      ]
    : (cacheDoSystem && (cacheHistory || (typeof sysText === 'string' && sysText.length > 4000))
        ? [{ type: 'text', text: sysText, cache_control: { type: 'ephemeral' } }]
        : sysText);

  const legacyHistoryCache = process.env.CHAT_HISTORY_CACHE === '1';
  let msgs: any = messages;
  if (cacheHistory) {
    const arr = messages.map((m) => ({ role: m.role, content: m.content as any }));
    // sufixo volátil (grounding+instrução) na cauda da última mensagem do usuário
    if (options.userSuffix) {
      for (let i = arr.length - 1; i >= 0; i--) {
        if (arr[i].role === 'user') { arr[i] = { role: 'user', content: `${arr[i].content}\n\n${options.userSuffix}` }; break; }
      }
    }
    // cache_control na última mensagem ASSISTANT (prefixo congelado, sem o volátil)
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i].role === 'assistant') { arr[i] = { role: 'assistant', content: [{ type: 'text', text: arr[i].content, cache_control: { type: 'ephemeral' } }] }; break; }
    }
    msgs = arr;
  } else if (legacyHistoryCache && messages.length > 1) {
    msgs = messages.map((m, i) =>
      i === messages.length - 1
        ? { role: m.role, content: [{ type: 'text', text: m.content, cache_control: { type: 'ephemeral' } }] }
        : m,
    );
  }

  const params: any = {
    model,
    max_tokens: maxTokens,
    system: systemBlock,
    messages: msgs,
    ...(options.temperature != null ? { temperature: options.temperature } : {}),
  };

  aplicarThinkingClaude(params, model, options);

  const t0 = Date.now();
  if (maxTokens > 8192) {
    let text = '';
    const uso: LedgerUsage = { inTokens: 0, outTokens: 0, cacheRead: 0, cacheWrite: 0 };
    // C1 (auditoria 22/08): o `timeout` do construtor limita o FETCH, e o fetch
    // de um stream resolve quando chegam os HEADERS — o corpo e consumido
    // depois, sem relogio nenhum. No ramo que gera as respostas CARAS
    // (maxTokens > 8192: blueprint, modulo-base, IA4) nao havia deadline.
    //
    // Medido em 24/08, 30 dias de ia_usage_log: tres features tem p95 ACIMA do
    // teto nominal de 120 s — modulo_base_autor 227 s, blueprint_gerar 164 s
    // (max 277 s), ia4_avaliacao 156 s — e registram 100% de sucesso. Se o
    // relogio valesse, elas falhariam; o proprio dado prova que ele nao valia.
    // E esse p95 e de SOBREVIVENTES: o log tem 3632 linhas 'ok' e nenhuma de
    // erro, porque a chamada que morre nao chega a registrar. O real e maior.
    const abortador = new AbortController();
    const relogio = setTimeout(() => abortador.abort(), options.timeoutMs ?? AI_TIMEOUT_MS);
    try {
      const stream = await client.messages.stream(params, { signal: abortador.signal });
      for await (const event of stream as any) {
        if (event.type === 'content_block_delta' && event.delta?.text) {
          text += event.delta.text;
        } else if (event.type === 'message_start' && event.message?.usage) {
          uso.inTokens = event.message.usage.input_tokens || 0;
          uso.cacheRead = event.message.usage.cache_read_input_tokens || 0;
          uso.cacheWrite = event.message.usage.cache_creation_input_tokens || 0;
        } else if (event.type === 'message_delta' && event.usage?.output_tokens != null) {
          uso.outTokens = event.usage.output_tokens;
        }
      }
      await registrarUsoIA('anthropic', model, uso, Date.now() - t0, options);
      return text;
    } finally {
      clearTimeout(relogio);
    }
  }

  const response = await client.messages.create(params);
  const u = (response as any).usage;
  await registrarUsoIA('anthropic', model, u ? {
    inTokens: u.input_tokens || 0, outTokens: u.output_tokens || 0,
    cacheRead: u.cache_read_input_tokens || 0, cacheWrite: u.cache_creation_input_tokens || 0,
    truncou: (response as any).stop_reason === 'max_tokens',
  } : null, Date.now() - t0, options);
  // Sempre extrai o bloco de texto (não content[0]): modelos com adaptive
  // thinking por padrão (Sonnet 5, Opus 4.8+) devolvem um bloco `thinking` em
  // content[0], sem `.text` → content[0].text seria undefined.
  return extractClaudeText(response.content as any[]);
}

// ── Gemini (Google AI REST) ─────────────────────────────────────────────────

async function callGemini(
  system: string,
  user: string,
  model: string,
  maxTokens: number,
  options: AICallOptions = {},
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');
  const t0 = Date.now();

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { maxOutputTokens: maxTokens },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(options.timeoutMs ?? AI_TIMEOUT_MS),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Gemini ${res.status}: ${detail}`);
  }

  const data = await res.json();
  const um = data.usageMetadata;
  await registrarUsoIA('gemini', model, um ? {
    inTokens: (um.promptTokenCount || 0) - (um.cachedContentTokenCount || 0),
    outTokens: um.candidatesTokenCount || 0,
    cacheRead: um.cachedContentTokenCount || 0,
    truncou: data?.candidates?.[0]?.finishReason === 'MAX_TOKENS',
  } : null, Date.now() - t0, options);
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// ── OpenAI (REST) ───────────────────────────────────────────────────────────

/**
 * Provedores OpenAI-compatible: mesmo protocolo `/chat/completions`, base e
 * chave próprias. Kimi (Moonshot), Grok (xAI), Qwen (Alibaba) e Muse Spark
 * (Meta) entram por aqui.
 *
 * A lista MUDOU DE ARQUIVO em 25/08/2026 → `lib/ai-provedores.ts`. Ela vivia
 * aqui porque a resolução estava DUPLICADA em `callOpenAI` e `callOpenAIChat`
 * (quatro ternários `isKimi` entre os dois) — o padrão dos gêmeos que divergem.
 * Só que a MESMA pergunta ("este id tem rota?") também era feita pelos dois
 * `dispatch`, com a lista de prefixos escrita à mão em cada um, e pelo guard de
 * `MODELOS_DISPONIVEIS` na suíte: quatro cópias. Como o último caso do dispatch
 * é `return callClaude(...)`, quem somasse um provedor em menos de quatro
 * lugares tinha o modelo indo para a Anthropic com um id que ela não conhece —
 * e falhando etiquetado como Anthropic no Sentry, que parece queda de provedor.
 *
 * Agora `ehOpenAICompat` deriva da constante, e os dois dispatch, o
 * `resolverProvedorCompat` e o guard leem todos daquele módulo.
 */

/**
 * `provider` sai daqui junto com a chave de propósito: ele vira
 * `ia_usage_log.provider`. Resolvido em separado, um provedor novo entraria no
 * ledger como 'openai' — e o painel de custo passaria a somar xAI dentro da
 * OpenAI, sem nada acusando.
 */
type ProvedorCompat = 'openai' | 'kimi' | 'xai' | 'qwen' | 'meta';
function resolverProvedorCompat(model: string): { apiKey: string; url: string; provider: ProvedorCompat } {
  const p = PROVEDORES_OPENAI_COMPAT.find((x) => model.startsWith(x.prefixo));
  const env = p?.env ?? 'OPENAI_API_KEY';
  const apiKey = process.env[env];
  // Mensagem explícita porque este é o modo de falha que sobra depois que o
  // modelo entra em MODELOS_DISPONIVEIS: a suíte garante preço e rota, mas roda
  // em node e NÃO enxerga o ambiente de destino. Um modelo selecionável cuja
  // chave não subiu para a Vercel só quebra quando um admin o escolhe — e
  // `${env} not set`, sozinho, não dizia nem qual modelo nem qual o conserto.
  if (!apiKey) {
    throw new Error(
      `${env} não está definida — o modelo "${model}" está selecionável mas não tem chave neste ambiente. `
      + 'Confira `vercel env ls production`; se faltar, `printf \'%s\' "$CHAVE" | vercel env add ' + env + ' production` '
      + '(printf sem pipe de echo, que injeta \\n) e REDEPLOY, porque variável nova só vale em deploy novo.',
    );
  }
  return {
    apiKey,
    url: p?.url ?? 'https://api.openai.com/v1/chat/completions',
    provider: p?.provider ?? 'openai',
  };
}

async function callOpenAI(
  system: string,
  user: string,
  model: string,
  maxTokens: number,
  options: AICallOptions = {},
): Promise<string> {
  const { apiKey, url, provider } = resolverProvedorCompat(model);
  const t0 = Date.now();

  // `usaMaxCompletionTokens` vive em lib/ai-provedores porque a mesma pergunta
  // era feita nos DOIS gêmeos (callOpenAI e callOpenAIChat) — o padrão que este
  // arquivo já documenta como "quem adicionasse só num deles teria o modelo
  // funcionando em callAI e falhando em callAIChat". Medido em 25/08: o Qwen
  // ignora `max_tokens` e rodava sem teto efetivo.
  const body: any = {
    model,
    ...(usaMaxCompletionTokens(model) ? { max_completion_tokens: maxTokens } : { max_tokens: maxTokens }),
    ...(options.reasoningEffort ? { reasoning_effort: options.reasoningEffort } : {}),
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(options.timeoutMs ?? AI_TIMEOUT_MS),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`OpenAI ${res.status}: ${detail}`);
  }

  const data = await res.json();
  const uo = data.usage;
  const cachedIn = uo?.prompt_tokens_details?.cached_tokens || 0;
  await registrarUsoIA(provider, model, uo ? {
    inTokens: (uo.prompt_tokens || 0) - cachedIn,
    outTokens: uo.completion_tokens || 0,
    cacheRead: cachedIn,
    truncou: data.choices?.[0]?.finish_reason === 'length',
  } : null, Date.now() - t0, options);
  return conteudoOuFalhaAlto(data, model);
}

// ── Multi-turn variants ────────────────────────────────────────────────────

async function callGeminiChat(
  system: string,
  messages: ChatMessage[],
  model: string,
  maxTokens: number,
  options: AICallOptions = {},
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');
  const t0 = Date.now();

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents,
    generationConfig: { maxOutputTokens: maxTokens },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(options.timeoutMs ?? AI_TIMEOUT_MS),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Gemini ${res.status}: ${detail}`);
  }

  const data = await res.json();
  const um = data.usageMetadata;
  await registrarUsoIA('gemini', model, um ? {
    inTokens: (um.promptTokenCount || 0) - (um.cachedContentTokenCount || 0),
    outTokens: um.candidatesTokenCount || 0,
    cacheRead: um.cachedContentTokenCount || 0,
    truncou: data?.candidates?.[0]?.finishReason === 'MAX_TOKENS',
  } : null, Date.now() - t0, options);
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function callOpenAIChat(
  system: string,
  messages: ChatMessage[],
  model: string,
  maxTokens: number,
  options: AICallOptions = {},
): Promise<string> {
  const { apiKey, url, provider } = resolverProvedorCompat(model);
  const t0 = Date.now();

  // `usaMaxCompletionTokens` vive em lib/ai-provedores porque a mesma pergunta
  // era feita nos DOIS gêmeos (callOpenAI e callOpenAIChat) — o padrão que este
  // arquivo já documenta como "quem adicionasse só num deles teria o modelo
  // funcionando em callAI e falhando em callAIChat". Medido em 25/08: o Qwen
  // ignora `max_tokens` e rodava sem teto efetivo.
  const body: any = {
    model,
    ...(usaMaxCompletionTokens(model) ? { max_completion_tokens: maxTokens } : { max_tokens: maxTokens }),
    ...(options.reasoningEffort ? { reasoning_effort: options.reasoningEffort } : {}),
    messages: [{ role: 'system', content: system }, ...messages],
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(options.timeoutMs ?? AI_TIMEOUT_MS),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`OpenAI ${res.status}: ${detail}`);
  }

  const data = await res.json();
  const uo = data.usage;
  const cachedIn = uo?.prompt_tokens_details?.cached_tokens || 0;
  await registrarUsoIA(provider, model, uo ? {
    inTokens: (uo.prompt_tokens || 0) - cachedIn,
    outTokens: uo.completion_tokens || 0,
    cacheRead: cachedIn,
    truncou: data.choices?.[0]?.finish_reason === 'length',
  } : null, Date.now() - t0, options);
  return conteudoOuFalhaAlto(data, model);
}
