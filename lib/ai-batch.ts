/**
 * Batch API da Anthropic (−50% no custo) para geração em LOTE — usado pelo Kit
 * Semanal (4 DISC × formatos saem numa tacada só). É ASSÍNCRONO: submete o batch,
 * faz polling até `ended`, distribui os resultados. Resiliente: qualquer falha
 * (batch indisponível, request errado, modelo não-Claude, timeout) cai no
 * `callAI` SÍNCRONO por request — nunca perde conteúdo. Ver docs/KIT-SEMANAL.md.
 *
 * Não é 'use server' de propósito: exporta a FÁBRICA do collector (objeto), que
 * não é uma server action. Usa `callAI` (server action) só como fallback.
 */
import Anthropic from '@anthropic-ai/sdk';
import { AppLocale, defaultLocale } from '@/i18n/routing';
import { localeLanguageName } from '@/lib/i18n';
import { callAI } from '@/actions/ai-client';

const AI_TIMEOUT_MS = 120000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Espelha o withLanguageInstruction do ai-client (mantém o conteúdo batcheado
// idêntico ao do caminho síncrono). Batch do kit roda sem cookies → pt-BR default.
function withLanguageInstruction(system: string, locale: AppLocale): string {
  const language = localeLanguageName(locale);
  return `${system}

═══ IDIOMA DA EXPERIÊNCIA ═══
Use ${language} em todo texto destinado ao usuário final.
Mantenha nomes de campos JSON, enums técnicos, códigos e identificadores exatamente como especificados no prompt.
Se o prompt exigir JSON, retorne JSON válido e traduza apenas os valores textuais voltados ao usuário.`;
}

export interface BatchReq {
  customId: string;
  system: string;
  user: string;
  model: string;
  maxTokens: number;
}

/**
 * Submete N requests como UM batch Claude, faz polling até terminar e devolve o
 * texto por customId. Lança se estourar o orçamento de tempo (→ fallback síncrono).
 */
export async function submitClaudeBatch(
  reqs: BatchReq[],
  opts: { pollMs?: number; budgetMs?: number; locale?: AppLocale } = {},
): Promise<Map<string, string>> {
  const locale = opts.locale || defaultLocale;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: AI_TIMEOUT_MS, maxRetries: 2 });

  const requests = reqs.map((r) => {
    const system = withLanguageInstruction(r.system, locale);
    const systemBlock: any = system.length > 4000
      ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
      : system;
    return {
      custom_id: r.customId,
      params: { model: r.model, max_tokens: r.maxTokens, system: systemBlock, messages: [{ role: 'user', content: r.user }] },
    };
  });

  const created = await client.messages.batches.create({ requests: requests as any });
  const budgetMs = opts.budgetMs ?? 40 * 60_000; // 40 min — abaixo do maxDuration 1h do job
  const pollMs = opts.pollMs ?? 5000;
  const deadline = Date.now() + budgetMs;

  let status = created;
  while (status.processing_status !== 'ended') {
    if (Date.now() > deadline) throw new Error(`batch ${created.id} excedeu ${Math.round(budgetMs / 60000)}min`);
    await sleep(pollMs);
    status = await client.messages.batches.retrieve(created.id);
  }

  const out = new Map<string, string>();
  for await (const entry of await client.messages.batches.results(created.id)) {
    if (entry.result?.type === 'succeeded') {
      const content = (entry.result.message?.content || []) as any[];
      const text = content.find((b) => b.type === 'text')?.text || '';
      out.set(entry.custom_id, text);
    }
  }
  return out;
}

/** Assinatura compatível com callAI (primeiros 4 args) — drop-in como `aiRun`. */
export type AIRun = (system: string, user: string, aiConfig: any, maxTokens: number) => Promise<string>;

interface Pending extends BatchReq { resolve: (s: string) => void; reject: (e: any) => void; }

/**
 * Collector debounced (estilo DataLoader): acumula chamadas concorrentes e, após
 * uma janela de silêncio, manda tudo num batch. Suporta múltiplas RODADAS
 * automaticamente (desafios → flush → formatos → flush) porque cada rodada só é
 * enfileirada depois que a anterior resolve. Devolve `run` com a cara do callAI.
 */
export function createAIBatchCollector(
  defaultModel: string,
  opts: { windowMs?: number; budgetMs?: number; locale?: AppLocale } = {},
): { run: AIRun } {
  let queue: Pending[] = [];
  let timer: any = null;
  let seq = 0;

  function syncFallback(p: { system: string; user: string; model: string; maxTokens: number }): Promise<string> {
    return callAI(p.system, p.user, { model: p.model }, p.maxTokens);
  }

  async function doFlush(batch: Pending[]) {
    try {
      const results = await submitClaudeBatch(batch, { budgetMs: opts.budgetMs, locale: opts.locale });
      for (const p of batch) {
        const text = results.get(p.customId);
        if (text != null && text.trim()) p.resolve(text);
        else syncFallback(p).then(p.resolve, p.reject); // request sem resultado → síncrono
      }
    } catch (e) {
      console.warn(`[ai-batch] batch falhou (${(e as any)?.message}) — fallback síncrono p/ ${batch.length} request(s)`);
      for (const p of batch) syncFallback(p).then(p.resolve, p.reject);
    }
  }

  function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const batch = queue;
      queue = [];
      timer = null;
      void doFlush(batch);
    }, opts.windowMs ?? 200);
  }

  const run: AIRun = (system, user, aiConfig, maxTokens) => {
    const model = aiConfig?.model || defaultModel;
    // Modelo não-Claude (override por-tarefa da empresa) → síncrono, preserva o provedor.
    if (!String(model).startsWith('claude')) return callAI(system, user, aiConfig, maxTokens);
    return new Promise<string>((resolve, reject) => {
      queue.push({ customId: `r${seq++}`, system, user, model, maxTokens, resolve, reject });
      schedule();
    });
  };

  return { run };
}
