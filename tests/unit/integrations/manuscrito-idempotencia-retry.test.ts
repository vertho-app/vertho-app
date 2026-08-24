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
  /**
   * Faz a gravação do batchId falhar — simula a morte na janela.
   *
   * ⚠️ Só a PRIMEIRA. A janela é um INSTANTE ruim, não um banco permanentemente
   * quebrado: matar toda gravação que mencione o `batchId` derrubava o
   * `patchCritico` do `done` lá no fim e escondia o que o caso mede.
   */
  matarAntesDePersistir: false,
  gravacoesDoBatchIdMortas: 0,
  /** O lote chegou a ser consultado/colhido? (prova que não foi descartado) */
  loteConsultado: false,
  /** O que `ia_batches` responde quando params.batchId não foi gravado. */
  batchNoRastro: null as string | null,
  /** Ids que a AUDITORIA Dual-IA recebeu — ~US$0,10 cada, é onde o retry doeria. */
  auditados: [] as string[][],
  /** Módulos que o banco diz ainda NÃO ter `auditoria_ia` preenchida. */
  semVeredito: ['mod-1'] as string[],
  /** Ids que `persistirModulo` devolve, na ordem das chamadas. */
  idsPersistidos: ['mod-1'] as string[],
  chamadasPersistir: 0,
  /** Faz a leitura de quem ja tem veredito devolver { error }. */
  erroNoVeredito: false,
  /** Faz a gravacao do `done` falhar (era best-effort; virou checkpoint). */
  matarODone: false,
}));

vi.mock('@/lib/supabase', () => ({
  createSupabaseAdmin: () => ({
    from: (tabela: string) => {
      const builder: any = {
        _id: null as string | null,
        _in: null as string[] | null,
        select: () => builder,
        eq: (_c: string, v: any) => { builder._id = v; return builder; },
        /**
         * ⚠️ `.in()` faltava, e o efeito era invisível: a consulta de quem já
         * tem veredito explodia com TypeError DENTRO do try da auditoria, que
         * loga e segue. O teste passava verde sem nunca exercitar o caminho.
         */
        in: (_c: string, ids: string[]) => { builder._in = ids; return builder; },
        /**
         * 🔑 O `.in()` FILTRA de verdade. Ignora-lo tornava a lista de auditoria
         * independente de `idsCriados`, e a mutacao "os ids nao atravessam a
         * retomada" passava verde neste caso (medido em 24/08).
         */
        is: async () => (mocks.erroNoVeredito
          ? { data: null, error: { message: 'timeout ao ler auditoria_ia' } }
          : {
            data: mocks.semVeredito
              .filter((id) => !builder._in || builder._in.includes(id))
              .map((id) => ({ id })),
            error: null,
          }),
        maybeSingle: async () => ({ data: mocks.jobs.get(builder._id) ?? null, error: null }),
        update: (campos: any) => {
          const alvo = { ...campos };
          return {
            eq: async (_c: string, id: string) => {
              if (tabela === 'ia_jobs') {
                // A morte na janela, na forma REAL do supabase-js: a promise
                // RESOLVE com `{ error }` — não lança. Usar `throw` aqui era o
                // que escondia o `patch` sem checagem de erro.
                if (mocks.matarODone && alvo?.status === 'done') {
                  return { error: { message: 'pool esgotado' } };
                }
                if (mocks.matarAntesDePersistir && alvo?.params?.batchId && !mocks.gravacoesDoBatchIdMortas) {
                  mocks.gravacoesDoBatchIdMortas++;
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
  persistirModuloDeManuscrito: async () => ({ id: mocks.idsPersistidos[mocks.chamadasPersistir++] ?? 'mod-x' }),
}));

/**
 * O nome importa: era `persistirModulo` aqui e `persistirModuloDeManuscrito` na
 * task. O mock nao casava, a persistencia real nunca rodava, `idsCriados` ficava
 * VAZIO e a auditoria do passo 5 jamais era exercitada. O arquivo passava verde.
 */
vi.mock('@/lib/modulo-base-autor', () => ({
  extractCorpo: (t: string) => (t ? { titulo: 'M', conteudo_central: {} } : null),
  validarCorpo: () => [] as string[],
}));

vi.mock('@/actions/ai-client', () => ({
  // Sem este mock a task chamava a API de verdade, falhava por credencial e
  // TODO modulo virava 'IA falhou' — de novo com `idsCriados` vazio.
  callAI: async () => JSON.stringify({ titulo: 'M', conteudo_central: {} }),
}));

/**
 * A auditoria Dual-IA custa ~US$0,10 por módulo e roda FORA do batch. Era o
 * ponto onde uma retomada pagava de novo sem que nada indicasse.
 */
vi.mock('@/lib/modulo-base-auditor', () => ({
  auditarModulosCore: async (_sb: any, ids: string[], opts: any) => {
    mocks.auditados.push([...ids]);
    for (const id of ids) await opts?.onItem?.(id, true);
    return { ok: ids.length, falhas: [] as string[] };
  },
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
  mocks.gravacoesDoBatchIdMortas = 0;
  mocks.loteConsultado = false;
  mocks.batchNoRastro = null;
  mocks.auditados = [];
  mocks.semVeredito = ['mod-1'];
  mocks.idsPersistidos = ['mod-1'];
  mocks.chamadasPersistir = 0;
  mocks.erroNoVeredito = false;
  mocks.matarODone = false;
});

/**
 * O 2º argumento do `run` é o SDK quem passa; `ctx.attempt.number` é o que
 * decide se o `catch` grava `status: 'error'` ou mantém `running`.
 */
const ctxDaTentativa = (numero = 1, maxAttempts = 3) => ({
  ctx: { attempt: { number: numero }, run: { maxAttempts } },
});

async function rodar(tentativa = 1, maxAttempts = 3) {
  const mod = await import('@/trigger/gerar-modulos-manuscrito');
  const t: any = (mod as any).gerarModulosManuscritoTask;
  return t.run({ jobId: JOB }, ctxDaTentativa(tentativa, maxAttempts));
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
    expect(
      mocks.gravacoesDoBatchIdMortas,
      'a gravação do batchId não chegou a falhar — a janela não foi exercitada',
    ).toBe(1);

    /**
     * 🔑 Medido ao rodar este caso depois do acumulador de params (24/08): o id
     * NÃO se perde mais. `salvarParams` guarda em memória antes de gravar, então
     * o checkpoint do `done` o carrega junto — a run fecha com o rastro completo.
     * Antes, o `{ ...pp, batchId }` cru morria com a gravação que falhou.
     *
     * Isso NÃO apaga a janela: se a run morrer entre a falha e o fim, nada é
     * gravado. É exatamente para esse resto que existe a 2ª fonte (`ia_batches`,
     * mig 225) exercitada no caso seguinte.
     */
    const job = mocks.jobs.get(JOB);
    expect(job.params.batchId, 'o id sumiu junto com a gravação que falhou').toBe('msgbatch_1');

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
    // A run morre de vez: nem o fechamento grava o id. É o pior caso da janela.
    mocks.jobs.set(JOB, { ...structuredClone(jobBase), status: 'running' });
    mocks.batchNoRastro = 'msgbatch_orfao';

    await rodar();

    // `createClaudeBatch` chama `registrarBatch` internamente (mockado aqui), e é
    // essa linha que a retomada — e o script de órfãos — leem. Sem ela, o lote
    // pago seria invisível: era exatamente o C2.
    expect(
      mocks.batchesCriados,
      'criou um lote NOVO ignorando o que já estava pago e registrado',
    ).toHaveLength(0);
    expect(mocks.loteConsultado, 'o lote do rastro não foi colhido').toBe(true);
  });
});

/**
 * ── O que esta task exigiu ALÉM das outras para o retry ficar seguro ───────
 *
 * A idempotência daqui é por EXISTÊNCIA no banco (`modulosExistentes`), não por
 * chave em `params`: o módulo já criado é PULADO na tentativa seguinte. Barato
 * — e foi por isso que passou despercebido que a lista de ids ficava na RUN.
 *
 * Uma segunda tentativa perdia de vista os módulos da primeira, e com eles:
 *  · a AUDITORIA Dual-IA, que roda sobre essa lista — o gate que de fato
 *    reprova simplesmente não passaria neles, e ficariam publicáveis sem nota;
 *  · o `result_ids`, que REGREDIA — a tela mostrando menos do que o job criou.
 *
 * Nenhum dos dois aparece como erro em lugar nenhum.
 */
describe('C3 · manuscrito: os ids atravessam a retomada', () => {
  it('🔴 o módulo criado numa tentativa anterior continua no `result_ids`', async () => {
    mocks.jobs.set(JOB, {
      ...structuredClone(jobBase), status: 'running',
      params: { ...jobBase.params, modulosCriados: ['mod-anterior'] },
    });

    await rodar();

    expect(
      mocks.jobs.get(JOB).result_ids,
      'o job esqueceu o que criou na tentativa anterior — a tela mostra menos módulos do que existem',
    ).toEqual(['mod-anterior', 'mod-1']);
  });

  it('🔴 o módulo da tentativa anterior TAMBÉM é auditado', async () => {
    mocks.jobs.set(JOB, {
      ...structuredClone(jobBase), status: 'running',
      params: { ...jobBase.params, modulosCriados: ['mod-anterior'] },
    });
    mocks.semVeredito = ['mod-anterior', 'mod-1']; // nenhum dos dois tem veredito

    await rodar();

    expect(
      mocks.auditados[0],
      'o módulo da tentativa anterior ficou sem o gate Dual-IA — publicável sem nota, e nada acusa',
    ).toEqual(['mod-anterior', 'mod-1']);
  });

  /**
   * O outro lado da mesma moeda: auditar de novo o que já tem veredito é pagar
   * ~US$0,10 por módulo por nada. A chave por item vem do BANCO (`auditoria_ia`
   * preenchida), que é a fonte da verdade — um checkpoint em `params` diria o
   * mesmo e ainda poderia estar defasado.
   */
  it('🔴 quem JÁ tem veredito não é auditado de novo', async () => {
    mocks.jobs.set(JOB, {
      ...structuredClone(jobBase), status: 'running',
      params: { ...jobBase.params, modulosCriados: ['mod-anterior'] },
    });
    mocks.semVeredito = ['mod-1']; // 'mod-anterior' já foi auditado antes

    await rodar();

    expect(
      mocks.auditados[0],
      'repagou a auditoria de um módulo que já tinha veredito',
    ).toEqual(['mod-1']);
  });

  it('todos já auditados: a auditoria nem é chamada', async () => {
    mocks.jobs.set(JOB, {
      ...structuredClone(jobBase), status: 'running',
      params: { ...jobBase.params, modulosCriados: ['mod-anterior'] },
    });
    mocks.semVeredito = [];

    await rodar();

    expect(mocks.auditados, 'chamou a auditoria com lista vazia').toEqual([]);
  });

  /**
   * ⚠️ Se a LEITURA de quem já tem veredito falhar, audita TODOS. O gate vale
   * mais que os centavos: módulo publicável sem veredito é o estrago maior.
   */
  it('leitura do veredito falhando → audita todos (fail-safe pelo GATE, não pelo custo)', async () => {
    mocks.erroNoVeredito = true;
    mocks.jobs.set(JOB, {
      ...structuredClone(jobBase), status: 'running',
      params: { ...jobBase.params, modulosCriados: ['mod-anterior'] },
    });

    await rodar();

    expect(mocks.auditados[0]).toEqual(['mod-anterior', 'mod-1']);
  });

  /**
   * O `done` era `patch` (best-effort). Uma gravação que falha em silêncio ali
   * deixa o job `running` PARA SEMPRE: polling eterno na tela e a fase travada
   * pelo guard anti-duplicata, que só libera em `done`/`error`/`cancelled`.
   */
  it('🔴 o `done` é CHECKPOINT: se não gravar, a run falha alto', async () => {
    mocks.matarODone = true;
    await expect(rodar()).rejects.toThrow(/checkpoint não gravado/);
  });

  it('o `done` carrega o params ACUMULADO, não o lido no início', async () => {
    await rodar();
    const job = mocks.jobs.get(JOB);
    expect(job.status).toBe('done');
    expect(job.params.batchId, 'o batchId gravado durante a run sumiu no fechamento').toBe('msgbatch_1');
    expect(job.params.modulosCriados).toEqual(['mod-1']);
    expect(job.params.docxBase64, 'o DOCX de 360KB continuou no job').toBeUndefined();
  });
});
