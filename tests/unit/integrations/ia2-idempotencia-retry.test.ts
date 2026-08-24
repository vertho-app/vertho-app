import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * C3 passo 2 — `gerar-ia2-batch` ganha os pré-requisitos do manuscrito.
 *
 * Antes desta rodada a task usava `submitClaudeBatch`, que **cria e espera
 * dentro da run**: o id do lote existia só em memória. Morrer no meio queimava
 * um lote PAGO sem deixar como retomá-lo — e ligar `retry` nesse estado faria a
 * retentativa submeter outro, com o fallback síncrono recomprando por cima.
 *
 * Os quatro pontos, e um caso para cada:
 *  1. `batchId` persistido ANTES do polling;
 *  2. retomada pelo MESMO id (não recria);
 *  3. chave por item — `result_ids` acumula os cargos persistidos e a retomada
 *     os pula, com checkpoint INCREMENTAL;
 *  4. early-return de `done`.
 *
 * Mais a distinção que o passo 1 mediu: **erro de persistência ≠ erro de
 * fornecedor** — falhar ao gravar o id não pode descartar o lote pago.
 */

const mocks = vi.hoisted(() => ({
  jobs: new Map<string, any>(),
  batchesCriados: [] as string[],
  patches: [] as any[],
  loteConsultado: false,
  matarAntesDePersistir: false,
  /** Cargos que `persistirGabaritoIA2` gravou. */
  gravados: [] as string[],
  /** Chamadas ao caminho síncrono (callAI) — é o caro. */
  sincronas: 0,
  /** Respostas que o batch devolve, por customId. */
  respostasBatch: new Map<string, string>(),
  /** O que `ia_batches` responde quando o params.batchId não foi gravado. */
  batchNoRastro: null as string | null,
  /** customIds que foram REALMENTE ao lote. */
  enviadosAoLote: [] as string[],
}));

vi.mock('@/lib/supabase', () => ({
  createSupabaseAdmin: () => ({
    from: (tabela: string) => {
      const b: any = {
        _id: null as string | null,
        select: () => b,
        eq: (_c: string, v: any) => { b._id = v; return b; },
        maybeSingle: async () => ({ data: mocks.jobs.get(b._id) ?? null, error: null }),
        update: (campos: any) => ({
          eq: async (_c: string, id: string) => {
            if (tabela === 'ia_jobs') {
              // 🔑 A forma REAL da falha do supabase-js: RESOLVE com `{ error }`,
              // não lança. A primeira versão deste mock usava `throw`, e por isso
              // os testes de idempotência não viam o furo do `patch` sem checagem.
              if (mocks.matarAntesDePersistir && campos?.params?.batchId) {
                return { error: { message: 'runtime morreu antes de persistir o batchId' } };
              }
              mocks.patches.push(campos);
              mocks.jobs.set(id, { ...mocks.jobs.get(id), ...campos });
            }
            return { error: null };
          },
        }),
      };
      return b;
    },
  }),
}));

vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => ({ from: () => ({}) }) }));

vi.mock('@/lib/ai-batch', () => ({
  createClaudeBatch: async (reqs: any[]) => {
    const id = `msgbatch_${mocks.batchesCriados.length + 1}`;
    mocks.batchesCriados.push(id);
    // O custo sai na SUBMISSÃO. Guardar o que foi enviado é o que separa
    // "pulei no loop" de "não paguei" — ver o comentário no caso abaixo.
    mocks.enviadosAoLote = reqs.map((r) => r.customId);
    return id;
  },
  pollClaudeBatch: async () => {
    mocks.loteConsultado = true;
    return { ended: true, counts: { processing: 0, succeeded: 1, errored: 0, canceled: 0, expired: 0 } };
  },
  fetchClaudeBatchResults: async () => mocks.respostasBatch,
  encerrarBatch: async () => undefined,
  /** A 2ª fonte da retomada: o rastro em `ia_batches` por (job_id, feature). */
  batchPendenteDoJob: async () => mocks.batchNoRastro,
}));

vi.mock('@trigger.dev/sdk', () => ({ task: (cfg: any) => cfg, wait: { for: async () => undefined } }));

vi.mock('@/lib/ia2-gabarito', () => ({
  carregarContextoIA2: async () => ({
    ctx: {
      top10PorCargo: { Diretor: ['C1'], Coordenador: ['C2'] },
      cargosDetalheMap: { diretor: {}, coordenador: {} },
      contextoPPP: '', valores: null, empresa: { nome: 'X' }, colabsParaMetrica: [],
    },
  }),
  montarPromptIA2: () => ({ system: 'S', user: 'U' }),
  persistirGabaritoIA2: async ({ cargoNome }: any) => {
    mocks.gravados.push(cargoNome);
    return { ok: true, message: 'ok' };
  },
}));

vi.mock('@/actions/ai-client', () => ({
  callAI: async () => { mocks.sincronas++; return '{"ok":true}'; },
}));
vi.mock('@/actions/utils', () => ({ extractJSON: async (t: string) => JSON.parse(t || '{}') }));

const JOB = 'job-ia2';
const jobBase = { id: JOB, status: 'queued', empresa_id: 'emp-1', result_ids: [], params: { aiConfig: {} } };

beforeEach(() => {
  mocks.jobs = new Map([[JOB, structuredClone(jobBase)]]);
  mocks.batchesCriados = [];
  mocks.patches = [];
  mocks.gravados = [];
  mocks.sincronas = 0;
  mocks.loteConsultado = false;
  mocks.matarAntesDePersistir = false;
  mocks.batchNoRastro = null;
  mocks.enviadosAoLote = [];
  // Por padrão o batch responde os dois cargos.
  mocks.respostasBatch = new Map([['c0', '{"a":1}'], ['c1', '{"a":2}']]);
});

async function rodar() {
  const mod = await import('@/trigger/gerar-ia2-batch');
  const t: any = (mod as any).gerarIA2BatchTask;
  return t.run({ jobId: JOB });
}

describe('C3 · IA2: batch destacado com id persistido', () => {
  it('persiste o batchId ANTES de consultar o lote', async () => {
    await rodar();

    const patchDoId = mocks.patches.findIndex((p) => p?.params?.batchId);
    expect(patchDoId, 'o batchId nunca foi gravado — não há como retomar o lote').toBeGreaterThanOrEqual(0);
    expect(mocks.jobs.get(JOB).params.batchId).toBe('msgbatch_1');
    expect(mocks.loteConsultado).toBe(true);
  });

  it('🔴 com o id JÁ persistido, a retomada NÃO cria outro lote', async () => {
    mocks.jobs.set(JOB, {
      ...structuredClone(jobBase), status: 'running',
      params: { aiConfig: {}, batchId: 'msgbatch_existente' },
    });

    await rodar();

    expect(mocks.batchesCriados, 'recriou o lote — é a IA paga duas vezes').toHaveLength(0);
    expect(mocks.loteConsultado, 'nem consultou o lote que já estava lá').toBe(true);
  });

  it('🔴 falha ao persistir o id NÃO descarta o lote pago (persistência ≠ fornecedor)', async () => {
    mocks.matarAntesDePersistir = true;

    await rodar();

    expect(mocks.batchesCriados).toHaveLength(1);
    expect(
      mocks.loteConsultado,
      'o lote pago foi descartado por erro de GRAVAÇÃO, e o síncrono pagou por cima',
    ).toBe(true);
    expect(mocks.sincronas, 'caiu no caminho caro mesmo com o lote entregando').toBe(0);
  });
});

describe('C3 · IA2: a janela deixou de custar um lote (mig 225)', () => {
  /**
   * 🔑 O furo que eu tinha DOCUMENTADO como "sem conserto por código nosso".
   *
   * Entre `createClaudeBatch` retornar e o `patch` gravar o id existe uma
   * janela. Se a run morre ali, `params.batchId` fica vazio — e eu concluí que
   * não havia saída porque a Batch API da Anthropic não expõe chave de
   * idempotência na criação.
   *
   * A conclusão estava errada: quem precisa lembrar do lote é o NOSSO rastro.
   * `ia_batches` já gravava a linha no instante da criação; faltava o `job_id`
   * (mig 225). Com ele, a retomada tem uma segunda fonte e a janela para de
   * custar um lote pago.
   */
  it('🔴 sem params.batchId, o lote é recuperado pelo RASTRO — não nasce outro', async () => {
    mocks.jobs.set(JOB, { ...structuredClone(jobBase), status: 'running' }); // params SEM batchId
    mocks.batchNoRastro = 'msgbatch_orfao';

    await rodar();

    expect(
      mocks.batchesCriados,
      'criou um lote novo ignorando o que já estava pago e registrado',
    ).toHaveLength(0);
    expect(mocks.loteConsultado, 'não chegou a consultar o lote recuperado').toBe(true);
  });

  it('sem params.batchId E sem rastro, aí sim cria (é a primeira execução)', async () => {
    mocks.jobs.set(JOB, { ...structuredClone(jobBase), status: 'running' });
    mocks.batchNoRastro = null;

    await rodar();

    expect(mocks.batchesCriados).toHaveLength(1);
  });
});

describe('C3 · IA2: chave idempotente por item', () => {
  it('🔴 cargo já persistido não é regravado NEM entra no lote', async () => {
    mocks.jobs.set(JOB, {
      ...structuredClone(jobBase), status: 'running', result_ids: ['Diretor'],
    });

    await rodar();

    expect(mocks.gravados, 'regravou um cargo que já estava pronto').toEqual(['Coordenador']);
    // 🔑 Pular no LOOP não basta: o custo de IA sai na SUBMISSÃO. Um item já
    // pronto que vai ao lote é pago de novo, mesmo que a resposta seja
    // descartada depois. Esta asserção nasceu de uma mutação no blueprint que
    // passou verde justamente por faltar ela.
    expect(
      mocks.enviadosAoLote,
      'o cargo já feito foi submetido ao lote — IA paga duas vezes',
    ).toEqual(['c1']);
  });

  it('o checkpoint é INCREMENTAL — result_ids cresce durante o lote, não só no fim', async () => {
    await rodar();

    const comResultIds = mocks.patches.filter((p) => Array.isArray(p?.result_ids));
    expect(
      comResultIds.length,
      'result_ids só apareceu no desfecho — um checkpoint que só existe no fim não retoma nada',
    ).toBeGreaterThan(1);
    expect(mocks.jobs.get(JOB).result_ids).toEqual(['Diretor', 'Coordenador']);
  });

  it('todos já persistidos → encerra sem tocar em IA', async () => {
    mocks.jobs.set(JOB, {
      ...structuredClone(jobBase), status: 'running', result_ids: ['Diretor', 'Coordenador'],
    });

    const r: any = await rodar();

    expect(r.retomado).toBe(true);
    expect(mocks.batchesCriados).toHaveLength(0);
    expect(mocks.sincronas).toBe(0);
    expect(mocks.gravados).toHaveLength(0);
  });
});

describe('C3 · IA2: reentrância', () => {
  it('🔴 job `done` retorna na hora — não cria batch nem regrava', async () => {
    mocks.jobs.set(JOB, { ...structuredClone(jobBase), status: 'done', result_ids: ['Diretor', 'Coordenador'] });

    const r: any = await rodar();

    expect(r.reentrante).toBe(true);
    expect(r.okCount).toBe(2);
    expect(mocks.batchesCriados).toHaveLength(0);
    expect(mocks.patches, 'reabriu o progresso de um job concluído').toHaveLength(0);
  });
});

describe('C3 · IA2: o fallback síncrono continua existindo', () => {
  it('cargo sem resposta no batch cai no síncrono (não some)', async () => {
    mocks.respostasBatch = new Map([['c0', '{"a":1}']]); // falta o c1

    await rodar();

    expect(mocks.sincronas, 'o cargo sem resposta no lote deveria ir ao síncrono').toBe(1);
    expect(mocks.gravados).toEqual(['Diretor', 'Coordenador']);
  });
});
