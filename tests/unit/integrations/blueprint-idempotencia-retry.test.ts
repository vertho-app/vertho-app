import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * C3 passo 4 — `gerar-blueprint-batch`, a última das quatro.
 *
 * Ela ficou por último de propósito: o cabeçalho da task declara o fallback
 * síncrono como FEATURE ("Falha do BATCH inteiro → FALLBACK SÍNCRONO por colab —
 * nunca perde"). Isso muda o custo de um retry mal colocado — aqui ele não só
 * resubmete o lote, ainda paga o caminho caro por cima. Era onde ligar `retry`
 * primeiro seria mais errado.
 *
 * Os pré-requisitos, um caso para cada:
 *  1. `batchId` persistido ANTES do polling (era `submitClaudeBatch`, que cria e
 *     espera dentro da run — o id ficava só em memória);
 *  2. retomada pelo mesmo id, com `ia_batches.job_id` como 2ª fonte;
 *  3. chave por item — e aqui a chave é o **id**, não o nome: `result_ids`
 *     guarda nome (para a tela), e dois "Ana Silva" na mesma empresa fariam a
 *     retomada pular a pessoa errada;
 *  4. early-return de `done`.
 */

const mocks = vi.hoisted(() => ({
  jobs: new Map<string, any>(),
  batchesCriados: [] as string[],
  patches: [] as any[],
  loteConsultado: false,
  batchNoRastro: null as string | null,
  /** Colabs que `persistBlueprintFromText` gravou. */
  persistidos: [] as string[],
  /** Os customIds que foram REALMENTE ao lote — é neles que o dinheiro sai. */
  enviadosAoLote: [] as string[],
  /** Chamadas ao caminho síncrono — é o caro, e aqui é "feature". */
  sincronas: 0,
  respostasBatch: new Map<string, string>(),
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
          if (b._tabela === 'ia_jobs') {
            mocks.patches.push(campos);
            mocks.jobs.set(id, { ...mocks.jobs.get(id), ...campos });
          }
          return { error: null };
        },
      }),
      then: (res: any) => Promise.resolve({
        data: b._tabela === 'colaboradores'
          ? [{ id: 'c1', nome_completo: 'Ana' }, { id: 'c2', nome_completo: 'Bruno' }]
          : [],
        error: null,
      }).then(res),
    };
    return { from: (t: string) => { b._tabela = t; b._id = null; return b; } };
  },
}));

vi.mock('@/lib/ai-batch', () => ({
  createClaudeBatch: async (reqs: any[]) => {
    const id = `msgbatch_${mocks.batchesCriados.length + 1}`;
    mocks.batchesCriados.push(id);
    mocks.enviadosAoLote = reqs.map((r) => r.customId);
    return id;
  },
  pollClaudeBatch: async () => {
    mocks.loteConsultado = true;
    return { ended: true, counts: { processing: 0, succeeded: 1, errored: 0, canceled: 0, expired: 0 } };
  },
  fetchClaudeBatchResults: async () => mocks.respostasBatch,
  encerrarBatch: async () => undefined,
  batchPendenteDoJob: async () => mocks.batchNoRastro,
}));

vi.mock('@trigger.dev/sdk', () => ({ task: (cfg: any) => cfg, wait: { for: async () => undefined } }));

vi.mock('@/lib/blueprint/core', () => ({
  buildBlueprintReq: async (_sb: any, { colaboradorId }: any) => ({
    system: 'S', user: 'U', maxTokens: 8192, competenciasFoco: [{ nome: 'C1' }],
    customId: colaboradorId,
  }),
  persistBlueprintFromText: async (_e: string, id: string) => {
    mocks.persistidos.push(id);
    return { ok: true };
  },
}));

vi.mock('@/actions/ai-client', () => ({
  callAI: async () => { mocks.sincronas++; return 'texto-sincrono'; },
}));

const JOB = 'job-bp';
const jobBase = {
  id: JOB, status: 'queued', empresa_id: 'emp-1', result_ids: [],
  params: { aiConfig: {}, colabIds: ['c1', 'c2'] },
};

beforeEach(() => {
  mocks.jobs = new Map([[JOB, structuredClone(jobBase)]]);
  mocks.batchesCriados = [];
  mocks.patches = [];
  mocks.persistidos = [];
  mocks.enviadosAoLote = [];
  mocks.sincronas = 0;
  mocks.loteConsultado = false;
  mocks.batchNoRastro = null;
  mocks.respostasBatch = new Map([['c1', 'texto-1'], ['c2', 'texto-2']]);
});

async function rodar() {
  const mod = await import('@/trigger/gerar-blueprint-batch');
  return (mod as any).gerarBlueprintBatchTask.run({ jobId: JOB });
}

describe('C3 · blueprint: batch destacado com id persistido', () => {
  it('persiste o batchId ANTES de consultar o lote', async () => {
    await rodar();

    expect(mocks.jobs.get(JOB).params.batchId, 'sem id gravado não há retomada').toBe('msgbatch_1');
    expect(mocks.loteConsultado).toBe(true);
    expect(mocks.sincronas, 'caiu no caminho caro com o lote respondendo').toBe(0);
  });

  it('🔴 com o id já persistido, a retomada NÃO cria outro lote', async () => {
    mocks.jobs.set(JOB, {
      ...structuredClone(jobBase), status: 'running',
      params: { aiConfig: {}, colabIds: ['c1', 'c2'], batchId: 'msgbatch_existente' },
    });

    await rodar();

    expect(mocks.batchesCriados, 'resubmeteu o lote — aqui isso custa o lote + o síncrono').toHaveLength(0);
  });

  it('🔴 sem params.batchId, recupera pelo RASTRO (mig 225)', async () => {
    mocks.jobs.set(JOB, { ...structuredClone(jobBase), status: 'running' });
    mocks.batchNoRastro = 'msgbatch_orfao';

    await rodar();

    expect(mocks.batchesCriados, 'ignorou o lote pago que estava registrado').toHaveLength(0);
    expect(mocks.loteConsultado).toBe(true);
  });
});

describe('C3 · blueprint: chave por item é o ID, não o nome', () => {
  it('🔴 colab já persistido não é regerado NEM entra no lote', async () => {
    mocks.jobs.set(JOB, {
      ...structuredClone(jobBase), status: 'running',
      params: { aiConfig: {}, colabIds: ['c1', 'c2'], blueprintsFeitos: ['c1'] },
    });

    await rodar();

    expect(mocks.persistidos, 'regerou um blueprint que já existia').toEqual(['c2']);
    // 🔑 A asserção que faltava: pular no LOOP não basta. Mandar ao LOTE um item
    // já pronto é pagar por ele — o custo sai na submissão, não na persistência.
    // Descoberto por mutação: sem esta linha, remover o filtro do lote passava
    // despercebido.
    expect(
      mocks.enviadosAoLote,
      'o item já feito foi submetido ao lote — é IA paga de novo, mesmo que o resultado seja descartado',
    ).toEqual(['c2']);
  });

  it('o checkpoint é INCREMENTAL', async () => {
    await rodar();

    const comFeitos = mocks.patches.filter((p) => Array.isArray(p?.params?.blueprintsFeitos));
    expect(
      comFeitos.length,
      'blueprintsFeitos só apareceu no fim — não retoma nada',
    ).toBeGreaterThan(0);
    expect(mocks.jobs.get(JOB).params.blueprintsFeitos).toEqual(['c1', 'c2']);
  });

  it('a chave guardada é o ID (nome não é chave: dois homônimos quebram a retomada)', async () => {
    await rodar();
    const feitos = mocks.jobs.get(JOB).params.blueprintsFeitos;
    expect(feitos).toEqual(['c1', 'c2']);            // ids
    expect(mocks.jobs.get(JOB).result_ids).toEqual(['Ana', 'Bruno']); // nomes, para a tela
  });
});

describe('C3 · blueprint: reentrância e fallback', () => {
  it('🔴 job `done` não reexecuta — aqui custaria lote + síncrono', async () => {
    mocks.jobs.set(JOB, { ...structuredClone(jobBase), status: 'done', result_ids: ['Ana', 'Bruno'] });

    const r: any = await rodar();

    expect(r.reentrante).toBe(true);
    expect(mocks.batchesCriados).toHaveLength(0);
    expect(mocks.sincronas).toBe(0);
    expect(mocks.patches).toHaveLength(0);
  });

  it('colab sem resposta no lote cai no síncrono — a "feature" continua de pé', async () => {
    mocks.respostasBatch = new Map([['c1', 'texto-1']]); // falta c2

    await rodar();

    expect(mocks.sincronas, 'quem não voltou no lote deveria ir ao síncrono').toBe(1);
    expect(mocks.persistidos).toEqual(['c1', 'c2']);
  });
});
