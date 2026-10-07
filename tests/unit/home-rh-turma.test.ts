import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Seletor de turma da home do RH (07/10/2026). A empresa vem SEMPRE da sessão; o `turmaId`
 * vem do cliente e é validado contra essa empresa, então turma alheia derruba a leitura.
 */

const mock = vi.hoisted(() => ({ gate: vi.fn(), panorama: vi.fn(), resolver: vi.fn(), listar: vi.fn(), tenant: vi.fn() }));
vi.mock('@/lib/auth/action-context', () => ({ requireRoleAction: mock.gate }));
vi.mock('@/lib/tenant-db', () => ({ tenantDb: mock.tenant }));
vi.mock('@/lib/home/loaders', () => ({ carregarPanoramaRH: mock.panorama }));
vi.mock('@/lib/turmas/escopo-leitura', () => ({ resolverEscopoDeLeitura: mock.resolver, listarTurmasParaFiltro: mock.listar }));

import { carregarPanoramaRHDaTurma, listarTurmasDaHomeRH } from '@/app/dashboard/home-rh-actions';

beforeEach(() => {
  vi.clearAllMocks();
  mock.gate.mockResolvedValue({ role: 'rh', empresaId: 'empresa-da-sessao' });
  mock.tenant.mockReturnValue({ raw: 'leitor-da-sessao' });
  mock.resolver.mockResolvedValue({ turmaId: 'T1' });
  mock.panorama.mockResolvedValue({ pessoas: 3 });
  mock.listar.mockResolvedValue([{ id: 'T1' }]);
});

describe('home do RH: panorama por turma', () => {
  it('lê a empresa da SESSÃO e resolve a turma contra ela', async () => {
    await expect(carregarPanoramaRHDaTurma('T1')).resolves.toEqual({ pessoas: 3 });
    expect(mock.gate).toHaveBeenCalledWith(['rh', 'admin']);
    expect(mock.resolver).toHaveBeenCalledWith('leitor-da-sessao', 'empresa-da-sessao', 'T1');
    expect(mock.panorama).toHaveBeenCalledWith('empresa-da-sessao', { escopoTurma: { turmaId: 'T1' } });
  });

  it('turma de OUTRA empresa derruba a leitura: nenhum panorama é calculado', async () => {
    mock.resolver.mockRejectedValue(new Error('Turma não encontrada nesta empresa'));
    await expect(carregarPanoramaRHDaTurma('T-DE-OUTRA')).rejects.toThrow('Turma não encontrada');
    expect(mock.panorama).not.toHaveBeenCalled();
  });

  it('sem sessão de RH, nada é lido', async () => {
    mock.gate.mockRejectedValue(new Error('FORBIDDEN'));
    await expect(carregarPanoramaRHDaTurma('T1')).rejects.toThrow('FORBIDDEN');
    await expect(listarTurmasDaHomeRH()).rejects.toThrow('FORBIDDEN');
    expect(mock.resolver).not.toHaveBeenCalled();
    expect(mock.panorama).not.toHaveBeenCalled();
    expect(mock.listar).not.toHaveBeenCalled();
  });

  it('a lista do seletor é a da empresa da sessão', async () => {
    await expect(listarTurmasDaHomeRH()).resolves.toEqual([{ id: 'T1' }]);
    expect(mock.listar).toHaveBeenCalledWith('leitor-da-sessao', 'empresa-da-sessao');
  });
});
