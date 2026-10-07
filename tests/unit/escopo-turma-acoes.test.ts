import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Actions de escopo de turma das telas de admin (07/10/2026): gate de admin, empresa escolhida
 * pelo cliente (como as demais actions de admin) e a turma validada contra ESSA empresa.
 */

const mock = vi.hoisted(() => ({ gate: vi.fn(), resolver: vi.fn(), listar: vi.fn(), tenant: vi.fn() }));
vi.mock('@/lib/auth/action-context', () => ({ requireAdminAction: mock.gate }));
vi.mock('@/lib/tenant-db', () => ({ tenantDb: mock.tenant }));
vi.mock('@/lib/turmas/escopo-leitura', () => ({ resolverEscopoDeLeitura: mock.resolver, listarTurmasParaFiltro: mock.listar }));

import { carregarEscopoDaTurma, listarTurmasDaEmpresa } from '@/actions/escopo-turma';

beforeEach(() => {
  vi.clearAllMocks();
  mock.gate.mockResolvedValue({ role: 'admin' });
  mock.tenant.mockReturnValue({ raw: 'leitor' });
  mock.listar.mockResolvedValue([{ id: 'T1' }]);
  mock.resolver.mockResolvedValue({
    turmaId: 'T1', turmaNome: 'Turma 1', turmaStatus: 'x', colaboradorIds: ['ana'],
    participacaoPorColab: new Map([['ana', { id: 'a-ana', ativa: false, janela: { de: null, ate: 1 } }]]),
  });
});

describe('escopo de turma (admin)', () => {
  it('lista as turmas da empresa escolhida, depois do gate de admin', async () => {
    await expect(listarTurmasDaEmpresa('emp-1')).resolves.toEqual([{ id: 'T1' }]);
    expect(mock.gate).toHaveBeenCalledTimes(1);
    expect(mock.listar).toHaveBeenCalledWith('leitor', 'emp-1');
  });

  it('o escopo volta como objeto simples e a turma é resolvida contra a empresa pedida', async () => {
    const e = await carregarEscopoDaTurma('emp-1', 'T1');
    expect(mock.resolver).toHaveBeenCalledWith('leitor', 'emp-1', 'T1');
    expect(e).toEqual({ turmaId: 'T1', turmaNome: 'Turma 1', janelas: { ana: { de: null, ate: 1 } }, participacoes: { ana: 'a-ana' } });
  });

  it('turma de outra empresa derruba a leitura', async () => {
    mock.resolver.mockRejectedValue(new Error('Turma não encontrada nesta empresa'));
    await expect(carregarEscopoDaTurma('emp-1', 'T-DE-OUTRA')).rejects.toThrow('Turma não encontrada');
  });

  it('sem sessão de admin nada é lido', async () => {
    mock.gate.mockRejectedValue(new Error('FORBIDDEN'));
    await expect(listarTurmasDaEmpresa('emp-1')).rejects.toThrow('FORBIDDEN');
    await expect(carregarEscopoDaTurma('emp-1', 'T1')).rejects.toThrow('FORBIDDEN');
    expect(mock.listar).not.toHaveBeenCalled();
    expect(mock.resolver).not.toHaveBeenCalled();
  });

  it('empresa ou turma ausentes não chegam ao banco', async () => {
    await expect(listarTurmasDaEmpresa('')).resolves.toEqual([]);
    await expect(carregarEscopoDaTurma('emp-1', '')).rejects.toThrow('obrigatórias');
    expect(mock.listar).not.toHaveBeenCalled();
    expect(mock.resolver).not.toHaveBeenCalled();
  });
});
