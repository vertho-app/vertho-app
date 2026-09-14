import { beforeEach, describe, it, expect, vi } from 'vitest';
import { criarSupabaseMock, type SupabaseMock } from '../helpers/supabase-mock';
vi.mock('@/lib/audit', () => ({ logAdminAction: vi.fn() }));
import { expurgarComBackup, executarRetencaoPace } from '@/lib/simulador-vendas/retencao';
let sb: SupabaseMock;
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
import { tenantDb } from '@/lib/tenant-db';
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
});
