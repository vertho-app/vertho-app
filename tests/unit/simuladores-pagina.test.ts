import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Gate das páginas dos simuladores. Gestor e RH entram em atendimento e vendas
 * para ACOMPANHAR a equipe, sem depender da liberação por cargo (que diz quem
 * treina). A página de Prontidão para liderança continua sendo do RH.
 */
const mocks = vi.hoisted(() => ({
  auth: null as any,
  acesso: { vendas: false, atendimento: false, lideranca: false },
  habilitado: { atendimento: true, vendas: true, lideranca: true },
}));

vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); },
}));
vi.mock('@/lib/auth/action-context', () => ({ requireUserAction: async () => mocks.auth }));
vi.mock('@/lib/recepcao/flag', () => ({ recepcaoHabilitada: async () => mocks.habilitado.atendimento }));
vi.mock('@/lib/simulador-vendas/access', () => ({ vendasHabilitado: async () => mocks.habilitado.vendas }));
vi.mock('@/lib/prontidao-lideranca/habilitado', () => ({ prontidaoLiderancaHabilitada: async () => mocks.habilitado.lideranca }));
vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => ({ raw: {} }) }));
vi.mock('@/lib/simuladores/acesso', () => ({ acessoSimuladoresDoColaborador: async () => mocks.acesso }));

import { exigirAcessoPaginaSimulador } from '@/lib/simuladores/pagina';

const pessoa = (role: string) => ({
  role, isPlatformAdmin: false, empresaId: 'empresa-a',
  colaborador: { id: 'c1', empresa_id: 'empresa-a', cargo: 'Qualquer' },
});

describe('gate das páginas dos simuladores', () => {
  beforeEach(() => {
    mocks.acesso = { vendas: false, atendimento: false, lideranca: false };
    mocks.habilitado = { atendimento: true, vendas: true, lideranca: true };
  });

  it.each(['gestor', 'rh'])('🔴 %s abre atendimento e vendas mesmo com o cargo sem liberação', async (role) => {
    mocks.auth = pessoa(role);
    await expect(exigirAcessoPaginaSimulador('atendimento')).resolves.toBeUndefined();
    await expect(exigirAcessoPaginaSimulador('vendas')).resolves.toBeUndefined();
  });

  it('gestor não abre o simulador que a empresa não habilitou', async () => {
    mocks.auth = pessoa('gestor');
    mocks.habilitado.vendas = false;
    await expect(exigirAcessoPaginaSimulador('vendas')).rejects.toThrow('REDIRECT:/dashboard');
  });

  it('colaborador continua precisando da liberação do cargo', async () => {
    mocks.auth = pessoa('colaborador');
    await expect(exigirAcessoPaginaSimulador('atendimento')).rejects.toThrow('REDIRECT:/dashboard');
    mocks.acesso = { vendas: true, atendimento: true, lideranca: false };
    await expect(exigirAcessoPaginaSimulador('atendimento')).resolves.toBeUndefined();
  });

  it('a Prontidão para liderança segue do RH, com a liberação do cargo', async () => {
    mocks.auth = pessoa('gestor');
    mocks.acesso = { vendas: true, atendimento: true, lideranca: true };
    await expect(exigirAcessoPaginaSimulador('lideranca')).rejects.toThrow('REDIRECT:/dashboard');
    mocks.auth = pessoa('rh');
    mocks.acesso = { vendas: false, atendimento: false, lideranca: false };
    await expect(exigirAcessoPaginaSimulador('lideranca')).rejects.toThrow('REDIRECT:/dashboard');
    mocks.acesso = { vendas: false, atendimento: false, lideranca: true };
    await expect(exigirAcessoPaginaSimulador('lideranca')).resolves.toBeUndefined();
  });

  it('sem sessão vai para o login', async () => {
    mocks.auth = null;
    await expect(exigirAcessoPaginaSimulador('vendas')).rejects.toThrow('REDIRECT:/login');
  });
});
