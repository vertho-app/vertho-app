import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock, type SupabaseMock } from '../../helpers/supabase-mock';

let sb: SupabaseMock;
let job: any;
let preparados: any[];
const m = vi.hoisted(() => ({
  createGen: vi.fn(), createChk: vi.fn(), pollGen: vi.fn(), pollChk: vi.fn(),
  resultsGen: vi.fn(), resultsChk: vi.fn(), recuperar: vi.fn(), salvar: vi.fn(), salvarCheck: vi.fn(),
}));
vi.mock('@trigger.dev/sdk', () => ({ task: (t: any) => t, wait: { for: vi.fn() } }));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/actions/utils', () => ({ extractJSON: async (s: string) => { try { return JSON.parse(s); } catch { return null; } } }));
vi.mock('@/lib/ia2-gabarito', () => ({ buscarContextoPPP: vi.fn() }));
vi.mock('@/lib/matriz-por-cargo', () => ({ buscarDescritoresDaCompetencia: vi.fn() }));
vi.mock('@/lib/cenarios-b-lote', () => ({ prepararCenariosB: async () => preparados, salvarCenarioB: m.salvar, salvarCheckCenarioB: m.salvarCheck }));
vi.mock('@/lib/ai-batch', () => ({
  createClaudeBatch: m.createGen, createOpenAIBatch: m.createChk,
  pollClaudeBatch: m.pollGen, pollOpenAIBatch: m.pollChk,
  fetchClaudeBatchResults: m.resultsGen, fetchOpenAIBatchResults: m.resultsChk,
  batchPendenteDoJob: m.recuperar, encerrarBatch: vi.fn(),
}));
import { gerarCenariosBBatchTask } from '@/trigger/gerar-cenarios-b-batch';

const resposta = { titulo: 'Entrega', descricao: 'Cliente solicita atendimento urgente', p1: 'P1', p2: 'P2', p3: 'P3', p4: 'P4' };
function estadoJob() {
  return Object.assign({}, job, ...sb.escritas.filter(e => e.tabela === 'ia_jobs').map(e => e.payload));
}
const run = () => (gerarCenariosBBatchTask as any).run({ jobId: 'j1', empresaId: 'e1' }, { ctx: { attempt: { number: 1 }, run: { id: 'run1', maxAttempts: 3 } } });
beforeEach(() => {
  vi.resetAllMocks();
  const item = { cenarioAId: 'a1', competenciaId: 'c1', cargo: 'Gestor' };
  job = { id: 'j1', fase: 'cenarios-b', status: 'queued', params: { items: [item], aiConfig: { model: 'claude-sonnet-5', checkModel: 'gpt-5.6-terra' } } };
  sb = criarSupabaseMock({ resolver: tabela => tabela === 'ia_jobs' ? estadoJob() : null });
  preparados = [{ item, ctx: { empresa: { nome: 'Empresa' }, cargoNome: 'Gestor', cargoDetalhe: null, comp: { nome: 'Competência' }, descritores: [], valores: [], contextoPPP: '', gabCIS: null }, cenA: { id: 'a1', descricao: 'Planejamento financeiro anual' }, comp: { nome: 'Competência' }, cenB: null }];
  m.createGen.mockResolvedValue('batch-gen');
  m.createChk.mockResolvedValue('batch-chk');
  m.recuperar.mockResolvedValue(null);
  m.pollGen.mockImplementation(async () => {
    expect(estadoJob().params.batchIdGen).toBe('batch-gen');
    return { ended: true };
  });
  m.pollChk.mockImplementation(async () => {
    expect(estadoJob().params.batchIdChk).toBe('batch-chk');
    return { ended: true, status: 'completed', outputFileId: 'file1' };
  });
  m.resultsGen.mockResolvedValue(new Map([['g_a1', JSON.stringify(resposta)]]));
  m.resultsChk.mockResolvedValue(new Map([['c_a1', JSON.stringify({ nota: 95 })]]));
  m.salvar.mockImplementation(async (_empresa, a, data) => {
    const row = { id: `b_${a.id}`, ...data, nota_check: null };
    preparados.find(p => p.cenA.id === a.id).cenB = row;
    return row;
  });
  m.salvarCheck.mockImplementation(async (_empresa, id, data) => {
    preparados.find(p => p.cenB?.id === id).cenB.nota_check = data.nota;
    return { resultado: data, statusCheck: 'aprovado' };
  });
});

describe('cenários B em Batch API', () => {
  it('executa geração + check em lotes reais, com modelos e ledger de cada etapa', async () => {
    await run();
    expect(m.createGen).toHaveBeenCalledWith([expect.objectContaining({ model: 'claude-sonnet-5' })], { ledger: { feature: 'cenarios_b', empresaId: 'e1', jobId: 'j1' } });
    expect(m.createChk).toHaveBeenCalledWith([expect.objectContaining({ model: 'gpt-5.6-terra' })], { ledger: { feature: 'cenarios_b_check', empresaId: 'e1', jobId: 'j1' } });
    expect(estadoJob()).toMatchObject({ status: 'done', progress: { done: 2, total: 2 }, params: { batchIdGen: 'batch-gen', batchIdChk: 'batch-chk', runId: 'run1' } });
  });
  it('falha entre geração e check retoma sem gerar ou submeter lote pago novamente', async () => {
    m.pollChk.mockRejectedValueOnce(new Error('rede'));
    await expect(run()).rejects.toThrow('rede');
    expect(estadoJob().status).toBe('running');
    await run();
    expect(m.createGen).toHaveBeenCalledTimes(1);
    expect(m.createChk).toHaveBeenCalledTimes(1);
    expect(m.salvar).toHaveBeenCalledTimes(1);
    expect(estadoJob().status).toBe('done');
  });
  it('erro ao salvar cenário retoma o mesmo lote sem começar check', async () => {
    m.salvar.mockRejectedValueOnce(new Error('banco indisponível'));
    await expect(run()).rejects.toThrow('banco indisponível');
    expect(m.createChk).not.toHaveBeenCalled();
    await run();
    expect(m.createGen).toHaveBeenCalledTimes(1);
    expect(estadoJob().status).toBe('done');
  });
  it('recupera lote pelo rastro quando o checkpoint não chegou a ser gravado', async () => {
    m.recuperar.mockImplementation(async (_job, feature) => feature === 'cenarios_b' ? 'batch-gen' : null);
    await run();
    expect(m.createGen).not.toHaveBeenCalled();
    expect(m.salvar).toHaveBeenCalledTimes(1);
  });
  it('B já salvo sem check só paga a validação', async () => {
    preparados[0].cenB = { id: 'b1', ...resposta, nota_check: null };
    await run();
    expect(m.createGen).not.toHaveBeenCalled();
    expect(m.salvar).not.toHaveBeenCalled();
    expect(m.createChk).toHaveBeenCalledTimes(1);
  });
  it('cancelamento durante polling impede gravação e preserva cancelled', async () => {
    m.pollGen.mockImplementationOnce(async () => { job.status = 'cancelled'; return { ended: false }; });
    // O status cancelado vem do banco, depois do último patch da task.
    sb = criarSupabaseMock({ resolver: () => ({ ...estadoJob(), ...(job.status === 'cancelled' ? { status: 'cancelled' } : {}) }) });
    expect(await run()).toMatchObject({ cancelled: true });
    expect(m.salvar).not.toHaveBeenCalled();
    expect(m.createChk).not.toHaveBeenCalled();
    expect(sb.escritas.filter(e => ['done', 'error'].includes(e.payload.status))).toHaveLength(0);
  });
  it('resultado incompleto fica visível e não é persistido', async () => {
    m.resultsGen.mockResolvedValue(new Map());
    await run();
    expect(m.salvar).not.toHaveBeenCalled();
    expect(estadoJob().progress.resultados).toContainEqual(expect.objectContaining({ ok: false }));
  });
  it.each(['done', 'cancelled'])('job %s não chama IA novamente', async status => {
    job.status = status;
    await run();
    expect(m.createGen).not.toHaveBeenCalled();
    expect(m.createChk).not.toHaveBeenCalled();
  });
});

describe('disparo duplicado do mesmo job (sem disparos simultâneos, 04/10/2026)', () => {
  const runDe = (id: string) => (gerarCenariosBBatchTask as any).run({ jobId: 'j1', empresaId: 'e1' }, { ctx: { attempt: { number: 1 }, run: { id, maxAttempts: 3 } } });

  it('job em curso por OUTRA run: a 2ª execução sai sem pagar lote nenhum nem mexer no job', async () => {
    job.status = 'running';
    job.params = { ...job.params, runId: 'run-que-ja-assumiu' };
    const r = await runDe('run-duplicada');
    expect(r).toMatchObject({ ok: true, duplicada: true, runDoLote: 'run-que-ja-assumiu' });
    expect(m.createGen).not.toHaveBeenCalled();
    expect(m.createChk).not.toHaveBeenCalled();
    expect(sb.escritas.filter(e => e.tabela === 'ia_jobs')).toHaveLength(0);
  });

  it('a retentativa da MESMA run (mesmo runId) segue normalmente: é como o lote retoma de onde parou', async () => {
    job.status = 'running';
    job.params = { ...job.params, runId: 'run1' };
    await runDe('run1');
    expect(m.createGen).toHaveBeenCalledTimes(1);
    expect(estadoJob().status).toBe('done');
  });

  it('job ainda na fila (sem runId): a primeira run assume e grava o próprio runId', async () => {
    await runDe('run-primeira');
    expect(estadoJob().params.runId).toBe('run-primeira');
    expect(m.createGen).toHaveBeenCalledTimes(1);
  });
});
