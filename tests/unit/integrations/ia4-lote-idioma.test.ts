import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

/**
 * Onda F (04/10/2026): o LOTE da IA4 (`gerar-ia4-batch`) segue o mesmo desenho do síncrono.
 *
 *  1. a request de nota vai ao batch com `locale: 'pt-BR'` EXPLÍCITO (o JSON é consolidado por nome de descritor;
 *     no lote o padrão já era pt-BR, agora é uma decisão escrita e não uma coincidência);
 *  2. o texto que volta do lote é persistido por `consolidarEPersistirIA4`, que reescreve a devolutiva no idioma da
 *     pessoa (uma chamada `ia4_feedback` por pessoa que não é pt-BR) sem tocar na nota nem no nome do descritor.
 *
 * `consolidarEPersistirIA4` é o REAL: o que se mocka é só a montagem do contexto e do prompt.
 */

const h = vi.hoisted(() => ({
  sb: null as any,
  jobs: new Map<string, any>(),
  lote: [] as any[],
  respostasBatch: new Map<string, string>(),
  callAI: vi.fn(),
  locale: { pessoa: null as string | null, empresa: null as string | null },
}));

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => h.sb.client }));
vi.mock('@trigger.dev/sdk', () => ({ task: (cfg: any) => cfg, wait: { for: async () => undefined } }));
vi.mock('@/actions/ai-client', () => ({ callAI: h.callAI, callAIChat: vi.fn() }));
vi.mock('@/lib/ai-tasks', () => ({ getModelForTask: async () => 'modelo-da-task', DEFAULT_TASK_MODELS: {} }));
vi.mock('@/lib/ai-batch', () => ({
  createClaudeBatch: async (reqs: any[]) => { h.lote = reqs; return 'msgbatch_1'; },
  createOpenAIBatch: async () => 'openai_1',
  pollClaudeBatch: async () => ({ ended: true, counts: { processing: 0, succeeded: 1, errored: 0, canceled: 0, expired: 0 } }),
  pollOpenAIBatch: async () => ({ ended: true, counts: {} }),
  fetchClaudeBatchResults: async () => h.respostasBatch,
  fetchOpenAIBatchResults: async () => new Map(),
  encerrarBatch: async () => undefined,
  batchPendenteDoJob: async () => null,
}));
vi.mock('@/lib/check-ia4-core', () => ({
  montarCheckIA4Prompt: vi.fn(), processCheckResult: vi.fn(), persistirCheckIA4: vi.fn(), checarUmaRespostaCore: vi.fn(),
}));
vi.mock('@/lib/ia4-avaliacao', async (importOriginal) => ({
  ...(await importOriginal<any>()),
  carregarContextoLoteIA4: async () => ({ empresa: { nome: 'Rede' }, contextoPPP: '' }),
  carregarContextoRespostaIA4: async () => ({ compNome: 'Comp', compCod: 'C1', descritoresTexto: 'D1', descsOficiais: [], cenarioTexto: '', perguntasTexto: '' }),
  buildIA4UserPrompt: () => ({ cachedUserPrefix: 'PREFIXO', user: 'USER' }),
  comModeloDaTask: async () => ({ model: 'claude-sonnet-5' }),
}));

const COLAB = { id: 'c1', nome_completo: 'Ana Souza', cargo: 'Professor(a)', perfil_dominante: 'C' };
const RESP = { id: 'r1', empresa_id: 'emp-1', colaborador_id: 'c1', competencia_nome: 'Comp', cargo: 'Professor(a)', r1: 'a', r2: 'b', r3: 'c', r4: 'd' };
const JOB = 'job-ia4';
const D1 = 'Escuta ativa das partes';
const IA4_JSON = JSON.stringify({
  avaliacao_por_descritor: [{ numero: 1, nome: D1, nota_decimal: 2.5, nivel_sugerido: 2, confianca: 0.8, evidencias: [], racional: 'ok' }],
  descritores_destaque: { pontos_fortes: [{ descritor: D1, nivel: 2 }], gaps_prioritarios: [] },
  feedback: { resumo_geral: 'Resumo em português.', mensagem_positiva: 'Positiva.', mensagem_construtiva: 'Construtiva.' },
});

function montar() {
  h.sb = criarSupabaseMock({
    resolver: (tabela: string) => {
      if (tabela === 'ia_jobs') return h.jobs.get(JOB) ?? null;
      if (tabela === 'colaboradores') return { ...COLAB, locale: h.locale.pessoa };
      if (tabela === 'empresas') return { default_locale: h.locale.empresa };
      return null;
    },
    lista: (tabela: string) => (tabela === 'respostas' ? [RESP] : tabela === 'colaboradores' ? [COLAB] : []),
    escrita: (tabela: string) => (tabela === 'respostas' ? [{ id: 'r1' }] : null),
  });
}

beforeEach(() => {
  h.jobs = new Map([[JOB, { id: JOB, status: 'queued', empresa_id: 'emp-1', result_ids: [], params: { items: [{ id: 'r1' }], aiConfig: { model: 'claude-sonnet-5' } } }]]);
  h.lote = [];
  h.respostasBatch = new Map([['i0', IA4_JSON]]);
  h.locale = { pessoa: null, empresa: null };
  h.callAI.mockReset();
  h.callAI.mockResolvedValue(JSON.stringify({ resumo_geral: 'Summary in English.', mensagem_positiva: 'Positive.', mensagem_construtiva: 'Constructive.' }));
  montar();
});

const rodar = async () => (await import('@/trigger/gerar-ia4-batch') as any).gerarIA4BatchTask.run({ jobId: JOB }, { ctx: { attempt: { number: 1 }, run: { maxAttempts: 3 } } });
const gravacao = () => h.sb.escritas.find((e: any) => e.tabela === 'respostas' && e.op === 'update').payload;

describe('lote da IA4: a nota em pt-BR, a devolutiva no idioma da pessoa', () => {
  it('a request de nota vai ao batch com `locale: pt-BR` explícito, para quem lê em qualquer idioma', async () => {
    h.locale.pessoa = 'en-US';
    montar();
    await rodar();
    expect(h.lote).toHaveLength(1);
    expect(h.lote[0].locale).toBe('pt-BR');
  });

  it('pessoa en-US: a devolutiva persistida sai em inglês, e o nome do descritor e a nota seguem intactos', async () => {
    h.locale.pessoa = 'en-US';
    montar();
    const r = await rodar();
    expect(r.okCount).toBe(1);
    const redacao = h.callAI.mock.calls.filter((c: any[]) => c[4]?.taskKey === 'ia4_feedback');
    expect(redacao).toHaveLength(1);
    expect(redacao[0][4]).toMatchObject({ empresaId: 'emp-1', colaboradorId: 'c1', locale: 'en-US' });
    expect(gravacao().feedback_ia4).toBe('Summary in English.\nPositive.\nConstructive.');
    expect(gravacao().avaliacao_ia.avaliacao_por_descritor[0].nome).toBe(D1);
    const nota = h.sb.escritas.find((e: any) => e.tabela === 'descriptor_assessments' && e.op === 'upsert').payload;
    expect(nota.map((n: any) => [n.descritor, n.nota])).toEqual([[D1, 2.5]]);
  });

  it('pessoa pt-BR: nenhuma chamada de redação, e a devolutiva é a do lote como veio', async () => {
    const r = await rodar();
    expect(r.okCount).toBe(1);
    expect(h.callAI).not.toHaveBeenCalled();
    expect(gravacao().feedback_ia4).toBe('Resumo em português.\nPositiva.\nConstrutiva.');
  });
});
