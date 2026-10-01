import { describe, it, expect, vi, beforeEach } from 'vitest';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

const trigger = vi.fn();
vi.mock('@trigger.dev/sdk', () => ({ tasks: { trigger: (...a: any[]) => trigger(...a) } }));
vi.mock('@/lib/trigger-region', () => ({ regionOpts: () => ({}) }));

import { enfileirarLote, lerDesfechoDoJob } from '@/lib/pipeline-fluxo/enfileirar';

/**
 * `enfileirarLote` faz o que os botões manuais fazem (insert em `ia_jobs` + disparo da MESMA task), sem sessão.
 * Invariantes: adota o lote ativo em vez de duplicar (dois lotes da mesma fase processariam a mesma fila em
 * corrida); falha ao verificar lotes ativos NÃO vira "não há lote" (abriria um segundo); falha ao disparar marca o
 * job como erro (senão o guard de lote ativo bloquearia a fase para sempre).
 */
describe('enfileirarLote', () => {
  beforeEach(() => { trigger.mockReset(); trigger.mockResolvedValue({ id: 'run_1' }); });

  it('adota o lote ativo da mesma fase: não insere nem dispara', async () => {
    const sb = criarSupabaseMock({ resolver: (t) => (t === 'ia_jobs' ? { id: 'job_ativo' } : null) });
    const r = await enfileirarLote(sb.client, { empresaId: 'e1', etapa: 'blueprint', colabIds: ['a'], aiConfig: {} });
    expect(r).toEqual({ jobId: 'job_ativo', adotado: true });
    expect(sb.escritas.filter((e) => e.op === 'insert')).toHaveLength(0);
    expect(trigger).not.toHaveBeenCalled();
  });

  it('erro ao verificar lotes ativos devolve erro (não assume "nenhum ativo")', async () => {
    const sb = criarSupabaseMock({ resolver: () => null });
    sb.falharEm({ tabela: 'ia_jobs', op: 'select', mensagem: 'timeout' });
    const r = await enfileirarLote(sb.client, { empresaId: 'e1', etapa: 'ia4', itens: ['r1'], aiConfig: {} });
    expect('erro' in r && r.erro).toMatch(/timeout/);
    expect(sb.escritas.filter((e) => e.op === 'insert')).toHaveLength(0);
    expect(trigger).not.toHaveBeenCalled();
  });

  it('IA4: params no formato do botão manual e total conta o check quando há checkModel', async () => {
    const sb = criarSupabaseMock({ escritaUnica: (t, op) => (op === 'insert' ? { id: 'novo' } : null) });
    const r = await enfileirarLote(sb.client, { empresaId: 'e1', etapa: 'ia4', itens: ['r1', 'r2'], checkOnly: ['r3'], aiConfig: { model: 'm', checkModel: 'c' } });
    expect(r).toEqual({ jobId: 'novo', adotado: false });
    const ins = sb.escritas.find((e) => e.op === 'insert')!;
    expect(ins.payload.fase).toBe('ia4');
    expect(ins.payload.params.items).toEqual([{ id: 'r1' }, { id: 'r2' }]);
    expect(ins.payload.params.checkOnlyIds).toEqual(['r3']);
    expect(ins.payload.progress.total).toBe(5);
    expect(trigger).toHaveBeenCalledWith('gerar-ia4-batch', { jobId: 'novo' }, {});
  });

  it('PDI usa a fase "relatorios" e a task de relatórios, com colabIds', async () => {
    const sb = criarSupabaseMock({ escritaUnica: (t, op) => (op === 'insert' ? { id: 'novo' } : null) });
    await enfileirarLote(sb.client, { empresaId: 'e1', etapa: 'relatorios', colabIds: ['a', 'b'], aiConfig: { model: 'm' } });
    const ins = sb.escritas.find((e) => e.op === 'insert')!;
    expect(ins.payload.fase).toBe('relatorios');
    expect(ins.payload.params.colabIds).toEqual(['a', 'b']);
    expect(trigger).toHaveBeenCalledWith('gerar-relatorios-batch', { jobId: 'novo' }, {});
  });

  it('falha ao DISPARAR marca o job como erro (não deixa "queued" travando a fase) e devolve erro', async () => {
    const sb = criarSupabaseMock({ escritaUnica: (t, op) => (op === 'insert' ? { id: 'novo' } : null) });
    trigger.mockRejectedValue(new Error('trigger fora'));
    const r = await enfileirarLote(sb.client, { empresaId: 'e1', etapa: 'blueprint', colabIds: ['a'], aiConfig: {} });
    expect('erro' in r && r.erro).toMatch(/trigger fora/);
    const upd = sb.escritas.find((e) => e.op === 'update');
    expect(upd?.payload.status).toBe('error');
  });
});

describe('lerDesfechoDoJob', () => {
  it('conta ok e falhas de progress.resultados e reconhece status terminal', async () => {
    const sb = criarSupabaseMock({ resolver: () => ({ status: 'done', error: null, progress: { resultados: [{ ok: true }, { ok: true }, { ok: false }] } }) });
    expect(await lerDesfechoDoJob(sb.client, 'j')).toMatchObject({ terminal: true, status: 'done', ok: 2, falhas: 1 });
  });
  it('job em andamento não é terminal', async () => {
    const sb = criarSupabaseMock({ resolver: () => ({ status: 'running', error: null, progress: {} }) });
    expect((await lerDesfechoDoJob(sb.client, 'j')).terminal).toBe(false);
  });
  it('erro de leitura LANÇA (não vira "terminou")', async () => {
    const sb = criarSupabaseMock({ resolver: () => null });
    sb.falharEm({ tabela: 'ia_jobs', op: 'select', mensagem: 'rede' });
    await expect(lerDesfechoDoJob(sb.client, 'j')).rejects.toThrow(/rede/);
  });
});
