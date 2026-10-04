import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Onda E (04/10/2026): o lote de PDI e o lote de blueprint escrevem para a PESSOA, e um lote junta pessoas de
 * idiomas diferentes. O idioma de cada uma (`colaboradores.locale`, senão o da empresa, senão pt-BR) é resolvido
 * ao montar a request e viaja em DOIS lugares, porque o lote é o caminho padrão e o síncrono é o seu reserva:
 *
 *  1. na request do batch (`BatchReq.locale`), senão o lote inteiro sairia no padrão (pt-BR);
 *  2. no fallback síncrono por pessoa. Fora de uma request o `callAI` não tem cookie e cai em pt-BR: sem
 *     `locale` explícito, quem o lote atendeu no idioma dele receberia o reserva em pt-BR.
 */

const mocks = vi.hoisted(() => ({
  jobs: new Map<string, any>(),
  /** O que cada task entregou ao `createClaudeBatch`. */
  lote: [] as any[],
  /** O que cada task entregou ao `callAI` do fallback. */
  sincronas: [] as Array<{ user: string; opcoes: any }>,
  respostasBatch: new Map<string, string>(),
  idiomas: { c1: 'en-US', c2: 'es-ES' } as Record<string, string>,
}));

vi.mock('@/lib/supabase', () => ({
  createSupabaseAdmin: () => {
    const b: any = {
      _tabela: '', _id: null as string | null,
      select: () => b,
      eq: (_c: string, v: any) => { if (b._id === null) b._id = v; return b; },
      in: () => b,
      maybeSingle: async () => ({ data: b._tabela === 'ia_jobs' ? (mocks.jobs.get(b._id) ?? null) : null, error: null }),
      update: (campos: any) => ({
        eq: async (_c: string, id: string) => {
          if (b._tabela === 'ia_jobs') mocks.jobs.set(id, { ...mocks.jobs.get(id), ...campos });
          return { error: null };
        },
      }),
      then: (res: any) => Promise.resolve({
        data: b._tabela === 'colaboradores' ? [{ id: 'c1', nome_completo: 'Ana' }, { id: 'c2', nome_completo: 'Bruno' }] : [],
        error: null,
      }).then(res),
    };
    return { from: (t: string) => { b._tabela = t; b._id = null; return b; } };
  },
}));

vi.mock('@/lib/ai-batch', () => ({
  createClaudeBatch: async (reqs: any[]) => { mocks.lote = reqs; return 'msgbatch_1'; },
  pollClaudeBatch: async () => ({ ended: true, counts: { processing: 0, succeeded: 1, errored: 0, canceled: 0, expired: 0 } }),
  fetchClaudeBatchResults: async () => mocks.respostasBatch,
  encerrarBatch: async () => undefined,
  batchPendenteDoJob: async () => null,
}));

vi.mock('@trigger.dev/sdk', () => ({ task: (cfg: any) => cfg, wait: { for: async () => undefined } }));

// Os dois núcleos são trocados por versões que devolvem o idioma da pessoa, como os reais.
vi.mock('@/lib/blueprint/core', () => ({
  buildBlueprintReq: async (_sb: any, { colaboradorId }: any) => ({
    customId: colaboradorId, system: 'S', user: `U-${colaboradorId}`, maxTokens: 8192,
    competenciasFoco: [{ nome: 'C1' }], empresaId: 'emp-1', locale: mocks.idiomas[colaboradorId],
  }),
  persistBlueprintFromText: async () => ({ ok: true }),
}));
vi.mock('@/lib/relatorios/individual-core', () => ({
  buildRelatorioIndividualReq: async (_sb: any, { colaboradorId }: any) => ({
    customId: colaboradorId, system: 'S', user: `U-${colaboradorId}`, maxTokens: 64000, locale: mocks.idiomas[colaboradorId],
  }),
  persistRelatorioIndividualFromText: async () => ({ success: true, pdfPath: 'emp-1/individual.pdf' }),
}));

vi.mock('@/actions/ai-client', () => ({
  callAI: async (_s: string, user: string, _cfg: any, _max: number, opcoes: any) => {
    mocks.sincronas.push({ user, opcoes });
    return 'texto-sincrono';
  },
}));

const JOB = 'job-idioma';
const jobBase = { id: JOB, status: 'queued', empresa_id: 'emp-1', result_ids: [], params: { aiConfig: {}, colabIds: ['c1', 'c2'] } };

beforeEach(() => {
  mocks.jobs = new Map([[JOB, structuredClone(jobBase)]]);
  mocks.lote = [];
  mocks.sincronas = [];
  mocks.respostasBatch = new Map([['c1', 'texto-1'], ['c2', 'texto-2']]);
  mocks.idiomas = { c1: 'en-US', c2: 'es-ES' };
});

const ctx = { ctx: { attempt: { number: 1 }, run: { maxAttempts: 3 } } };
const rodarBlueprint = async () => (await import('@/trigger/gerar-blueprint-batch') as any).gerarBlueprintBatchTask.run({ jobId: JOB }, ctx);
const rodarPdi = async () => (await import('@/trigger/gerar-relatorios-batch') as any).gerarRelatoriosBatchTask.run({ jobId: JOB }, ctx);

describe.each([
  ['blueprint (gerar-blueprint-batch)', rodarBlueprint, 'blueprint_gerar'],
  ['PDI (gerar-relatorios-batch)', rodarPdi, 'pdi_individual'],
])('%s: o idioma de cada pessoa', (_nome, rodar, taskKey) => {
  it('cada request do lote leva o idioma da pessoa, não um idioma só para o lote', async () => {
    await rodar();
    expect(mocks.lote.map((r) => [r.customId, r.locale])).toEqual([['c1', 'en-US'], ['c2', 'es-ES']]);
  });

  it('o fallback síncrono de quem ficou sem resposta no lote leva o MESMO idioma', async () => {
    mocks.respostasBatch = new Map([['c1', 'texto-1']]); // o lote não devolveu a c2
    await rodar();
    expect(mocks.sincronas).toHaveLength(1);
    expect(mocks.sincronas[0].user).toBe('U-c2');
    expect(mocks.sincronas[0].opcoes).toMatchObject({ taskKey, source: 'batch-sync', locale: 'es-ES' });
  });
});
