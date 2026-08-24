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
