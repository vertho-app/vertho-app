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
