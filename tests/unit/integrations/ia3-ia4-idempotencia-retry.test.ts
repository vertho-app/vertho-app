import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * C3 passo 3 — IA3 e IA4: as tasks de DUAS ondas de lote pago.
 *
 * São as mais caras de repetir: um retry cego re-submeteria a geração E o check.
 * E as duas ondas falham independentemente — a run pode morrer entre elas, com o
 * primeiro lote já colhido e persistido.
 *
 * Por isso a idempotência aqui é DUPLA:
 *  · `params.batchIdGen` / `params.batchIdChk` — um id por onda, persistido
 *    ANTES do polling respectivo;
 *  · `params.geradosPorItem` (IA3) / `params.avaliados` (IA4) — o que a onda 1
 *    já entregou;
 *  · `params.checados` — o que a onda 2 já auditou.
 *
 * O teste que importa é o do MEIO: run que morre depois da geração e antes do
 * check não pode, ao voltar, regerar nada.
 */

const mocks = vi.hoisted(() => ({
  jobs: new Map<string, any>(),
  claudeCriados: [] as string[],
  openaiCriados: [] as string[],
  patches: [] as any[],
  /** Respostas dos lotes, por customId. */
  respGen: new Map<string, string>(),
  respChk: new Map<string, string>(),
  /** Chamadas ao caminho SÍNCRONO (o caro). */
  sincronasGen: 0,
  sincronasChk: 0,
  /** O que foi persistido em cada onda. */
  cenariosPersistidos: [] as string[],
  checksPersistidos: [] as string[],
  /** Faz o UPDATE que grava o batchId falhar — a JANELA (na forma real: { error }). */
  matarAntesDePersistir: false,
  /** O que `ia_batches` responde por (job, feature) — 2ª fonte da retomada. */
  batchNoRastro: null as string | null,
}));

vi.mock('@/lib/supabase', () => ({
  createSupabaseAdmin: () => criarClient(),
}));
vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => criarClient() }));

function criarClient() {
  const b: any = {
    _tabela: '', _id: null as string | null,
    select: () => b,
    eq: (_c: string, v: any) => { b._id = v; return b; },
    in: () => b,
    maybeSingle: async () => {
      if (b._tabela === 'ia_jobs') return { data: mocks.jobs.get(b._id) ?? null, error: null };
      if (b._tabela === 'banco_cenarios') return { data: { id: b._id, titulo: 'T' }, error: null };
      if (b._tabela === 'respostas') return { data: { id: b._id, avaliacao_ia: { nota: 3 } }, error: null };
      return { data: null, error: null };
    },
    update: (campos: any) => ({
      eq: async (_c: string, id: string) => {
        if (b._tabela === 'ia_jobs') {
          // A JANELA, na forma REAL do supabase-js: RESOLVE com `{ error }`.
          //
          // Só a PRIMEIRA gravação do id falha — é isso que a janela é: um
          // instante ruim, não um banco permanentemente quebrado. Matar todos os
          // checkpoints seguintes mediria outra coisa (e derrubaria a run por um
          // `patchCritico` posterior, escondendo o que este caso quer ver).
          if (mocks.matarAntesDePersistir && (campos?.params?.batchIdGen || campos?.params?.batchIdChk)) {
            mocks.matarAntesDePersistir = false;
            return { error: { message: 'runtime morreu antes de persistir o batchId' } };
          }
          mocks.patches.push(campos);
          mocks.jobs.set(id, { ...mocks.jobs.get(id), ...campos });
        }
        return { error: null };
      },
    }),
    then: (res: any) => Promise.resolve({ data: [], error: null }).then(res),
  };
  return { from: (t: string) => { b._tabela = t; b._id = null; return b; } };
}

vi.mock('@/lib/ai-batch', () => ({
  createClaudeBatch: async () => {
    const id = `claude_${mocks.claudeCriados.length + 1}`;
    mocks.claudeCriados.push(id);
    return id;
  },
  createOpenAIBatch: async () => {
    const id = `openai_${mocks.openaiCriados.length + 1}`;
    mocks.openaiCriados.push(id);
    return id;
  },
  pollClaudeBatch: async () => ({ ended: true, counts: { processing: 0, succeeded: 1, errored: 0, canceled: 0, expired: 0 } }),
  pollOpenAIBatch: async () => ({ ended: true, status: 'completed', outputFileId: 'file-1', errorFileId: null }),
  fetchClaudeBatchResults: async (id: string) => (String(id).startsWith('claude_1') ? mocks.respGen : mocks.respChk),
  fetchOpenAIBatchResults: async () => mocks.respChk,
  encerrarBatch: async () => undefined,
  batchPendenteDoJob: async () => mocks.batchNoRastro,
}));

vi.mock('@trigger.dev/sdk', () => ({ task: (cfg: any) => cfg, wait: { for: async () => undefined } }));
vi.mock('@/actions/utils', () => ({ extractJSON: async (t: string) => (t ? JSON.parse(t) : null) }));
vi.mock('@/actions/ai-client', () => ({ callAI: async () => '{}' }));

// ── IA3 ────────────────────────────────────────────────────────────────────
vi.mock('@/lib/ia3-cenarios', () => ({
  montarContextoIA3: async () => ({ ctx: { comp: { id: 'comp-1' }, descritores: [1], tdb: {}, empresa: {}, cargoDetalhe: {}, valores: null, contextoPPP: '', gabCIS: null } }),
  buildIA3SystemPrompt: () => 'S',
  buildIA3UserPrompt: () => 'U',
  validarRespostaIA3: () => ({ errors: [], cen: { titulo: 'T', contexto: 'C' }, perguntas: [], titulo: 'T', contexto: 'C' }),
  montarAlternativasIA3: () => ({}),
  persistirCenarioIA3: async () => {
    const id = `cen_${mocks.cenariosPersistidos.length + 1}`;
    mocks.cenariosPersistidos.push(id);
    return { cenarioId: id };
  },
  montarCheckIA3Prompt: async () => ({ system: 'S', user: 'U' }),
  normalizarResultadoCheckIA3: () => ({ resultado: { nota: 80 }, statusCheck: 'aprovado' }),
  persistirCheckIA3: async (_sb: any, cen: any) => { mocks.checksPersistidos.push(cen.id); return {}; },
  gerarCenarioIA3Core: async () => { mocks.sincronasGen++; return { success: true, cenarioId: 'cen_sync' }; },
  checkCenarioIA3Core: async () => { mocks.sincronasChk++; return { success: true, nota: 70 }; },
}));

const JOB = 'job-x';

beforeEach(() => {
  mocks.claudeCriados = []; mocks.openaiCriados = []; mocks.patches = [];
  mocks.sincronasGen = 0; mocks.sincronasChk = 0;
  mocks.cenariosPersistidos = []; mocks.checksPersistidos = [];
  mocks.respGen = new Map([['i0', '{"x":1}']]);
  mocks.respChk = new Map([['k0', '{"y":1}']]);
  mocks.matarAntesDePersistir = false;
  mocks.batchNoRastro = null;
});

function jobIA3(extra: any = {}) {
  return {
    id: JOB, status: 'queued', empresa_id: 'emp-1', result_ids: [],
    params: {
      aiConfig: { model: 'claude-sonnet-4-6', checkModel: 'gpt-5.6-terra' },
      items: [{ cargo: 'Diretor', competencia_id: 'c1', ppp_escola_id: null, nome: 'Ana' }],
      ...extra,
    },
  };
}

/**
 * O 2º argumento do `run` é o SDK quem passa; `ctx.attempt.number` é o que
 * decide se o `catch` grava `status: 'error'` ou mantém `running`.
 */
const ctxDaTentativa = (numero = 1, maxAttempts = 3) => ({
  ctx: { attempt: { number: numero }, run: { maxAttempts } },
});

async function rodarIA3(tentativa = 1, maxAttempts = 3) {
  const mod = await import('@/trigger/gerar-ia3-batch');
  return (mod as any).gerarIA3BatchTask.run({ jobId: JOB }, ctxDaTentativa(tentativa, maxAttempts));
}

describe('C3 · IA3: duas ondas, dois ids persistidos', () => {
  it('persiste batchIdGen e batchIdChk, cada um antes do seu polling', async () => {
    mocks.jobs = new Map([[JOB, jobIA3()]]);

    await rodarIA3();

    const params = mocks.jobs.get(JOB).params;
    expect(params.batchIdGen, 'o id da GERAÇÃO não foi persistido').toBe('claude_1');
    expect(params.batchIdChk, 'o id do CHECK não foi persistido').toBe('openai_1');
  });

  /**
   * 🔑 O caso que dá nome ao passo: a run morre ENTRE as ondas. Ao voltar, a
   * geração não pode acontecer de novo — ela já foi paga e persistida.
   */
  it('🔴 retomada DEPOIS da geração não regera cenário nenhum', async () => {
    mocks.jobs = new Map([[JOB, {
      ...jobIA3({
        batchIdGen: 'claude_ja',
        geradosPorItem: { 'Diretor::c1::': 'cen_ja' },
      }),
      status: 'running',
    }]]);

    await rodarIA3();

    expect(mocks.claudeCriados, 'recriou o lote de GERAÇÃO já pago').toHaveLength(0);
    expect(mocks.sincronasGen, 'caiu no síncrono para um cenário que já existia').toBe(0);
    expect(mocks.cenariosPersistidos, 'regravou cenário').toHaveLength(0);
  });

  it('retomada DEPOIS do check não recheca', async () => {
    mocks.jobs = new Map([[JOB, {
      ...jobIA3({
        geradosPorItem: { 'Diretor::c1::': 'cen_ja' },
        checados: ['cen_ja'],
      }),
      status: 'running',
    }]]);

    await rodarIA3();

    expect(mocks.openaiCriados, 'recriou o lote de CHECK já pago').toHaveLength(0);
    expect(mocks.sincronasChk).toBe(0);
    expect(mocks.checksPersistidos).toHaveLength(0);
  });

  it('o checkpoint é INCREMENTAL nas duas ondas', async () => {
    mocks.jobs = new Map([[JOB, jobIA3()]]);

    await rodarIA3();

    const comGerados = mocks.patches.filter((p) => p?.params?.geradosPorItem && Object.keys(p.params.geradosPorItem).length);
    const comChecados = mocks.patches.filter((p) => Array.isArray(p?.params?.checados) && p.params.checados.length);
    expect(comGerados.length, 'geradosPorItem só apareceu no fim — não retoma nada').toBeGreaterThan(0);
    expect(comChecados.length, 'checados só apareceu no fim — não retoma nada').toBeGreaterThan(0);
  });

  /**
   * 5º PRÉ-REQUISITO — a falha ENTRE submeter e persistir. Manuscrito e IA2 já
   * tinham; IA3/IA4 não, e sem ele o plano não autoriza conceder `retry`.
   *
   * O que se prova: falhar ao GRAVAR o id não descarta o lote pago. Antes, o
   * erro caía no catch do bloco de batch — que trata tudo como "batch
   * indisponível" — e desviava para o síncrono, pagando o caro por cima do que
   * já ia entregar.
   */
  it('🔴 falha ao persistir o batchIdGen NÃO descarta o lote pago', async () => {
    mocks.jobs = new Map([[JOB, jobIA3()]]);
    mocks.matarAntesDePersistir = true;

    await rodarIA3();

    expect(mocks.claudeCriados, 'o lote foi criado e pago').toHaveLength(1);
    expect(
      mocks.sincronasGen,
      'caiu no caminho caro por um erro de GRAVAÇÃO, com o lote entregando',
    ).toBe(0);
    expect(mocks.cenariosPersistidos, 'o resultado do lote não foi colhido').toHaveLength(1);
  });

  /**
   * E o outro lado da mesma janela: se a run morre ali, o id não está em
   * `params` — mas está no rastro (mig 225). A retomada não pode criar outro.
   */
  it('🔴 sem batchIdGen em params, a geração é recuperada pelo RASTRO', async () => {
    mocks.jobs = new Map([[JOB, { ...jobIA3(), status: 'running' }]]);
    mocks.batchNoRastro = 'claude_orfao';

    await rodarIA3();

    expect(
      mocks.claudeCriados,
      'criou lote novo ignorando o que já estava pago e registrado em ia_batches',
    ).toHaveLength(0);
  });

  it('🔴 job `done` não reexecuta (aqui custaria DOIS lotes)', async () => {
    mocks.jobs = new Map([[JOB, { ...jobIA3(), status: 'done', result_ids: ['cen_1'] }]]);

    const r: any = await rodarIA3();

    expect(r.reentrante).toBe(true);
    expect(mocks.claudeCriados).toHaveLength(0);
    expect(mocks.openaiCriados).toHaveLength(0);
    expect(mocks.patches).toHaveLength(0);
  });
});
