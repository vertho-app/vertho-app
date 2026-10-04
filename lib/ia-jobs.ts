/**
 * Escrita em `ia_jobs` — com a distinção que as tasks de lote precisam.
 *
 * 🔴 POR QUE ESTE ARQUIVO EXISTE (C3, achado em revisão de 24/08).
 *
 * As cinco tasks de lote definiam, cada uma, o seu `patch`:
 *
 *     const patch = (f) => sb.from('ia_jobs').update({ ...f, updated_at }).eq('id', jobId);
 *
 * Sem `{ error }`. E o supabase-js **retorna** o erro em vez de lançar, então o
 * `try/catch` da run nunca o via. O efeito não é cosmético: é por esse `patch`
 * que passam o `batchId`, o `geradosPorItem`, o `avaliados` e o `checados` — ou
 * seja, **toda a idempotência do C3 dependia de uma escrita que podia falhar em
 * silêncio**. Um checkpoint que não grava e não reclama é pior que nenhum: a
 * run seguinte acha que não fez nada e resubmete lote PAGO.
 *
 * A distinção que os dois nomes carregam:
 *
 *  · `patch` — PROGRESSO (barra, mensagem, resultados parciais). Best-effort:
 *    avisa e segue. Derrubar um lote de 40 minutos porque a barrinha não gravou
 *    seria trocar um problema pequeno por um caro.
 *  · `patchCritico` — CHECKPOINT (batchId, itens já feitos, status final).
 *    Falha ALTO. Se isto não gravou, a próxima execução vai repetir trabalho
 *    pago, e é melhor saber agora.
 *
 * ⚠️ Quem chama `patchCritico` para gravar um `batchId` deve envolvê-lo em
 * try/catch próprio: erro de PERSISTÊNCIA não é erro de FORNECEDOR, e o lote
 * já pago não pode ser descartado pelo caminho caro por causa disso.
 */

export interface PatchJob {
  /** Progresso: best-effort, avisa e segue. */
  patch: (campos: Record<string, unknown>) => Promise<void>;
  /** Checkpoint de idempotência: falha alto. */
  patchCritico: (campos: Record<string, unknown>) => Promise<void>;
}

export function criarPatchJob(sb: any, jobId: string): PatchJob {
  const gravar = async (campos: Record<string, unknown>, critico: boolean) => {
    const { error } = await sb.from('ia_jobs')
      .update({ ...campos, updated_at: new Date().toISOString() })
      .eq('id', jobId);
    if (!error) return;
    if (critico) {
      throw new Error(`ia_jobs ${jobId}: checkpoint não gravado — ${error.message}`);
    }
    console.warn(`[ia-jobs] progresso de ${jobId} não gravado: ${error.message}`);
  };

  return {
    patch: (campos) => gravar(campos, false),
    patchCritico: (campos) => gravar(campos, true),
  };
}

/**
 * ── C3, passo final (24/08): quem grava `error` decide quem pode disparar ──
 *
 * Com `retry` ligado, o `catch` de uma task passa a rodar em tentativas que
 * **não são a última**. Gravar `status: 'error'` ali quebra duas coisas que
 * ninguém associaria ao retry:
 *
 *  1. **O guard anti-duplicata solta.** `jaTemLoteAtivo` (actions/ia-pipeline-batch.ts)
 *     bloqueia lote novo da mesma fase só enquanto o status é `queued`/`running`.
 *     Um job em `error` com retentativa AGENDADA não bloqueia nada — e as duas
 *     runs processariam a mesma fila em corrida.
 *  2. **A tela anuncia falha de um lote que vai terminar bem.** Os quatro
 *     leitores de progresso param o polling em `done`/`error` e mostram "Lote
 *     falhou"; o operador reage disparando de novo, o que fecha o círculo com (1).
 *
 * Enquanto houver tentativa pela frente, o job continua `running` — o `error`
 * é preenchido mesmo assim, porque é o rastro do que falhou e nenhum leitor o
 * mostra sem o status.
 *
 * ⚠️ `ctx.run.maxAttempts` VENCE o valor declarado na task: o executor faz
 * `retry.maxAttempts = Math.max(execution.run.maxAttempts, 1)` quando o trigger
 * mandou um override (`@trigger.dev/core` taskExecutor.js:698). Ler só a
 * constante local faria a task se achar na última tentativa antes da hora.
 */
export interface CtxTentativa {
  attempt?: { number?: number };
  run?: { maxAttempts?: number };
}

export function ehUltimaTentativa(ctx: CtxTentativa | undefined, maxDeclarado: number): boolean {
  /**
   * 🔑 Sem `attempt.number` a resposta é SIM, e isso é deliberado (achado ao
   * escrever o teste): manter o job `running` é a afirmação positiva "vem outra
   * tentativa", e afirmação positiva precisa de evidência. Sem ela — chamada
   * headless, script, o SDK mudando de forma — ninguém retentaria, e o job
   * ficaria `running` PARA SEMPRE: tela em polling eterno e a fase travada pelo
   * guard anti-duplicata, que é pior que anunciar erro cedo demais.
   */
  const atual = ctx?.attempt?.number;
  if (typeof atual !== 'number') return true;
  const max = ctx?.run?.maxAttempts ?? maxDeclarado;
  return atual >= max;
}

/**
 * Grava a falha da tentativa: `error` só na última, `running` nas demais.
 * Sempre best-effort — se nem isto gravar, o `throw` que vem a seguir é que
 * manda, e insistir aqui só trocaria a causa real por um erro de escrita.
 */
export async function registrarFalhaDaTentativa(
  patch: PatchJob['patch'],
  erro: unknown,
  ctx: CtxTentativa | undefined,
  maxDeclarado: number,
): Promise<void> {
  const msg = String((erro as any)?.message || erro).slice(0, 500);
  const atual = ctx?.attempt?.number ?? 1;
  const max = ctx?.run?.maxAttempts ?? maxDeclarado;

  if (ehUltimaTentativa(ctx, maxDeclarado)) {
    await patch({ status: 'error', error: msg });
    return;
  }
  await patch({
    status: 'running',
    error: `tentativa ${atual}/${max} falhou (vai retentar): ${msg}`.slice(0, 500),
  });
}

/**
 * ── RESERVA EXCLUSIVA de uma fase por empresa ("já está gerando") ──
 *
 * O guard de duplicata dos lotes (`jaTemLoteAtivo`, `enqueueCenariosBBatch`) LÊ os
 * jobs ativos e só depois INSERE o seu: entre as duas leituras cabe outro clique, e os
 * dois passam. Para uma geração paga isso é pagar duas vezes pela mesma coisa (04/10/2026,
 * Cenários B: o índice único da mig 261 impede a SEGUNDA linha, mas não a segunda
 * chamada de IA). Sem migration (uma constraint única parcial em `ia_jobs` seria a
 * garantia completa, e é decisão do dono), o desenho fica em duas pontas:
 *
 *  1. INSERE a reserva (um `ia_jobs` `queued`/`running` da fase);
 *  2. LÊ os jobs ativos da fase DEPOIS de inserir e arbitra: vence o mais antigo
 *     (`created_at`, depois `id`). Quem perde apaga a própria linha e recebe
 *     `{ jaGerando }`, nunca um erro calado.
 *
 * Como cada chamada lê DEPOIS de gravar a sua, pelo menos uma enxerga a outra; na
 * corrida (duas inserções quase juntas) as duas veem as duas e decidem igual. A janela
 * que resta é a de uma inserção que NASCEU antes mas só confirmou depois da leitura do
 * vencedor (milissegundos, mesma tabela, sem contenção): é a diferença para a constraint.
 *
 * Reserva morta não prende a fase para sempre: o job de outra execução que não dá sinal
 * (`updated_at`) há mais que a sua lease não conta (e é marcado `error`). A lease é
 * curta para a geração imediata (`params.modo === 'imediato'`, uma action de no máximo
 * 300 s) e longa para o lote (a task grava o progresso a cada minuto).
 */
export const LEASE_RESERVA_IMEDIATA_MS = 15 * 60_000;
export const LEASE_RESERVA_LOTE_MS = 2 * 3600_000;

const leaseDaReserva = (params: any) => (params?.modo === 'imediato' ? LEASE_RESERVA_IMEDIATA_MS : LEASE_RESERVA_LOTE_MS);

export type ResultadoDaReserva = { jobId: string } | { jaGerando: string } | { erro: string };

export async function reservarFaseDoLote(
  tdb: any,
  a: { fase: string; status: 'queued' | 'running'; params: Record<string, unknown>; progress: Record<string, unknown>; agoraMs?: number },
): Promise<ResultadoDaReserva> {
  const { data: job, error } = await tdb.from('ia_jobs')
    .insert({ fase: a.fase, params: a.params, status: a.status, progress: a.progress })
    .select('id').single();
  if (error || !job) return { erro: error?.message || 'Falha ao reservar a geração' };

  /** Solta a reserva que não vai ser usada: apaga a linha (nunca rodou) e, se não der, cancela. */
  const soltar = async () => {
    const { error: errDel } = await tdb.from('ia_jobs').delete().eq('id', job.id);
    if (!errDel) return;
    const { error: errCancel } = await tdb.from('ia_jobs').update({ status: 'cancelled', error: 'reserva duplicada, descartada' }).eq('id', job.id);
    if (errCancel) console.error(`[ia-jobs] reserva ${job.id} NÃO foi solta (${errDel.message}; ${errCancel.message}): ela segura a fase até a lease vencer`);
  };

  const { data: ativos, error: errAtivos } = await tdb.from('ia_jobs')
    .select('id, created_at, updated_at, params')
    .eq('fase', a.fase).in('status', ['queued', 'running'])
    .order('created_at', { ascending: true }).order('id', { ascending: true });
  if (errAtivos) {
    await soltar();
    return { erro: `Não foi possível verificar as gerações ativas: ${errAtivos.message}` };
  }

  const agora = a.agoraMs ?? Date.now();
  const vivos: any[] = [];
  for (const j of (ativos || []) as any[]) {
    const sinalMs = Date.parse(j.updated_at || j.created_at || '');
    const morto = j.id !== job.id && Number.isFinite(sinalMs) && agora - sinalMs > leaseDaReserva(j.params);
    if (!morto) { vivos.push(j); continue; }
    // Sem sinal além da lease: a execução morreu. Marca o fim para ela não voltar a aparecer.
    const { error: errMorto } = await tdb.from('ia_jobs')
      .update({ status: 'error', error: 'reserva expirada: sem sinal da execução além da lease' })
      .eq('id', j.id).in('status', ['queued', 'running']);
    if (errMorto) console.warn(`[ia-jobs] reserva expirada ${j.id} não marcada: ${errMorto.message}`);
  }

  const dono = vivos[0];
  if (!dono || dono.id === job.id) return { jobId: job.id };
  await soltar();
  return { jaGerando: dono.id };
}
