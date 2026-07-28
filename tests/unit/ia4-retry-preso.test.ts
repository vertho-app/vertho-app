import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Achado 1.4 (FMEA-PIPELINE §6) — colaborador PRESO sem retry na IA4.
 *
 * O bug: `respostas.avaliacao_ia` era gravado ANTES do upsert de
 * `descriptor_assessments` (e o upsert ficava num try/catch com console.warn).
 * Upsert falho → resposta "avaliada" sem notas → fora da fila (`.is null`),
 * trilha `sem_assessment`, rodarIA4Uma "Já avaliada". Variante: JSON válido SEM
 * `avaliacao_por_descritor` → média 0 → N1/nota 0 gravados com ZERO notas.
 *
 * Estes testes travam as 3 invariantes da correção:
 *  1. as notas sobem ANTES de marcar a resposta como avaliada (falha no upsert
 *     deixa avaliacao_ia null → retryable);
 *  2. JSON sem notas de descritor é FALHA retryable, não nota N1/0;
 *  3. a fila (listarPendentesIA4) inclui as presas legadas e rodarIA4Uma as
 *     reprocessa em vez de recusar.
 */

const callAIMock = vi.fn();
const tdbMock = { from: null as any };
const sbRawMock = { from: null as any };

vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => tdbMock }));
vi.mock('@/lib/admin-supabase', () => ({ requireAdminSupabase: async () => sbRawMock }));
vi.mock('@/lib/auth/action-context', () => ({ requireAdminAction: async () => ({}) }));
vi.mock('@/actions/ai-client', () => ({ callAI: (...a: any[]) => callAIMock(...a) }));
vi.mock('@/lib/ia2-gabarito', () => ({ buscarContextoPPP: async () => '' }));
vi.mock('@/lib/internal-emails', () => ({ excludeInternalEmails: async () => ({ data: [], error: null }) }));
vi.mock('@/lib/disc-status', () => ({ hasDiscMapeado: () => true }));

import { listarPendentesIA4, rodarIA4Uma } from '@/actions/fase3';

// ── Client Supabase fake: resultados enfileirados por tabela, chamadas gravadas ──

type Call = { table: string; method: string; args: any[] };

function makeClient(results: Record<string, any[]>) {
  const calls: Call[] = [];
  const cursores: Record<string, number> = {};
  const from = (table: string) => {
    const queue = results[table] ?? [];
    const builder: any = {};
    for (const m of ['select', 'eq', 'in', 'is', 'not', 'update', 'upsert', 'single', 'maybeSingle', 'order', 'limit', 'insert', 'delete', 'range']) {
      builder[m] = (...args: any[]) => { calls.push({ table, method: m, args }); return builder; };
    }
    builder.then = (onF: any, onR: any) => {
      const i = cursores[table] ?? 0;
      cursores[table] = i + 1;
      const r = i < queue.length ? queue[i] : { data: null, error: null };
      return Promise.resolve(r).then(onF, onR);
    };
    return builder;
  };
  return { from, calls };
}

const RESP = {
  id: 'resp-1', empresa_id: 'emp-1', colaborador_id: 'colab-1',
  competencia_id: 'comp-1', competencia_nome: 'Coordenação', cenario_id: null,
  cargo: 'Analista', r1: 'a', r2: 'b', r3: 'c', r4: 'd', avaliacao_ia: null,
};

const IA_JSON_VALIDO = JSON.stringify({
  avaliacao_por_descritor: [
    { numero: 1, nome: 'Busca de apoio', nota_decimal: 2.5, confianca: 0.8, sustentacao: 'forte' },
    { numero: 2, nome: 'Consciência de limites', nota_decimal: 3.0, confianca: 0.9, sustentacao: 'forte' },
  ],
  feedback: { resumo_geral: 'Bom desempenho.' },
});

/** Fila de resultados cobrindo o caminho feliz de rodarIA4Uma até o ponto das escritas. */
function resultadosBase(resp: any, opts: { upsertErr?: any; avaliacao?: any } = {}) {
  return {
    respostas: [
      { data: resp, error: null },                    // select * da resposta
      { data: [{ id: resp.id }], error: null },       // update final (avaliacao_ia)
    ],
    descriptor_assessments: [
      ...(opts.avaliacao ? [{ count: 0, error: null }] : []), // checagem "Já avaliada"
      { data: null, error: opts.upsertErr ?? null },  // upsert das notas
    ],
    colaboradores: [{ data: [{ id: 'colab-1', nome_completo: 'Fulano Teste' }], error: null }],
    competencias: [
      { data: { nome: 'Coordenação', cod_comp: 'COO03', descricao: '' }, error: null },
      { data: [], error: null },                      // régua oficial (vazia ok)
    ],
  };
}

const SBRAW_RESULTS = {
  empresas: [{ data: { nome: 'Empresa X', segmento: 'Serviços' }, error: null }],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ordem da gravação — notas ANTES de marcar como avaliada', () => {
  it('caminho feliz: upsert de descriptor_assessments ocorre antes do update de avaliacao_ia', async () => {
    const tdb = makeClient(resultadosBase(RESP));
    const raw = makeClient(SBRAW_RESULTS);
    tdbMock.from = tdb.from; sbRawMock.from = raw.from;
    callAIMock.mockResolvedValue(IA_JSON_VALIDO);

    const r = await rodarIA4Uma('emp-1', 'resp-1');
    expect(r.success).toBe(true);

    const iUpsert = tdb.calls.findIndex((c) => c.table === 'descriptor_assessments' && c.method === 'upsert');
    const iUpdate = tdb.calls.findIndex((c) => c.table === 'respostas' && c.method === 'update' && c.args[0]?.avaliacao_ia);
    expect(iUpsert).toBeGreaterThanOrEqual(0);
    expect(iUpdate).toBeGreaterThanOrEqual(0);
    expect(iUpsert).toBeLessThan(iUpdate);
  });

  it('upsert falho → success:false e avaliacao_ia NÃO é gravado (resposta segue retryable)', async () => {
    const tdb = makeClient(resultadosBase(RESP, { upsertErr: { message: 'viola check constraint' } }));
    const raw = makeClient(SBRAW_RESULTS);
    tdbMock.from = tdb.from; sbRawMock.from = raw.from;
    callAIMock.mockResolvedValue(IA_JSON_VALIDO);

    const r = await rodarIA4Uma('emp-1', 'resp-1');
    expect(r.success).toBe(false);
    expect(r.error).toContain('descriptor_assessments upsert falhou');
    const gravouAvaliacao = tdb.calls.some((c) => c.table === 'respostas' && c.method === 'update' && c.args[0]?.avaliacao_ia);
    expect(gravouAvaliacao).toBe(false);
  });
});

describe('variante "JSON válido SEM notas" — falha retryable, não N1/0', () => {
  it.each([
    ['sem a chave avaliacao_por_descritor', { feedback: { resumo_geral: 'x' } }],
    ['com avaliacao_por_descritor vazio', { avaliacao_por_descritor: [], feedback: {} }],
  ])('%s → success:false, sem update e sem upsert', async (_rotulo, payload) => {
    const tdb = makeClient(resultadosBase(RESP));
    const raw = makeClient(SBRAW_RESULTS);
    tdbMock.from = tdb.from; sbRawMock.from = raw.from;
    callAIMock.mockResolvedValue(JSON.stringify(payload));

    const r = await rodarIA4Uma('emp-1', 'resp-1');
    expect(r.success).toBe(false);
    expect(r.error).toContain('avaliacao_por_descritor');
    expect(tdb.calls.some((c) => c.method === 'update' && c.args[0]?.avaliacao_ia)).toBe(false);
    expect(tdb.calls.some((c) => c.method === 'upsert')).toBe(false);
  });
});

describe('fila self-service — presas (avaliacao_ia sem notas) voltam a aparecer', () => {
  const AVALIADA_PRESA = { id: 'r1', colaborador_id: 'c1', competencia_id: 'k1', competencia_nome: 'Coordenação' };

  it('listarPendentesIA4 inclui avaliada com ZERO linhas em descriptor_assessments', async () => {
    const tdb = makeClient({
      respostas: [
        { data: [], error: null },            // pendentes clássicas
        { data: [AVALIADA_PRESA], error: null }, // avaliadas
      ],
      descriptor_assessments: [{ data: [], error: null }],
    });
    tdbMock.from = tdb.from;

    const r = await listarPendentesIA4('emp-1');
    expect(r.success).toBe(true);
    expect(r.data).toHaveLength(1);
    expect(r.data![0].id).toBe('r1');
    expect(r.data![0].presa_sem_notas).toBe(true);
    expect(r.presas).toBe(1);
  });

  it('avaliada COM notas NÃO entra na fila (sem reprocesso desnecessário)', async () => {
    const tdb = makeClient({
      respostas: [
        { data: [], error: null },
        { data: [AVALIADA_PRESA], error: null },
      ],
      descriptor_assessments: [{ data: [{ colaborador_id: 'c1', competencia: 'Coordenação' }], error: null }],
    });
    tdbMock.from = tdb.from;

    const r = await listarPendentesIA4('emp-1');
    expect(r.data).toHaveLength(0);
    expect(r.presas).toBe(0);
  });

  it('rodarIA4Uma REPROCESSA resposta avaliada sem notas (em vez de "Já avaliada")', async () => {
    const presa = { ...RESP, avaliacao_ia: { consolidacao: { nivel_geral: 1 } } };
    const tdb = makeClient(resultadosBase(presa, { avaliacao: true }));
    const raw = makeClient(SBRAW_RESULTS);
    tdbMock.from = tdb.from; sbRawMock.from = raw.from;
    callAIMock.mockResolvedValue(IA_JSON_VALIDO);

    const r = await rodarIA4Uma('emp-1', 'resp-1');
    expect(callAIMock).toHaveBeenCalledTimes(1);
    expect(r.success).toBe(true);
    expect(r.message).not.toBe('Já avaliada');
    // e o reprocesso persistiu notas + avaliação
    expect(tdb.calls.some((c) => c.table === 'descriptor_assessments' && c.method === 'upsert')).toBe(true);
    expect(tdb.calls.some((c) => c.table === 'respostas' && c.method === 'update' && c.args[0]?.avaliacao_ia)).toBe(true);
  });

  it('rodarIA4Uma mantém "Já avaliada" quando as notas existem', async () => {
    const avaliadaOk = { ...RESP, avaliacao_ia: { consolidacao: { nivel_geral: 3 } } };
    const tdb = makeClient({
      respostas: [{ data: avaliadaOk, error: null }],
      descriptor_assessments: [{ count: 3, error: null }],
    });
    tdbMock.from = tdb.from;

    const r = await rodarIA4Uma('emp-1', 'resp-1');
    expect(r.success).toBe(true);
    expect(r.message).toBe('Já avaliada');
    expect(callAIMock).not.toHaveBeenCalled();
  });
});
