import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Página do Simulador de liderança: RECUSA decide a porta, FALHA DE LEITURA
 * sobe para a tela de erro (27/09/2026). Até então as duas viravam "não pode":
 * uma leitura da turma que falhava mandava quem treina de volta ao início, sem
 * explicação, como se estivesse fora do programa.
 */
const m = vi.hoisted(() => ({ treino: null as unknown, equipe: null as unknown, role: 'colaborador' }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock('@/lib/auth/action-context', () => ({
  requireUserAction: async () => ({ role: m.role, email: 'x@cliente.test', empresaId: 'e' }),
}));
vi.mock('@/lib/simulador-lideranca/access', () => ({
  contexto: async () => {
    if (m.treino) throw m.treino;
    return {};
  },
}));
vi.mock('@/lib/simulador-lideranca/equipe', () => ({
  contextoEquipe: async () => {
    if (m.equipe) throw m.equipe;
    return {};
  },
}));
vi.mock('@/components/simulador-lideranca/treino', () => ({ default: () => null }));

import Page from '@/app/dashboard/simulador-lideranca/page';
import { LiderancaError } from '@/lib/simulador-lideranca/schema';

beforeEach(() => {
  m.treino = null;
  m.equipe = null;
  m.role = 'colaborador';
});

describe('página do simulador de liderança: recusa × falha de leitura', () => {
  it('recusa nas duas portas volta ao início', async () => {
    m.treino = new LiderancaError(403, 'O mapeamento de liderança não está aberto para você nesta rodada.');
    m.equipe = new LiderancaError(403, 'Seu perfil não permite acompanhar esta equipe.');
    await expect(Page()).rejects.toThrow('REDIRECT:/dashboard');
  });

  it('recusa só no treino: entra para acompanhar', async () => {
    m.treino = new LiderancaError(403, 'fora');
    const el: any = await Page();
    expect(el.props).toMatchObject({ podeTreinar: false, podeAcompanhar: true });
  });

  it('🔴 falha de leitura (503) sobe como erro, em vez de virar "não pode treinar"', async () => {
    m.treino = new LiderancaError(503, 'Não foi possível consultar o acesso ao simulador.');
    m.equipe = new LiderancaError(403, 'Seu perfil não permite acompanhar esta equipe.');
    await expect(Page()).rejects.toMatchObject({ status: 503 });
  });

  it('o RH (que só acompanha) recebe o link do Mapeamento dele; os demais, o padrão do componente', async () => {
    m.role = 'rh';
    m.treino = new LiderancaError(403, 'fora');
    const rh: any = await Page();
    expect(rh.props.mapeamento).toBe('/dashboard/gestor/prontidao-lideranca');
    m.role = 'gestor';
    const gestor: any = await Page();
    expect(gestor.props.mapeamento).toBeUndefined();
  });

  it('🔴 erro inesperado também sobe', async () => {
    m.equipe = new Error('timeout no pool');
    await expect(Page()).rejects.toThrow('timeout no pool');
  });
});
