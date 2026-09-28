import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Gate das páginas dos simuladores. Gestor e RH entram em atendimento e vendas
 * para ACOMPANHAR a equipe, sem depender da liberação por cargo (que diz quem
 * treina). O Mapeamento de liderança é do RH e também não depende da aba de
 * cargos, que diz só quem treina (decisão do dono, 22/09/2026).
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
import { exigirAcessoMapeamentoLideranca } from '@/lib/prontidao-lideranca/pagina';
import { canUseModulo, MODULOS } from '@/lib/access-gates/modulos';
import { readFileSync } from 'node:fs';

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

  it('o Mapeamento de liderança é só do RH, mesmo com o cargo liberado para treinar', async () => {
    mocks.auth = pessoa('gestor');
    mocks.acesso = { vendas: true, atendimento: true, lideranca: true };
    await expect(exigirAcessoMapeamentoLideranca()).rejects.toThrow('REDIRECT:/dashboard');
  });

  it('🔴 o RH abre o Mapeamento com o próprio cargo fora do simulador (22/09/2026)', async () => {
    mocks.auth = pessoa('rh');
    mocks.acesso = { vendas: false, atendimento: false, lideranca: false };
    await expect(exigirAcessoMapeamentoLideranca()).resolves.toBeUndefined();
    mocks.habilitado.lideranca = false;
    await expect(exigirAcessoMapeamentoLideranca()).rejects.toThrow('REDIRECT:/dashboard');
  });

  it('sem sessão vai para o login', async () => {
    mocks.auth = null;
    await expect(exigirAcessoPaginaSimulador('vendas')).rejects.toThrow('REDIRECT:/login');
    await expect(exigirAcessoMapeamentoLideranca()).rejects.toThrow('REDIRECT:/login');
  });
});

/**
 * Nomes cruzados entre o simulador e o Mapeamento (revisão de 27/09/2026, L-7).
 * Até então o gate do Mapeamento do RH se chamava `exigirAcessoPaginaSimulador('lideranca')`
 * e redirecionava quem não é RH: padronizar a página do SIMULADOR com o gate dos
 * outros dois mandaria todo participante de volta ao início. E o RH lia "O módulo
 * Simulador de liderança não está contratado" dentro do Mapeamento.
 */
describe('Mapeamento de liderança com nome próprio', () => {
  it('🔴 a página do Mapeamento usa o gate do Mapeamento; o gate de simulador não conhece liderança', () => {
    const mapeamento = readFileSync('app/dashboard/gestor/prontidao-lideranca/page.tsx', 'utf8');
    expect(mapeamento).toContain('await exigirAcessoMapeamentoLideranca()');
    expect(mapeamento).not.toContain('exigirAcessoPaginaSimulador');
    const gateSimulador = readFileSync('lib/simuladores/pagina.ts', 'utf8');
    expect(gateSimulador).toContain("simulador: Exclude<Simulador, 'lideranca'>");
    expect(gateSimulador).not.toMatch(/simulador === 'lideranca'|auth\.role !== 'rh'/);
  });

  it('🔴 a página do SIMULADOR de liderança não usa gate de página que redireciona participante', () => {
    const simulador = readFileSync('app/dashboard/simulador-lideranca/page.tsx', 'utf8');
    expect(simulador).not.toMatch(/exigirAcessoPaginaSimulador|exigirAcessoMapeamentoLideranca/);
  });

  it('as mensagens do Mapeamento falam do Mapeamento', () => {
    const recusa = canUseModulo({ modulos: {} } as any, MODULOS.PRONTIDAO_LIDERANCA);
    expect(recusa.message).toBe('O módulo Mapeamento de liderança não está contratado para esta empresa.');
    const action = readFileSync('actions/prontidao-lideranca.ts', 'utf8');
    expect(action).not.toMatch(/simulador de liderança\.'/i);
  });
});
