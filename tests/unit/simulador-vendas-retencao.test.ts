import { beforeEach, describe, it, expect, vi } from 'vitest';
import { criarSupabaseMock, type SupabaseMock } from '../helpers/supabase-mock';
vi.mock('@/lib/audit', () => ({ logAdminAction: vi.fn() }));
import { expurgarComBackup, executarRetencaoPace } from '@/lib/simulador-vendas/retencao';
let sb: SupabaseMock;
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
import { tenantDb } from '@/lib/tenant-db';
import { logAdminAction } from '@/lib/audit';
const empresa = '10000000-0000-4000-8000-000000000001',
  id = '20000000-0000-4000-8000-000000000002';
const candidata = () => ({
  id,
  hash: 'snapshot-conferido',
  documento: { sessao: { id, empresa_id: empresa }, tentativas: [] },
});
let bytes: Uint8Array;
const upload = vi.fn(async (_p: string, b: Uint8Array) => {
  bytes = b;
  return { error: null };
});
const download = vi.fn(async () => ({ error: null, data: new Blob([bytes as BlobPart]) }));
const remove = vi.fn(async () => ({ error: null }));
const list = vi.fn(async () => ({ error: null, data: [] }));
describe('retenção PACE: expurgo só depois de backup privado conferido', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    remove.mockResolvedValue({ error: null });
    list.mockResolvedValue({ error: null, data: [] });
    sb = criarSupabaseMock({ lista: () => [{ id: empresa }] });
    upload.mockImplementation(async (_p, b) => {
      bytes = b;
      return { error: null };
    });
    download.mockImplementation(async () => ({ error: null, data: new Blob([bytes as BlobPart]) }));
    sb.client.storage = {
      getBucket: vi.fn(async () => ({ error: null, data: { public: false } })),
      from: vi.fn(() => ({ upload, download, remove, list })),
    };
    sb.client.rpc.mockResolvedValue({ data: true, error: null });
  });
  it('confere bytes antes de expurgar o ID/hash/tenant exatos', async () => {
    expect(await expurgarComBackup(tenantDb(empresa), empresa, candidata())).toBe(true);
    expect(upload).toHaveBeenCalledOnce();
    expect(download).toHaveBeenCalledOnce();
    expect(sb.client.rpc).toHaveBeenCalledWith('sim_vendas_expurgar', {
      p_empresa: empresa,
      p_id: id,
      p_hash: 'snapshot-conferido',
    });
    expect(download.mock.invocationCallOrder[0]).toBeLessThan(sb.client.rpc.mock.invocationCallOrder[0]);
    expect(upload.mock.calls[0][0]).toMatch(/^pace-retencao\/.+\.json\.gz$/);
  });
  it('falha de upload não autoriza DELETE', async () => {
    upload.mockResolvedValueOnce({ error: { message: 'falha' } } as any);
    await expect(expurgarComBackup(tenantDb(empresa), empresa, candidata())).rejects.toThrow('backup falhou');
    expect(sb.client.rpc).not.toHaveBeenCalled();
  });
  it('backup corrompido não autoriza DELETE', async () => {
    download.mockResolvedValueOnce({ error: null, data: new Blob(['corrompido']) });
    await expect(expurgarComBackup(tenantDb(empresa), empresa, candidata())).rejects.toThrow('não conferido');
    expect(sb.client.rpc).not.toHaveBeenCalled();
  });
  it('snapshot de outra empresa falha antes do backup', async () => {
    const c = candidata();
    c.documento.sessao.empresa_id = 'outra';
    await expect(expurgarComBackup(tenantDb(empresa), empresa, c)).rejects.toThrow('escopo');
    expect(upload).not.toHaveBeenCalled();
  });
  it('corrida com edição é preservada, não sucesso de exclusão', async () => {
    sb.client.rpc.mockResolvedValueOnce({ data: false, error: null });
    expect(await expurgarComBackup(tenantDb(empresa), empresa, candidata())).toBe(false);
    expect(remove).toHaveBeenCalledWith([upload.mock.calls[0][0]]);
  });
  it('timeout de expurgo é ambíguo e mantém o backup', async () => {
    sb.client.rpc.mockResolvedValueOnce({ data: null, error: { message: 'timeout' } });
    await expect(expurgarComBackup(tenantDb(empresa), empresa, candidata())).rejects.toThrow('falha ao expurgar');
    expect(remove).not.toHaveBeenCalled();
  });
  it('resposta desconhecida mantém backup e não é classificada como corrida', async () => {
    sb.client.rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(expurgarComBackup(tenantDb(empresa), empresa, candidata())).rejects.toThrow('desconhecida');
    expect(remove).not.toHaveBeenCalled();
  });
  it('falha na limpeza de backup recusado é observável', async () => {
    sb.client.rpc.mockResolvedValueOnce({ data: false, error: null });
    remove.mockResolvedValueOnce({ error: { message: 'indisponível' } } as any);
    await expect(expurgarComBackup(tenantDb(empresa), empresa, candidata())).rejects.toThrow('limpeza');
  });
  it('bucket público ou indisponível bloqueia toda a manutenção', async () => {
    sb.client.storage.getBucket.mockResolvedValueOnce({ data: { public: true }, error: null });
    await expect(executarRetencaoPace(sb.client)).rejects.toThrow('privado');
    expect(sb.client.rpc).not.toHaveBeenCalled();
  });
  it('erro de consulta vira falha observável, não manutenção bem-sucedida', async () => {
    sb.client.rpc.mockResolvedValue({ data: null, error: { message: 'indisponível' } });
    await expect(executarRetencaoPace(sb.client)).rejects.toThrow('incompleta');
    expect(upload).not.toHaveBeenCalled();
  });
  it('nenhuma sessão vencida: zero escrita/descarte', async () => {
    sb.client.rpc.mockResolvedValue({ data: [], error: null });
    expect(await executarRetencaoPace(sb.client)).toMatchObject({ removidas: 0, empresas: 1 });
    expect(upload).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
  it('orçamento global para em 1.000 sem marcar outras empresas como erro', async () => {
    const storage = sb.client.storage;
    sb = criarSupabaseMock({ lista: (t) => t === 'empresas' ? [{ id: empresa }, { id: '10000000-0000-4000-8000-000000000003' }] : [] });
    sb.client.storage = storage;
    sb.client.rpc.mockImplementation(async (nome) => ({ data: nome === 'sim_vendas_retencao_lote' ? Array.from({ length: 5 }, candidata) : true, error: null }));
    const r = await executarRetencaoPace(sb.client);
    // O tenant ainda pode ter candidatos; cursor NULL força retomá-lo, sem pular resto.
    expect(r).toMatchObject({ removidas: 1000, parcial: true, proximaEmpresa: null });
    expect(sb.client.rpc.mock.calls.every((c) => c[1].p_empresa === empresa)).toBe(true);
    expect(logAdminAction).toHaveBeenLastCalledWith(expect.objectContaining({ resultado: 'parcial', detalhes: expect.objectContaining({ falhas: 0 }) }));
    expect(sb.escritas).toContainEqual(expect.objectContaining({ tabela: 'sim_vendas_manutencao', payload: expect.objectContaining({ cursor_empresa: null }) }));
  });
  it('prazo esgotado antes do lote é parcial, sem visitar empresas nem inventar erros', async () => {
    const r = await executarRetencaoPace(sb.client, Date.now() - 1);
    expect(r).toMatchObject({ removidas: 0, parcial: true });
    expect(sb.client.rpc).not.toHaveBeenCalled();
    expect(logAdminAction).toHaveBeenLastCalledWith(expect.objectContaining({ resultado: 'parcial', detalhes: expect.objectContaining({ falhas: 0 }) }));
  });
  it('checkpoint faz a rodada seguinte começar depois da empresa anterior', async () => {
    const storage = sb.client.storage;
    sb = criarSupabaseMock({ resolver: () => ({ cursor_empresa: empresa }), lista: () => [{ id: '10000000-0000-4000-8000-000000000003' }] });
    sb.client.storage = storage;
    sb.client.rpc.mockResolvedValue({ data: [], error: null });
    expect(await executarRetencaoPace(sb.client)).toMatchObject({ parcial: false, proximaEmpresa: null });
    expect(sb.chamadas).toContainEqual({ tabela: 'empresas', metodo: 'gt', args: ['id', empresa] });
  });
  it('falha de checkpoint impede fingir uma manutenção completa', async () => {
    sb.falharEm({ tabela: 'sim_vendas_manutencao', op: 'select', mensagem: 'falha' });
    await expect(executarRetencaoPace(sb.client)).rejects.toThrow('recuperar o cursor');
    expect(upload).not.toHaveBeenCalled();
  });
  it('rotação é restrita aos dois prefixos PACE e mantém recuperação de sete dias', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-14T12:00:00Z'));
    try {
      const antigo = `2026-09-06_${id}.json.gz`;
      const recente = `2026-09-07_${id}.json.gz`;
      list.mockResolvedValueOnce({ error: null, data: [{ name: antigo }, { name: recente }] } as any);
      sb.client.rpc.mockResolvedValue({ data: [], error: null });
      await executarRetencaoPace(sb.client);
      expect(remove).toHaveBeenCalledWith([`pace-retencao/${antigo}`]);
      expect(list.mock.calls.map((c: any) => c[0])).toEqual(['pace-retencao', 'pace-retencao', 'pace-exclusao']);
    } finally { vi.useRealTimers(); }
  });
});
