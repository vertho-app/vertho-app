import { describe, it, expect, vi, beforeEach } from 'vitest';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

const trigger = vi.fn();
vi.mock('@trigger.dev/sdk', () => ({ tasks: { trigger: (...a: any[]) => trigger(...a) } }));
vi.mock('@/lib/trigger-region', () => ({ regionOpts: () => ({}) }));

import { enfileirarLote, enfileirarKit, lerDesfechoDoJob, lerDesfechoKits } from '@/lib/pipeline-fluxo/enfileirar';

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

const item = { competencia: 'c1', descritor: 'd1', cargo: 'CAIXA', faltantes: ['D', 'I'], formatos: ['texto', 'case'], video: false, contexto: 'generico', nivelMin: 1, nivelMax: 2 };

describe('enfileirarKit', () => {
  beforeEach(() => { trigger.mockReset(); trigger.mockResolvedValue({ id: 'run_k' }); });

  it('adota o job ativo do MESMO tema: não insere nem dispara (a varredura do plano não vê jobs em voo)', async () => {
    const sb = criarSupabaseMock({ resolver: (t) => (t === 'kit_jobs' ? { id: 'kit_ativo' } : null) });
    expect(await enfileirarKit(sb.client, { empresaId: 'e1', item })).toEqual({ jobId: 'kit_ativo', adotado: true });
    expect(sb.escritas).toHaveLength(0);
    expect(trigger).not.toHaveBeenCalled();
  });

  it('o job leva os formatos da célula: sem áudio nem vídeo quando o conjunto é texto + caso', async () => {
    const sb = criarSupabaseMock({ escritaUnica: (_t, op) => (op === 'insert' ? { id: 'novo' } : null) });
    await enfileirarKit(sb.client, { empresaId: 'e1', item });
    const ins = sb.escritas.find((e) => e.op === 'insert')!;
    expect(ins.payload.params).toMatchObject({ incluirVideo: false, renderAudio: false, formatos: ['texto', 'case'], discs: ['D', 'I'], useBatch: true, cargo: 'CAIXA', porPreferencia: true });
    expect(trigger).toHaveBeenCalledWith('gerar-kit', { jobId: 'novo' }, {});
    const sb2 = criarSupabaseMock({ escritaUnica: (_t, op) => (op === 'insert' ? { id: 'n2' } : null) });
    await enfileirarKit(sb2.client, { empresaId: 'e1', item: { ...item, faltantes: ['S'] } });
    expect(sb2.escritas.find((e) => e.op === 'insert')!.payload.params.useBatch).toBe(false);
  });

  it('podcast no kit liga o PRÉ-RENDER do áudio; vídeo na célula liga o vídeo; cada um por si', async () => {
    const sb = criarSupabaseMock({ escritaUnica: (_t, op) => (op === 'insert' ? { id: 'novo' } : null) });
    await enfileirarKit(sb.client, { empresaId: 'e1', item: { ...item, formatos: ['audio', 'texto'], video: true } });
    expect(sb.escritas.find((e) => e.op === 'insert')!.payload.params).toMatchObject({ renderAudio: true, incluirVideo: true, formatos: ['audio', 'texto'] });
    const sb2 = criarSupabaseMock({ escritaUnica: (_t, op) => (op === 'insert' ? { id: 'n2' } : null) });
    await enfileirarKit(sb2.client, { empresaId: 'e1', item: { ...item, formatos: ['audio', 'case'], video: false } });
    expect(sb2.escritas.find((e) => e.op === 'insert')!.payload.params).toMatchObject({ renderAudio: true, incluirVideo: false });
  });

  it('a adoção só vale para job do MESMO cargo que cobre os DISC pedidos (grupos do mesmo tema não adotam um ao outro)', async () => {
    const sb = criarSupabaseMock({ resolver: (t) => (t === 'kit_jobs' ? { id: 'kit_ativo' } : null) });
    await enfileirarKit(sb.client, { empresaId: 'e1', item: { ...item, faltantes: ['S'] } });
    const c = sb.chamadas.find((x) => x.tabela === 'kit_jobs' && x.metodo === 'contains')!;
    expect(c.args).toEqual(['params', { cargo: 'CAIXA', discs: ['S'] }]);
  });

  it('erro ao verificar jobs ativos devolve erro (não abre um segundo job)', async () => {
    const sb = criarSupabaseMock({ resolver: () => null });
    sb.falharEm({ tabela: 'kit_jobs', op: 'select', mensagem: 'timeout' });
    const r = await enfileirarKit(sb.client, { empresaId: 'e1', item });
    expect('erro' in r && r.erro).toMatch(/timeout/);
    expect(sb.escritas).toHaveLength(0);
  });

  it('falha ao disparar marca o job como erro e devolve erro', async () => {
    const sb = criarSupabaseMock({ escritaUnica: (_t, op) => (op === 'insert' ? { id: 'novo' } : null) });
    trigger.mockRejectedValue(new Error('trigger fora'));
    const r = await enfileirarKit(sb.client, { empresaId: 'e1', item });
    expect('erro' in r && r.erro).toMatch(/trigger fora/);
    expect(sb.escritas.find((e) => e.op === 'update')?.payload.status).toBe('error');
  });
});

describe('lerDesfechoKits', () => {
  it('conta kits publicados (kit_ids) e separa terminal de em andamento', async () => {
    const sb = criarSupabaseMock({ lista: () => [{ id: 'a', status: 'done', error: null, kit_ids: ['k1', 'k2'] }, { id: 'b', status: 'running', error: null, kit_ids: null }] });
    const r = await lerDesfechoKits(sb.client, ['a', 'b']);
    expect(r[0]).toMatchObject({ jobId: 'a', status: 'done', kits: 2, terminal: true });
    expect(r[1].terminal).toBe(false);
  });
  it('job sumido vira erro terminal e erro de leitura LANÇA', async () => {
    const sb = criarSupabaseMock({ lista: () => [] });
    expect((await lerDesfechoKits(sb.client, ['x']))[0]).toMatchObject({ status: 'error', terminal: true });
    const sb2 = criarSupabaseMock({});
    sb2.falharEm({ tabela: 'kit_jobs', op: 'select', mensagem: 'rede' });
    await expect(lerDesfechoKits(sb2.client, ['x'])).rejects.toThrow(/rede/);
  });
});
