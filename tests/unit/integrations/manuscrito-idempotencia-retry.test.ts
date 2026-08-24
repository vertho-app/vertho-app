import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * C3 (auditoria 22/08) — os pré-requisitos da idempotência, ANTES de qualquer
 * `retry`.
 *
 * `gerar-modulos-manuscrito` é a única das quatro tasks que submetem lote pago
 * com um padrão retomável: `batchId` persistido em `ia_jobs.params`, retomada
 * pelo mesmo id, e chave por item (`modulosExistentes`). Faltavam dois pontos —
 * e é isto que este arquivo fecha:
 *
 *  1. **early-return de `done`** — sem ele, reexecutar um job concluído
 *     re-parseia o DOCX e, com `substituirExistentes`, REGERA tudo pagando a IA
 *     de novo. É justamente o modo que o admin usa para corrigir um lote ruim;
 *  2. **teste de falha ENTRE a submissão e a persistência** — o caso que o
 *     próprio retry cria, e que o plano exige exercitar antes de ligá-lo.
 *
 * 🔑 O QUE ESTE ARQUIVO NÃO PODE PROMETER, e por isso está escrito:
 * a janela entre `createClaudeBatch` retornar e o `patch()` gravar o id não tem
 * como ser fechada por código nosso — a Batch API da Anthropic não expõe chave
 * de idempotência na criação. Morrer exatamente ali custa UM lote duplicado.
 * O que dá para garantir é que ela seja a ÚNICA janela, que seja pequena (a
 * gravação é a instrução seguinte) e que ninguém ligue `retry` achando que ela
 * não existe. Os dois casos abaixo medem os dois lados disso.
 */

const mocks = vi.hoisted(() => ({
  /** Estado do `ia_jobs` por id. */
  jobs: new Map<string, any>(),
  /** Cada chamada de criação de batch (é o que custa dinheiro). */
  batchesCriados: [] as string[],
  /** `patch()` aplicados, na ordem. */
  patches: [] as any[],
  /** Faz o `patch` que grava o batchId falhar — simula a morte na janela. */
  matarAntesDePersistir: false,
  /** O lote chegou a ser consultado/colhido? (prova que não foi descartado) */
  loteConsultado: false,
  /** O que `ia_batches` responde quando params.batchId não foi gravado. */
  batchNoRastro: null as string | null,
}));

vi.mock('@/lib/supabase', () => ({
  createSupabaseAdmin: () => ({
    from: (tabela: string) => {
      const builder: any = {
        _id: null as string | null,
        select: () => builder,
        eq: (_c: string, v: any) => { builder._id = v; return builder; },
        maybeSingle: async () => ({ data: mocks.jobs.get(builder._id) ?? null, error: null }),
        update: (campos: any) => {
          const alvo = { ...campos };
          return {
            eq: async (_c: string, id: string) => {
              if (tabela === 'ia_jobs') {
                // A morte na janela, na forma REAL do supabase-js: a promise
                // RESOLVE com `{ error }` — não lança. Usar `throw` aqui era o
                // que escondia o `patch` sem checagem de erro.
                if (mocks.matarAntesDePersistir && alvo?.params?.batchId) {
                  return { error: { message: 'runtime morreu antes de persistir o batchId' } };
                }
                mocks.patches.push(alvo);
                mocks.jobs.set(id, { ...mocks.jobs.get(id), ...alvo });
              }
              return { error: null };
            },
          };
        },
        insert: async () => ({ error: null }),
      };
      return builder;
    },
  }),
}));

vi.mock('@/lib/ai-batch', () => ({
  createClaudeBatch: async () => {
    const id = `msgbatch_${mocks.batchesCriados.length + 1}`;
    mocks.batchesCriados.push(id);
    return id;
  },
  pollClaudeBatch: async () => {
    mocks.loteConsultado = true;
    return { ended: true, counts: { processing: 0, succeeded: 1, errored: 0, canceled: 0, expired: 0 } };
  },
  fetchClaudeBatchResults: async () => new Map<string, string>(),
  encerrarBatch: async () => undefined,
  /** 2ª fonte da retomada (mig 225): o rastro em `ia_batches` por (job, feature). */
  batchPendenteDoJob: async () => mocks.batchNoRastro,
  type: {},
}));

vi.mock('@trigger.dev/sdk', () => ({
  task: (cfg: any) => cfg,
  wait: { for: async () => undefined },
}));

vi.mock('@/lib/manuscrito-parser', () => ({
  parsearManuscrito: async () => ({ cod_comp: 'C1', titulo: 'T', cargo: 'X', descritores: [], recursos: [], stats: {} }),
  TRANSICOES: [],
}));
vi.mock('@/lib/manuscrito-modulos', () => ({
  resolverDescritores: async () => ({ resolvidos: [{ comp: { id: 'comp-1' } }] }),
  montarReqsManuscrito: () => [
    { customId: 'req-0', system: 'S', user: 'U', comp: { id: 'comp-1' }, nivel_entrada: 'N1', nivel_destino: 'N2' },
  ],
  modulosExistentes: async () => new Set<string>(),
  chaveModulo: (c: string, a: string, b: string) => `${c}:${a}:${b}`,
  persistirModulo: async () => ({ id: 'mod-1' }),
}));

const JOB = 'job-1';
const jobBase = {
  id: JOB, status: 'queued', result_ids: [],
  params: { docxBase64: Buffer.from('x').toString('base64'), empresaId: 'emp-1', locale: 'pt-BR' },
};

beforeEach(() => {
  mocks.jobs = new Map([[JOB, structuredClone(jobBase)]]);
  mocks.batchesCriados = [];
  mocks.patches = [];
  mocks.matarAntesDePersistir = false;
  mocks.loteConsultado = false;
  mocks.batchNoRastro = null;
});

async function rodar() {
  const mod = await import('@/trigger/gerar-modulos-manuscrito');
  const t: any = (mod as any).gerarModulosManuscritoTask;
  return t.run({ jobId: JOB });
}

describe('C3 · reentrância: job já concluído não reexecuta', () => {
  it('🔴 job `done` retorna na hora — não re-parseia nem cria batch', async () => {
    mocks.jobs.set(JOB, { ...structuredClone(jobBase), status: 'done', result_ids: ['mod-1', 'mod-2'] });

    const r: any = await rodar();

    expect(r.reentrante).toBe(true);
    expect(r.okCount).toBe(2);
    expect(mocks.batchesCriados, 'reexecutar um job done criou batch — é IA repaga').toHaveLength(0);
    expect(mocks.patches, 'reexecutar um job done reabriu o progresso').toHaveLength(0);
  });

  it('job `running` SEGUE adiante — é aí que mora a retomada', async () => {
    mocks.jobs.set(JOB, { ...structuredClone(jobBase), status: 'running' });
    await rodar();
    expect(mocks.batchesCriados.length + mocks.patches.length).toBeGreaterThan(0);
  });
});

describe('C3 · a janela entre submeter e persistir', () => {
  it('com o batchId JÁ persistido, o retry retoma o mesmo lote (não recria)', async () => {
    mocks.jobs.set(JOB, {
      ...structuredClone(jobBase),
      status: 'running',
      params: { ...jobBase.params, batchId: 'msgbatch_ja_existente' },
    });

    await rodar();

    expect(
      mocks.batchesCriados,
      'o retry recriou o batch mesmo com o id persistido — é o lote pago duas vezes',
    ).toHaveLength(0);
  });

  /**
   * 🔑 ERRO DE PERSISTÊNCIA ≠ ERRO DE FORNECEDOR — a distinção que este caso
   * mediu, e que passou a valer nas duas tasks.
   *
   * Antes: falhar ao gravar o `batchId` caía no `catch` do bloco de batch, que
   * trata tudo como "batch indisponível" e desvia para o FALLBACK SÍNCRONO. Numa
   * única execução pagava-se **o lote órfão + o caminho caro** — sem retry
   * nenhum envolvido. O lote estava pago e ia entregar; o código o descartava.
   *
   * Agora a falha de gravação é gritada e a run SEGUE com o id em memória: o
   * lote é consultado e colhido normalmente. O que sobra de risco é só a run
   * MORRER nessa janela — e aí o lote fica órfão RASTREÁVEL (`ia_batches`).
   */
  it('🔴 falha ao persistir o batchId NÃO descarta o lote pago', async () => {
    mocks.matarAntesDePersistir = true;

    const r: any = await rodar();
    expect(r.ok).toBe(true);

    expect(mocks.batchesCriados, 'o lote foi criado e pago').toHaveLength(1);
    expect(
      mocks.loteConsultado,
      'o lote pago foi DESCARTADO por um erro de gravação — é o caminho caro por cima do que já ia entregar',
    ).toBe(true);
    const job = mocks.jobs.get(JOB);
    expect(
      job.params.batchId,
      'o id chegou a ser persistido — a janela não foi exercitada',
    ).toBeUndefined();

    // 🔑 E aqui a notícia boa, que só apareceu ao exercitar: o early-return de
    // `done` CONTÉM o estrago. A task terminou (pelo síncrono), marcou `done`, e
    // a execução seguinte para na porta — o lote órfão não vira um segundo lote.
    // Sem o early-return, este `rodar()` re-parsearia e criaria outro.
    await rodar();
    expect(
      mocks.batchesCriados,
      'a segunda execução criou outro lote — o early-return de `done` não conteve',
    ).toHaveLength(1);
  });

  /**
   * O custo residual, dito em número: UM lote pago que ninguém colhe.
   *
   * Ele não é recuperável por retomada (o id não foi gravado em lugar nenhum),
   * mas É visível — `registrarBatch` grava a linha em `ia_batches` no momento da
   * criação, então o `_batches-orfaos.mjs` passa a enxergá-lo depois de 2 h.
   * Órfão detectável é dívida; órfão invisível era o C2.
   */
  it('o lote órfão fica RASTREÁVEL (é o que separa este caso do C2)', async () => {
    mocks.matarAntesDePersistir = true;
    await rodar();
    expect(mocks.batchesCriados).toHaveLength(1);
    // `createClaudeBatch` chama `registrarBatch` internamente (mockado aqui),
    // e é essa linha que o script de órfãos lê. O contrato está no ai-batch.
    expect(mocks.jobs.get(JOB).params.batchId).toBeUndefined();
  });
});
