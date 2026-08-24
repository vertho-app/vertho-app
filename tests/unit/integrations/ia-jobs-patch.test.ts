import { describe, it, expect, vi, beforeEach } from 'vitest';
import { criarPatchJob, ehUltimaTentativa, registrarFalhaDaTentativa } from '@/lib/ia-jobs';

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

/**
 * ── C3, passo final: quem grava `error` decide quem pode disparar ──────────
 *
 * Com `retry` ligado (24/08), o `catch` das cinco tasks passou a rodar em
 * tentativas que NÃO são a última. Gravar `status: 'error'` ali quebra duas
 * coisas que ninguém associaria ao retry — e as duas foram lidas no consumidor,
 * não supostas:
 *
 *  1. `jaTemLoteAtivo` (actions/ia-pipeline-batch.ts) bloqueia lote novo da
 *     mesma fase com `.in('status', ['queued','running'])`. Um job em `error`
 *     com retentativa AGENDADA não bloqueia nada;
 *  2. os quatro leitores de progresso param o polling em `done`/`error` e
 *     mostram "Lote falhou" — o operador reage disparando de novo, o que fecha
 *     o círculo com (1): duas runs na mesma fila.
 */
describe('C3 · a falha de UMA tentativa não é a falha do JOB', () => {
  const patchFalso = () => {
    const gravados: any[] = [];
    return { gravados, patch: async (c: any) => { gravados.push(c); } };
  };

  it('tentativa 1 de 3: o job segue `running` — o guard anti-duplicata continua de pé', async () => {
    const { gravados, patch } = patchFalso();
    await registrarFalhaDaTentativa(patch, new Error('Anthropic 529'), { attempt: { number: 1 }, run: { maxAttempts: 3 } }, 3);

    expect(
      gravados[0].status,
      'gravou `error` com retentativa pela frente — solta o guard e a tela anuncia falha do que ainda vai terminar',
    ).toBe('running');
    expect(gravados[0].error, 'o rastro do que falhou sumiu').toMatch(/Anthropic 529/);
    expect(gravados[0].error, 'não diz que vai retentar').toMatch(/tentativa 1\/3/);
  });

  it('🔴 última tentativa: aí sim `error` — senão o job fica `running` para sempre', async () => {
    const { gravados, patch } = patchFalso();
    await registrarFalhaDaTentativa(patch, new Error('Anthropic 529'), { attempt: { number: 3 }, run: { maxAttempts: 3 } }, 3);

    expect(gravados[0].status).toBe('error');
    expect(gravados[0].error).toBe('Anthropic 529');
  });

  /**
   * ⚠️ `ctx.run.maxAttempts` VENCE a constante da task: o executor faz
   * `retry.maxAttempts = Math.max(execution.run.maxAttempts, 1)` quando o
   * trigger mandou um override (@trigger.dev/core taskExecutor.js:698). Ler só
   * a constante local faria a task se achar na última tentativa antes da hora —
   * e gravar `error` cedo é exatamente o bug que esta régua existe para evitar.
   */
  it('🔑 o override do trigger vence a constante declarada na task', () => {
    // Task declara 3; o disparo pediu 5. Na 3ª ainda há duas pela frente.
    expect(ehUltimaTentativa({ attempt: { number: 3 }, run: { maxAttempts: 5 } }, 3)).toBe(false);
    // E no sentido inverso: disparo pediu 2, a 2ª é a última mesmo com 3 declarado.
    expect(ehUltimaTentativa({ attempt: { number: 2 }, run: { maxAttempts: 2 } }, 3)).toBe(true);
  });

  it('sem ctx (chamada headless/teste antigo), trata como tentativa única', async () => {
    const { gravados, patch } = patchFalso();
    await registrarFalhaDaTentativa(patch, new Error('boom'), undefined, 3);
    expect(
      gravados[0].status,
      'sem ctx o job ficaria `running` para sempre — ninguém retentaria para fechá-lo',
    ).toBe('error');
  });

  it('a mensagem é truncada — `error` é coluna, não depósito de stack', async () => {
    const { gravados, patch } = patchFalso();
    await registrarFalhaDaTentativa(patch, new Error('x'.repeat(900)), { attempt: { number: 1 }, run: { maxAttempts: 3 } }, 3);
    expect(gravados[0].error.length).toBeLessThanOrEqual(500);
  });
});
