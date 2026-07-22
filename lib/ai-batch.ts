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
import { costFromTokens } from '@/lib/ia-cost-catalog';

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

function anthropicClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: AI_TIMEOUT_MS, maxRetries: 2 });
}

/**
 * Cria o batch e devolve só o `id`. Não faz polling — é a metade "submeter" do
 * padrão DESTACADO: quem chama guarda o id, encerra o trabalho ativo e volta a
 * consultar depois (com `wait.for` numa task, ou noutra invocação). Assim um
 * batch lento não segura a run aberta nem consome `maxDuration`.
 */
export async function createClaudeBatch(reqs: BatchReq[], opts: { locale?: AppLocale } = {}): Promise<string> {
  const locale = opts.locale || defaultLocale;
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
  const created = await anthropicClient().messages.batches.create({ requests: requests as any });
  return created.id;
}

export interface BatchStatus {
  ended: boolean;
  counts: { processing: number; succeeded: number; errored: number; canceled: number; expired: number };
}

/** Uma consulta ao estado do batch. `counts` revela congestão (succeeded parado em 0). */
export async function pollClaudeBatch(batchId: string): Promise<BatchStatus> {
  const s = await anthropicClient().messages.batches.retrieve(batchId);
  const c: any = s.request_counts || {};
  return {
    ended: s.processing_status === 'ended',
    counts: {
      processing: c.processing ?? 0, succeeded: c.succeeded ?? 0,
      errored: c.errored ?? 0, canceled: c.canceled ?? 0, expired: c.expired ?? 0,
    },
  };
}

/**
 * Colhe os textos de um batch já `ended`, por customId. Registra o usage REAL
 * de cada item no ledger (ia_usage_log, source='batch', custo já com −50% do
 * batch) — o batch não passa pelo wrapper callAI, então o log é aqui.
 * `feature` etiqueta a fase (ex.: 'modulo_base_autor'); default 'batch'.
 */
export async function fetchClaudeBatchResults(
  batchId: string,
  ledger: { feature?: string; empresaId?: string | null } = {},
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const linhas: any[] = [];
  for await (const entry of await anthropicClient().messages.batches.results(batchId)) {
    if (entry.result?.type === 'succeeded') {
      const msg = entry.result.message as any;
      const content = (msg?.content || []) as any[];
      out.set(entry.custom_id, content.find((b) => b.type === 'text')?.text || '');
      const u = msg?.usage;
      if (u) {
        const inTok = u.input_tokens || 0, outTok = u.output_tokens || 0;
        const cr = u.cache_read_input_tokens || 0, cw = u.cache_creation_input_tokens || 0;
        linhas.push({
          feature: ledger.feature || 'batch',
          empresa_id: ledger.empresaId ?? null,
          provider: 'anthropic',
          model: msg?.model || null,
          input_tokens: inTok, output_tokens: outTok,
          cache_read_tokens: cr || null, cache_write_tokens: cw || null,
          cost_usd: msg?.model
            ? costFromTokens(msg.model, { inTokens: inTok, outTokens: outTok, cacheRead: cr, cacheWrite: cw }, { batch: true })
            : null,
          status: 'ok', source: 'batch',
        });
      }
    }
  }
  if (linhas.length) {
    try {
      const { createSupabaseAdmin } = await import('@/lib/supabase');
      await createSupabaseAdmin().from('ia_usage_log').insert(linhas);
    } catch (e: any) {
      console.warn('[ia-ledger] falha ao registrar batch:', e?.message);
    }
  }
  return out;
}

/**
 * Submete N requests como UM batch Claude, faz polling INLINE até terminar e
 * devolve o texto por customId. Lança se estourar o orçamento de tempo.
 *
 * ⚠️ Segura a run aberta durante o polling — logo CONSOME o `maxDuration` da task.
 * Bom para batches pequenos/rápidos (IA2, kit). Para lotes que podem demorar (e
 * sob congestão da Batch API), prefira o padrão DESTACADO acima
 * (`createClaudeBatch` + `wait.for` + `pollClaudeBatch`).
 */
export async function submitClaudeBatch(
  reqs: BatchReq[],
  opts: { pollMs?: number; budgetMs?: number; locale?: AppLocale } = {},
): Promise<Map<string, string>> {
  const batchId = await createClaudeBatch(reqs, { locale: opts.locale });
  const budgetMs = opts.budgetMs ?? 40 * 60_000;
  const pollMs = opts.pollMs ?? 5000;
  const deadline = Date.now() + budgetMs;

  for (;;) {
    const { ended } = await pollClaudeBatch(batchId);
    if (ended) break;
    if (Date.now() > deadline) throw new Error(`batch ${batchId} excedeu ${Math.round(budgetMs / 60000)}min`);
    await sleep(pollMs);
  }
  return fetchClaudeBatchResults(batchId);
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

// ── OpenAI Batch API (−50%) ─────────────────────────────────────────────────
// Mesmo contrato do submitClaudeBatch, para modelos OpenAI (gpt-*): JSONL →
// /v1/files → /v1/batches → polling → download dos resultados por customId.
// Usado pelos CHECKS duais em lote (auditor GPT 5.6 Terra) — o gerador Claude
// batcha pelo caminho Anthropic acima.

const OPENAI_BASE = 'https://api.openai.com/v1';

function openaiHeaders(): Record<string, string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not set');
  return { Authorization: `Bearer ${key}` };
}

/** Sobe o JSONL e cria o batch; devolve o id (metade "submeter" do padrão destacado). */
export async function createOpenAIBatch(reqs: BatchReq[], opts: { locale?: AppLocale } = {}): Promise<string> {
  const locale = opts.locale || defaultLocale;
  const jsonl = reqs.map((r) => JSON.stringify({
    custom_id: r.customId,
    method: 'POST',
    url: '/v1/chat/completions',
    body: {
      model: r.model,
      // gpt-5.x (reasoning) exige max_completion_tokens; margem p/ o thinking.
      max_completion_tokens: r.maxTokens,
      messages: [
        { role: 'system', content: withLanguageInstruction(r.system, locale) },
        { role: 'user', content: r.user },
      ],
    },
  })).join('\n');

  const fd = new FormData();
  fd.append('purpose', 'batch');
  fd.append('file', new Blob([jsonl], { type: 'application/jsonl' }), 'batch.jsonl');
  const upRes = await fetch(`${OPENAI_BASE}/files`, { method: 'POST', headers: openaiHeaders(), body: fd });
  if (!upRes.ok) throw new Error(`OpenAI files upload ${upRes.status}: ${(await upRes.text()).slice(0, 300)}`);
  const file = await upRes.json();

  const bRes = await fetch(`${OPENAI_BASE}/batches`, {
    method: 'POST',
    headers: { ...openaiHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ input_file_id: file.id, endpoint: '/v1/chat/completions', completion_window: '24h' }),
  });
  if (!bRes.ok) throw new Error(`OpenAI batch create ${bRes.status}: ${(await bRes.text()).slice(0, 300)}`);
  const batch = await bRes.json();
  return batch.id;
}

/** Uma consulta ao estado do batch OpenAI. */
export async function pollOpenAIBatch(batchId: string): Promise<{ ended: boolean; status: string; outputFileId: string | null; errorFileId: string | null }> {
  const res = await fetch(`${OPENAI_BASE}/batches/${batchId}`, { headers: openaiHeaders() });
  if (!res.ok) throw new Error(`OpenAI batch retrieve ${res.status}`);
  const b = await res.json();
  const ended = ['completed', 'failed', 'expired', 'cancelled'].includes(b.status);
  return { ended, status: b.status, outputFileId: b.output_file_id || null, errorFileId: b.error_file_id || null };
}

/** Colhe os textos por customId + registra o usage no ledger (source='batch', −50%). */
export async function fetchOpenAIBatchResults(
  outputFileId: string,
  ledger: { feature?: string; empresaId?: string | null } = {},
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const res = await fetch(`${OPENAI_BASE}/files/${outputFileId}/content`, { headers: openaiHeaders() });
  if (!res.ok) throw new Error(`OpenAI batch results ${res.status}`);
  const linhasLedger: any[] = [];
  for (const line of (await res.text()).split('\n')) {
    if (!line.trim()) continue;
    let entry: any;
    try { entry = JSON.parse(line); } catch { continue; }
    const body = entry?.response?.body;
    if (entry?.response?.status_code !== 200 || !body) continue;
    out.set(entry.custom_id, body.choices?.[0]?.message?.content || '');
    const u = body.usage;
    if (u) {
      const inTok = u.prompt_tokens || 0, outTok = u.completion_tokens || 0;
      linhasLedger.push({
        feature: ledger.feature || 'batch',
        empresa_id: ledger.empresaId ?? null,
        provider: 'openai',
        model: body.model || null,
        input_tokens: inTok, output_tokens: outTok,
        cost_usd: body.model ? costFromTokens(body.model, { inTokens: inTok, outTokens: outTok }, { batch: true }) : null,
        status: 'ok', source: 'batch',
      });
    }
  }
  if (linhasLedger.length) {
    try {
      const { createSupabaseAdmin } = await import('@/lib/supabase');
      await createSupabaseAdmin().from('ia_usage_log').insert(linhasLedger);
    } catch (e: any) {
      console.warn('[ia-ledger] falha ao registrar batch openai:', e?.message);
    }
  }
  return out;
}

/**
 * Submete N requests como UM batch OpenAI, polling inline até terminar.
 * Mesmos avisos do submitClaudeBatch (segura a run; bom p/ lotes pequenos).
 */
export async function submitOpenAIBatch(
  reqs: BatchReq[],
  opts: { pollMs?: number; budgetMs?: number; locale?: AppLocale; ledger?: { feature?: string; empresaId?: string | null } } = {},
): Promise<Map<string, string>> {
  const batchId = await createOpenAIBatch(reqs, { locale: opts.locale });
  const budgetMs = opts.budgetMs ?? 40 * 60_000;
  const pollMs = opts.pollMs ?? 10_000;
  const deadline = Date.now() + budgetMs;

  for (;;) {
    const st = await pollOpenAIBatch(batchId);
    if (st.ended) {
      if (st.status !== 'completed') throw new Error(`OpenAI batch ${batchId} terminou como ${st.status}`);
      if (!st.outputFileId) throw new Error(`OpenAI batch ${batchId} sem output_file_id`);
      return fetchOpenAIBatchResults(st.outputFileId, opts.ledger || {});
    }
    if (Date.now() > deadline) throw new Error(`OpenAI batch ${batchId} excedeu ${Math.round(budgetMs / 60000)}min`);
    await sleep(pollMs);
  }
}
