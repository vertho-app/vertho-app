import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock, type SupabaseMock } from '../helpers/supabase-mock';

let sb: SupabaseMock;
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));

import { excluirCadastroComBackupPace, preverExclusaoPace } from '@/lib/simulador-vendas/exclusao';

const empresa = '10000000-0000-4000-8000-000000000001';
const colaborador = '20000000-0000-4000-8000-000000000002';
const sessao = '30000000-0000-4000-8000-000000000003';
const hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);

function snapshot(hash = hashA) {
  return {
    hash,
    sessoes: 1,
    tentativas: 1,
    documento: {
      empresa_id: empresa,
      colaborador_id: colaborador,
      cadastro: { id: colaborador, empresa_id: empresa, email: 'privado@example.test' },
      colaboradores: [{ id: colaborador, empresa_id: empresa }],
      sessoes: [{ id: sessao, empresa_id: empresa, estado: { mensagens: [{ texto: 'privado' }] } }],
      tentativas: [{ empresa_id: empresa, sessao_id: sessao }],
    },
  };
}

describe('PACE: exclusão administrativa com backup privado e confirmação do servidor', () => {
  let upload: ReturnType<typeof vi.fn>;
  let download: ReturnType<typeof vi.fn>;
  let remove: ReturnType<typeof vi.fn>;
  let bytes: Uint8Array;

  beforeEach(() => {
    sb = criarSupabaseMock();
    upload = vi.fn(async (_caminho: string, conteudo: Uint8Array) => {
      bytes = conteudo;
      return { data: { path: 'ok' }, error: null };
    });
    download = vi.fn(async () => ({ data: new Blob([Uint8Array.from(bytes).buffer]), error: null }));
    remove = vi.fn(async () => ({ data: null, error: null }));
    sb.client.storage = {
      getBucket: vi.fn(async () => ({ data: { public: false }, error: null })),
      from: vi.fn(() => ({ upload, download, remove })),
    };
    sb.client.rpc.mockImplementation(async (nome: string) => nome === 'sim_vendas_exclusao_snapshot'
      ? { data: snapshot(), error: null }
      : { data: { id: colaborador, nome_completo: 'Pessoa' }, error: null });
  });

  it('a prévia pública só contém recibo opaco e contagens', async () => {
    const previa = await preverExclusaoPace(empresa, { tipo: 'colaborador', id: colaborador });
    expect(previa).toEqual({ confirmacao: hashA, sessoes: 1, tentativas: 1, backupDias: 7 });
    expect(JSON.stringify(previa)).not.toContain('privado');
    expect(upload).not.toHaveBeenCalled();
  });

  it('confirmação ausente ou inválida falha antes de consultar e gravar', async () => {
    await expect(excluirCadastroComBackupPace(empresa, { tipo: 'colaborador', id: colaborador }, null, 'admin@example.test'))
      .rejects.toMatchObject({ status: 409 });
    await expect(excluirCadastroComBackupPace(empresa, { tipo: 'colaborador', id: colaborador }, 'x', 'admin@example.test'))
      .rejects.toMatchObject({ status: 409 });
    expect(sb.client.rpc).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it('mudança desde a prévia exige nova confirmação antes do upload', async () => {
    sb.client.rpc.mockResolvedValueOnce({ data: snapshot(hashB), error: null });
    await expect(excluirCadastroComBackupPace(empresa, { tipo: 'colaborador', id: colaborador }, hashA, 'admin@example.test'))
      .rejects.toMatchObject({ status: 409 });
    expect(upload).not.toHaveBeenCalled();
  });

  it('valida tenant e vínculos internos do snapshot antes do upload', async () => {
    const fora = snapshot();
    fora.documento.sessoes[0].empresa_id = '10000000-0000-4000-8000-000000000099';
    sb.client.rpc.mockResolvedValueOnce({ data: fora, error: null });
    await expect(preverExclusaoPace(empresa, { tipo: 'colaborador', id: colaborador }))
      .rejects.toMatchObject({ status: 503 });
    expect(upload).not.toHaveBeenCalled();
  });

  it('bucket público, upload falho ou download divergente nunca autorizam o DELETE', async () => {
    sb.client.storage.getBucket.mockResolvedValueOnce({ data: { public: true }, error: null });
    await expect(excluirCadastroComBackupPace(empresa, { tipo: 'colaborador', id: colaborador }, hashA, 'admin@example.test'))
      .rejects.toThrow('bucket');
    expect(sb.client.rpc).toHaveBeenCalledTimes(1);

    sb.client.storage.getBucket.mockResolvedValue({ data: { public: false }, error: null });
    upload.mockResolvedValueOnce({ data: null, error: { message: 'indisponível' } });
    await expect(excluirCadastroComBackupPace(empresa, { tipo: 'colaborador', id: colaborador }, hashA, 'admin@example.test'))
      .rejects.toThrow('backup falhou');

    download.mockResolvedValueOnce({ data: new Blob(['corrompido']), error: null });
    await expect(excluirCadastroComBackupPace(empresa, { tipo: 'colaborador', id: colaborador }, hashA, 'admin@example.test'))
      .rejects.toThrow('não conferido');
    expect(sb.client.rpc.mock.calls.filter(([nome]) => nome === 'sim_vendas_excluir_cadastro')).toHaveLength(0);
  });

  it('backup conferido passa hash, caminho, tenant e autor à RPC', async () => {
    expect(await excluirCadastroComBackupPace(
      empresa, { tipo: 'colaborador', id: colaborador }, hashA, 'admin@example.test',
    )).toMatchObject({ id: colaborador, nome_completo: 'Pessoa' });
    const chamada = sb.client.rpc.mock.calls.find(([nome]) => nome === 'sim_vendas_excluir_cadastro');
    expect(chamada?.[1]).toMatchObject({
      p_empresa: empresa, p_colaborador: colaborador, p_hash: hashA, p_autor: 'admin@example.test',
      p_backup_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_backup: expect.stringMatching(/^pace-exclusao\/\d{4}-\d{2}-\d{2}_[0-9a-f-]{36}\.json\.gz$/),
    });
    expect(upload).toHaveBeenCalledTimes(1);
    expect(download).toHaveBeenCalledWith(chamada?.[1].p_backup);
  });

  it('recusa SQL confirmada limpa o backup; timeout ambíguo o preserva', async () => {
    sb.client.rpc.mockImplementationOnce(async () => ({ data: snapshot(), error: null }))
      .mockResolvedValueOnce({ data: null, error: { message: 'SIM_CONFIRMACAO', code: 'P0001' } });
    await expect(excluirCadastroComBackupPace(empresa, { tipo: 'colaborador', id: colaborador }, hashA, 'admin@example.test'))
      .rejects.toMatchObject({ status: 409 });
    expect(remove).toHaveBeenCalledTimes(1);

    remove.mockClear();
    sb.client.rpc.mockImplementationOnce(async () => ({ data: snapshot(), error: null }))
      .mockResolvedValueOnce({ data: null, error: { message: 'timeout', code: null } });
    await expect(excluirCadastroComBackupPace(empresa, { tipo: 'colaborador', id: colaborador }, hashA, 'admin@example.test'))
      .rejects.toBeDefined();
    expect(remove).not.toHaveBeenCalled();
  });
});
