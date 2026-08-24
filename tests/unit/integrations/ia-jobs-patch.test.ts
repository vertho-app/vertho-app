import { describe, it, expect, vi, beforeEach } from 'vitest';
import { criarPatchJob } from '@/lib/ia-jobs';

/**
 * 🔴 O furo que os testes de idempotência do C3 NÃO pegavam (achado em revisão,
 * 24/08).
 *
 * As cinco tasks de lote definiam o seu próprio `patch`:
 *
 *     const patch = (f) => sb.from('ia_jobs').update({ ...f }).eq('id', jobId);
 *
 * sem `{ error }`. E os testes de idempotência simulavam a falha com `throw` —
 * que é a forma que o supabase-js NÃO usa. Ele **resolve** a promise com
 * `{ error }`. Ou seja: os testes provavam a idempotência contra um modo de
 * falha que não acontece, enquanto o modo que acontece passava direto.
 *
 * Isso importa porque é por esse `patch` que passam `batchId`, `geradosPorItem`,
 * `avaliados` e `checados` — **toda a idempotência do C3**. Checkpoint que não
 * grava e não reclama é pior que nenhum: a execução seguinte acha que não fez
 * nada e resubmete lote PAGO.
 *
 * A distinção que ficou no código: progresso é best-effort, checkpoint falha
 * alto. Os dois casos abaixo exercitam `{ error }` (não `throw`) nos dois.
 */

const mocks = vi.hoisted(() => ({
  /** Erro que o UPDATE devolve — no formato do supabase-js: resolve, não lança. */
  erro: null as { message: string } | null,
  gravados: [] as any[],
}));

function sbFalso() {
  return {
    from: () => ({
      update: (campos: any) => ({
        eq: async () => {
          if (mocks.erro) return { error: mocks.erro };
          mocks.gravados.push(campos);
          return { error: null };
        },
      }),
    }),
  };
}

beforeEach(() => { mocks.erro = null; mocks.gravados = []; });

describe('criarPatchJob · o `{ error }` do supabase-js não escapa', () => {
  it('caminho feliz grava e carimba updated_at', async () => {
    const { patch } = criarPatchJob(sbFalso(), 'job-1');
    await patch({ status: 'running' });

    expect(mocks.gravados).toHaveLength(1);
    expect(mocks.gravados[0].status).toBe('running');
    expect(mocks.gravados[0].updated_at, 'sem updated_at o job parece parado').toBeTruthy();
  });

  /**
   * O checkpoint é o que sustenta a idempotência: se ele não gravou, a próxima
   * execução repete trabalho PAGO. Falhar alto aqui é a escolha barata.
   */
  it('🔴 patchCritico LANÇA quando o update devolve { error }', async () => {
    mocks.erro = { message: 'deadlock detected' };
    const { patchCritico } = criarPatchJob(sbFalso(), 'job-1');

    await expect(patchCritico({ params: { batchId: 'msgbatch_1' } }))
      .rejects.toThrow(/checkpoint não gravado.*deadlock/);
  });

  /**
   * Progresso é outra coisa: derrubar um lote de 40 minutos porque a barrinha
   * não gravou trocaria um problema pequeno por um caro. Mas não pode sumir.
   */
  it('patch de PROGRESSO avisa e segue — não derruba o lote', async () => {
    mocks.erro = { message: 'timeout no pool' };
    const avisos: string[] = [];
    const original = console.warn;
    console.warn = (...a: any[]) => { avisos.push(a.map(String).join(' ')); };
    try {
      const { patch } = criarPatchJob(sbFalso(), 'job-1');
      await expect(patch({ progress: { done: 1 } })).resolves.toBeUndefined();
    } finally {
      console.warn = original;
    }

    expect(
      avisos.some((a) => a.includes('job-1') && a.includes('timeout no pool')),
      'a falha de progresso sumiu sem vestígio',
    ).toBe(true);
  });

  it('a exceção CRUA (rede caiu) também sobe — não é engolida', async () => {
    const sbQueLanca = {
      from: () => ({ update: () => ({ eq: async () => { throw new Error('ECONNRESET'); } }) }),
    };
    const { patchCritico } = criarPatchJob(sbQueLanca, 'job-1');
    await expect(patchCritico({ status: 'done' })).rejects.toThrow(/ECONNRESET/);
  });
});
