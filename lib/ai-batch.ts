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
import { withLanguageInstruction } from '@/lib/ai-language';
import { callAI } from '@/actions/ai-client';
import { costFromTokens } from '@/lib/ia-cost-catalog';
import { IA_BATCH, type IaBatchStatus } from '@/lib/status';

const AI_TIMEOUT_MS = 120000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface BatchReq {
  customId: string;
  system: string;
  user: string;
  model: string;
  maxTokens: number;
  /**
   * Espelha `AICallOptions.cacheSystem` (default: liga acima de 4.000 chars).
   * Precisa existir aqui porque o lote é o caminho DEFAULT da geração de
   * conteúdo: honrar a opção só no síncrono seria consertar o gêmeo que não
   * roda — a mesma forma do F-I14.
   */
  cacheSystem?: boolean;
  /**
   * Idioma DESTA request (Onda E, 04/10/2026). Vence o `opts.locale` do lote, que
   * vale para todos, e este vence o padrão (pt-BR). Existe porque um lote de PDI ou
   * de blueprint junta pessoas de idiomas diferentes: o idioma é o de quem LÊ cada
   * documento, e um valor único por lote só serve a quem fala o idioma dele. Sem o
   * campo, honrar `locale` só no síncrono seria consertar o gêmeo que não roda.
   */
  locale?: AppLocale;
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
export async function createClaudeBatch(
  reqs: BatchReq[],
  opts: { locale?: AppLocale; ledger?: { feature?: string; empresaId?: string | null; jobId?: string | null } } = {},
): Promise<string> {
  const locale = opts.locale || defaultLocale;
  const requests = reqs.map((r) => {
    const system = withLanguageInstruction(r.system, r.locale || locale);
    const systemBlock: any = r.cacheSystem !== false && system.length > 4000
      ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
      : system;
    return {
      custom_id: r.customId,
      params: { model: r.model, max_tokens: r.maxTokens, system: systemBlock, messages: [{ role: 'user', content: r.user }] },
    };
  });
  const created = await anthropicClient().messages.batches.create({ requests: requests as any });
  await registrarBatch(created.id, reqs.length, opts.ledger);
  return created.id;
}

/**
 * Grava o `batch_id` FORA da memória do processo, no instante da submissão.
 *
 * Achado do gate de 10/08/2026: o id só existia numa variável local durante o
 * polling. Lambda morrendo, deploy trocando ou timeout e o batch **segue rodando
 * na Anthropic** — pago, concluído, e sem ninguém com o id para buscar o
 * resultado. O trabalho some sem deixar linha, porque a persistência do
 * resultado vem depois.
 *
 * Best-effort de propósito: se o rastro falhar, a geração continua. Um batch sem
 * rastro é ruim; um batch que não roda porque o rastro falhou é pior.
 */
/**
 * Client de INFRA deste módulo: ledger de custo (`ia_usage_log`) e rastro de
 * batch (`ia_batches`). Nenhuma das duas é dado de tenant — `empresa_id` ali é
 * etiqueta de atribuição, não escopo de acesso —, então elas não passam por
 * `tenantDb`. Em UM lugar de propósito: o `service-role-guard` conta ocorrências
 * de `createSupabaseAdmin` por arquivo, e quatro chamadas espalhadas fariam a
 * allowlist crescer para registrar a mesma decisão quatro vezes.
 */
async function sbInfra() {
  const { createSupabaseAdmin } = await import('@/lib/supabase');
  return createSupabaseAdmin();
}

export async function registrarBatch(batchId: string, itens: number, ledger?: { feature?: string; empresaId?: string | null; jobId?: string | null }) {
  try {
    const { error } = await (await sbInfra()).from('ia_batches').insert({
      batch_id: batchId,
      itens,
      feature: ledger?.feature ?? null,
      empresa_id: ledger?.empresaId ?? null,
      // C3: sem isto, um lote pago cujo id não chegou a ser gravado em
      // `ia_jobs.params` fica sem dono — e a execução seguinte cria outro.
      job_id: ledger?.jobId ?? null,
    });
    if (error) console.warn('[ia-batch] rastro não gravado:', error.message);
  } catch (e: any) {
    console.warn('[ia-batch] rastro não gravado:', e?.message);
  }
}

/**
 * Fecha o rastro de um batch. Best-effort — ver `registrarBatch`.
 *
 * 🔴 C2 (auditoria 22/08): era PRIVADA, e só `submitClaudeBatch` a chamava.
 * Quem usa o padrão DESTACADO — submeter agora, colher depois, que é o que o
 * docstring deste módulo recomenda para lote lento — não tinha como fechar o
 * rastro. `Medido em 24/08:` das 8 linhas de `ia_batches`, **6 estavam em
 * 'submetido' para sempre**; consultadas em `GET /v1/messages/batches`, as seis
 * tinham TERMINADO com 100% de sucesso (54 itens, zero erro).
 *
 * O efeito não é cosmético: `scripts/_batches-orfaos.mjs` existe para achar
 * batch pago e não colhido, e com esse rastro ele era 100% falso positivo — um
 * alarme que cresce um por lote e que ninguém pode levar a sério.
 */
export async function encerrarBatch(batchId: string, status: IaBatchStatus, erro?: string) {
  try {
    const { error } = await (await sbInfra()).from('ia_batches')
      .update({ status, erro: erro?.slice(0, 500) ?? null, concluido_em: new Date().toISOString() })
      .eq('batch_id', batchId);
    // O `{ error }` do supabase-js não lança, então o `catch` abaixo nunca o
    // via: falhar em FECHAR o rastro produzia exatamente o estado que o C2
    // existe para eliminar — linha eternamente 'submetido' —, e em silêncio.
    // Continua best-effort (não lança), mas agora deixa vestígio.
    if (error) console.warn(`[ia-batch] rastro de ${batchId} não fechado:`, error.message);
  } catch (e: any) {
    console.warn(`[ia-batch] rastro de ${batchId} não fechado:`, e?.message);
  }
}

/**
 * Recupera o lote PAGO de um job cujo `params.batchId` não chegou a ser gravado.
 *
 * É a segunda fonte da retomada, e existe por causa da janela entre criar o
 * batch e persistir o id: se a run morre ali, `ia_jobs.params` não tem o id, mas
 * `ia_batches` TEM a linha — gravada no instante da criação, com `job_id` desde
 * a mig 225.
 *
 * 🔑 Eu havia documentado essa janela como "sem conserto por código nosso",
 * porque a Batch API da Anthropic não expõe chave de idempotência na criação.
 * Isso é verdade sobre a API e irrelevante para o problema: quem precisa lembrar
 * do lote é o NOSSO rastro, não o fornecedor.
 *
 * Devolve o mais RECENTE em 'submetido' **ou 'concluido'**. Nunca lança: se a
 * consulta falhar, o pior caso é o comportamento antigo (criar outro lote), e
 * derrubar a task por causa de uma tentativa de recuperação seria trocar um
 * custo por um pior.
 *
 * 🔴 **Por que 'concluido' também entra** (achado de revisão, 24/08). A ordem
 * real das tasks é: colher o lote → `encerrarBatch(CONCLUIDO)` → **só então**
 * persistir item a item. Filtrar apenas 'submetido' deixava aberta exatamente a
 * janela que esta função existe para fechar:
 *
 *   1. o `patch` do `batchId` falha (a janela original);
 *   2. a run segue com o id em memória, colhe e fecha o rastro como 'concluido';
 *   3. a run morre antes de persistir os itens;
 *   4. a retomada não acha `params.batchId` **nem** o rastro — e paga outro lote.
 *
 * Recolher um batch já concluído é GRÁTIS (a Anthropic guarda os resultados por
 * 29 dias) e idempotente: os itens já persistidos estão na chave por item, e o
 * `fetch` só repõe o que falta. O risco de pegar um lote de outra rodada não
 * existe — cada disparo cria um `ia_jobs` novo, então `job_id` é único por rodada.
 *
 * ⚠️ `feature` NÃO é opcional por capricho: IA3 e IA4 submetem DUAS ondas no
 * mesmo job (geração e check). Sem o filtro, a retomada da geração poderia
 * receber o lote do CHECK — e colher respostas de check achando que são
 * cenários é pior que criar um lote a mais.
 */
export async function batchPendenteDoJob(jobId: string, feature: string): Promise<string | null> {
  try {
    const { data, error } = await (await sbInfra()).from('ia_batches')
      .select('batch_id')
      .eq('job_id', jobId)
      .eq('feature', feature)
      .in('status', [IA_BATCH.SUBMETIDO, IA_BATCH.CONCLUIDO])
      .order('criado_em', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.warn(`[ia-batch] recuperação por job ${jobId} falhou: ${error.message}`);
      return null;
    }
    return (data as any)?.batch_id ?? null;
  } catch (e: any) {
    console.warn(`[ia-batch] recuperação por job ${jobId} falhou: ${e?.message}`);
    return null;
  }
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
      await (await sbInfra()).from('ia_usage_log').insert(linhas);
    } catch (e: any) {
      console.warn('[ia-ledger] falha ao registrar batch:', e?.message);
    }
  }
  return out;
}

/**
 * Por quanto tempo consultas SEGUIDAS podem falhar antes de desistir do lote.
 *
 * `Medido em 30/09/2026`: uma única consulta que falhou (o computador acordou da
 * suspensão e o DNS ainda não resolvia o host da API) fazia o collector
 * abandonar o lote e mandar tudo ao síncrono, com o lote seguindo na Anthropic
 * para ser cobrado também: o mesmo item pago duas vezes. Falha de consulta é quase
 * sempre de rede, e o lote não se perde por ela.
 */
export const TOLERANCIA_FALHA_CONSULTA_MS = 2 * 60_000;

/** `pollClaudeBatch` que aguenta falhas seguidas por até `toleranciaMs`, com espera crescente. */
async function consultarComTolerancia(batchId: string, pollMs: number, toleranciaMs: number): Promise<BatchStatus> {
  let primeiraFalha: number | null = null;
  let espera = Math.max(pollMs, 1);
  for (;;) {
    try {
      return await pollClaudeBatch(batchId);
    } catch (e: any) {
      const agora = Date.now();
      if (primeiraFalha === null) primeiraFalha = agora;
      if (agora - primeiraFalha >= toleranciaMs) throw e;
      console.warn(`[ai-batch] consulta ao batch ${batchId} falhou (${e?.message}); nova tentativa em ${Math.round(espera / 1000)}s`);
      await sleep(espera);
      espera = Math.min(espera * 2, 30_000);
    }
  }
}

/**
 * Cancela um batch que estourou o orçamento e colhe o que JÁ saiu.
 *
 * Existe para quem tem fallback síncrono por item (o collector): sem ele, o batch
 * seguia na Anthropic, era cobrado ao terminar, e o síncrono pagava de novo os
 * mesmos itens. `Medido em 30/09/2026`: a fila de lotes chegou a 78-128 min, contra
 * o máximo de 12 min da amostra de setembro. Cancelar corta o que ainda não rodou
 * (não é cobrado); o que já saiu (pago) é aproveitado, e só o resto vai ao síncrono.
 */
async function cancelarEColher(
  batchId: string,
  budgetMs: number,
  pollMs: number,
  toleranciaMs: number,
  ledger?: { feature?: string; empresaId?: string | null },
): Promise<Map<string, string>> {
  await anthropicClient().messages.batches.cancel(batchId);
  // O cancelamento leva o batch a `canceling` e depois a `ended`; normalmente em segundos.
  const limite = Date.now() + 3 * 60_000;
  for (;;) {
    const { ended } = await consultarComTolerancia(batchId, pollMs, toleranciaMs);
    if (ended) break;
    if (Date.now() > limite) throw new Error(`batch ${batchId} cancelado, mas não encerrou em 3 min`);
    await sleep(Math.max(pollMs, 1));
  }
  const out = await fetchClaudeBatchResults(batchId, ledger);
  await encerrarBatch(batchId, IA_BATCH.ERRO,
    `cancelado ao estourar o orçamento de ${Math.round(budgetMs / 60000)} min; ${out.size} item(ns) aproveitado(s)`);
  return out;
}

/**
 * Submete N requests como UM batch Claude, faz polling INLINE até terminar e
 * devolve o texto por customId. Lança se estourar o orçamento de tempo, salvo com
 * `cancelarNoTimeout`: aí cancela o batch e devolve só o que já saiu (o chamador
 * manda o resto ao síncrono).
 *
 * ⚠️ Segura a run aberta durante o polling — logo CONSOME o `maxDuration` da task.
 * Bom para batches pequenos/rápidos (IA2, kit). Para lotes que podem demorar (e
 * sob congestão da Batch API), prefira o padrão DESTACADO acima
 * (`createClaudeBatch` + `wait.for` + `pollClaudeBatch`).
 */
export async function submitClaudeBatch(
  reqs: BatchReq[],
  opts: {
    pollMs?: number; budgetMs?: number; locale?: AppLocale;
    /** Etiqueta do ledger (feature/empresa). Sem isto o custo cai como 'batch' genérico. */
    ledger?: { feature?: string; empresaId?: string | null; jobId?: string | null };
    /**
     * Ao estourar o orçamento, cancela o batch e devolve o que já saiu, em vez de
     * lançar. Só para quem tem fallback síncrono por item: sem ele, o batch
     * deixado em 'submetido' é o que permite recuperá-lo depois.
     */
    cancelarNoTimeout?: boolean;
    /** Falhas seguidas de consulta toleradas antes de desistir (default `TOLERANCIA_FALHA_CONSULTA_MS`). */
    toleranciaFalhaMs?: number;
  } = {},
): Promise<Map<string, string>> {
  const batchId = await createClaudeBatch(reqs, { locale: opts.locale, ledger: opts.ledger });
  const budgetMs = opts.budgetMs ?? 40 * 60_000;
  const pollMs = opts.pollMs ?? 5000;
  const toleranciaMs = opts.toleranciaFalhaMs ?? TOLERANCIA_FALHA_CONSULTA_MS;
  const deadline = Date.now() + budgetMs;

  for (;;) {
    const { ended } = await consultarComTolerancia(batchId, pollMs, toleranciaMs);
    if (ended) break;
    if (Date.now() > deadline) {
      if (opts.cancelarNoTimeout) return cancelarEColher(batchId, budgetMs, pollMs, toleranciaMs, opts.ledger);
      // O batch NÃO é cancelado: ele continua e vai terminar. Deixar o rastro em
      // 'submetido' é o que permite buscá-lo depois — `scripts/_batches-orfaos.mjs`.
      throw new Error(`batch ${batchId} excedeu ${Math.round(budgetMs / 60000)}min (rastro em ia_batches, recuperável)`);
    }
    await sleep(pollMs);
  }
  const out = await fetchClaudeBatchResults(batchId, opts.ledger);
  await encerrarBatch(batchId, IA_BATCH.CONCLUIDO);
  return out;
}

/**
 * Assinatura compatível com callAI — drop-in como `aiRun`.
 *
 * O 5º arg (`options`) existe para o call-site poder passar `taskKey`/atribuição
 * SEM precisar saber se está no caminho síncrono ou em lote: o `callAI` usa e
 * registra no ledger; o collector de batch IGNORA, porque o lote é logado à parte
 * em `fetchClaudeBatchResults` (`source='batch'`). Sem isso, etiquetar a geração
 * de conteúdo exigiria um `as any` no call-site ou dois caminhos de chamada.
 */
export type AIRun = (system: string, user: string, aiConfig: any, maxTokens: number, options?: any) => Promise<string>;

interface Pending extends BatchReq {
  resolve: (s: string) => void;
  reject: (e: any) => void;
  /** options do call-site (taskKey/empresaId/...) — só usado se cair no síncrono. */
  options?: any;
}

/**
 * Collector debounced (estilo DataLoader): acumula chamadas concorrentes e, após
 * uma janela de silêncio, manda tudo num batch. Suporta múltiplas RODADAS
 * automaticamente (desafios → flush → formatos → flush) porque cada rodada só é
 * enfileirada depois que a anterior resolve. Devolve `run` com a cara do callAI.
 */
export function createAIBatchCollector(
  defaultModel: string,
  opts: {
    windowMs?: number; budgetMs?: number; locale?: AppLocale;
    /** Intervalo entre consultas ao batch (default do `submitClaudeBatch`). */
    pollMs?: number;
    /**
     * Etiqueta do ledger (C7, auditoria 22/08).
     *
     * Sem ela, o caminho de SUCESSO — o default e o barato — gravava
     * `feature: 'batch'`. E `'batch'` é pior que `untagged`: PARECE etiqueta,
     * então não entra na métrica de untagged e a lacuna se esconde DENTRO do
     * número que está verde. `Medido:` 232 chamadas / US$ 5,65 assim.
     */
    ledger?: { feature?: string; empresaId?: string | null; jobId?: string | null };
  } = {},
): { run: AIRun } {
  let queue: Pending[] = [];
  let timer: any = null;
  let seq = 0;

  // ⚠️ Repassa `options` (taskKey/empresaId/...) para o callAI. Sem isso o
  // fallback gravava `feature='untagged'` no ledger justamente nos dias em que o
  // batch falha — o call-site etiquetava certo e o custo sumia mesmo assim.
  // `source='batch-sync'` distingue no ledger o que foi lote degradado (preço
  // cheio) do que rodou síncrono por opção — senão a degradação fica invisível.
  function syncFallback(p: Pending): Promise<string> {
    return callAI(p.system, p.user, { model: p.model }, p.maxTokens, {
      ...(p.options || {}),
      source: 'batch-sync',
    });
  }

  async function doFlush(batch: Pending[]) {
    try {
      // `cancelarNoTimeout`: aqui todo item tem fallback síncrono, então um batch
      // que estoura o orçamento é cancelado e só o que faltou vai ao síncrono (sem
      // pagar duas vezes o mesmo item). Ver `cancelarEColher`.
      const results = await submitClaudeBatch(batch, { budgetMs: opts.budgetMs, pollMs: opts.pollMs, locale: opts.locale, ledger: opts.ledger, cancelarNoTimeout: true });
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

  const run: AIRun = (system, user, aiConfig, maxTokens, options) => {
    const model = aiConfig?.model || defaultModel;
    // Modelo não-Claude (override por-tarefa da empresa) → síncrono, preserva o provedor.
    if (!String(model).startsWith('claude')) return callAI(system, user, aiConfig, maxTokens, options);
    return new Promise<string>((resolve, reject) => {
      // `options.locale` vale nos DOIS caminhos: o síncrono o repassa ao `callAI` (via `options`) e o lote o
      // leva na request. Antes só o síncrono o honrava, e o coletor mandava tudo no idioma do coletor.
      queue.push({ customId: `r${seq++}`, system, user, model, maxTokens, cacheSystem: options?.cacheSystem, locale: options?.locale, resolve, reject, options });
      schedule();
    });
  };

  return { run };
}

// ── Lote SÍNCRONO (GPT pelo Bedrock, 15/10/2026) ──────────────────────────────
// O check dual em lote (auditor GPT) ia pela Batch API da OpenAI (−50%). Desde 14/10
// o GPT sai pelo AWS Bedrock, pago pelo crédito Activate, e o batch OpenAI do
// Bedrock só aceita gpt-oss. Decisão do dono (15/10): o check em lote passa a ser
// SÍNCRONO pelo Bedrock, custo cheio. Medido em 60 dias antes da troca: lotes de
// até 43 itens (ia4_check), média 9 a 22, ~US$ 0,55/mês no −50%.
//
// Devolve o MESMO formato que a colheita do lote devolvia (`Map<customId, texto>`),
// então as tasks seguem com o loop de persistência de sempre. Item que falha fica
// FORA do mapa, e as tasks já tratam isso como tratavam o item errado do lote: IA3 e
// IA4 caem no síncrono por item, com as retentativas normais do `callAI`; os
// cenários B preservam o cenário para nova checagem.

/**
 * Roda cada request por `callAI` (rota Bedrock, reserva OpenAI e ledger por chamada),
 * com no máximo `concorrencia` em voo. Os resultados ficam num mapa LOCAL e só saem
 * quando o lote inteiro termina: nada escreve em estado compartilhado de dentro do
 * pool (o `Promise.all` não para os outros workers quando um falha).
 */
export async function executarLoteSincrono(
  reqs: BatchReq[],
  opts: { locale?: AppLocale; concorrencia?: number; timeoutMs?: number; ledger?: { feature?: string; empresaId?: string | null } } = {},
): Promise<Map<string, string>> {
  const resultados = new Map<string, string>();
  const fila = [...reqs];
  const largura = Math.max(1, Math.min(opts.concorrencia ?? 4, fila.length || 1));
  const trabalhador = async () => {
    for (let r = fila.shift(); r; r = fila.shift()) {
      try {
        const texto = await callAI(r.system, r.user, { model: r.model }, r.maxTokens, {
          taskKey: opts.ledger?.feature,
          empresaId: opts.ledger?.empresaId ?? undefined,
          locale: r.locale || opts.locale || defaultLocale,
          ...(r.cacheSystem === false ? { cacheSystem: false } : {}),
          ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}),
          // Uma tentativa aqui: quem falha cai no síncrono por item das tasks, que retenta.
          semRetentativa: true,
          maxRetries: 0,
        });
        if (texto && texto.trim()) resultados.set(r.customId, texto);
      } catch (e: any) {
        console.warn(`[lote-sincrono] ${opts.ledger?.feature || 'lote'} ${r.customId} falhou (${String(e?.message || e).slice(0, 160)}); fica para o síncrono por item`);
      }
    }
  };
  await Promise.all(Array.from({ length: largura }, trabalhador));
  return resultados;
}
