import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * O `/api/me` decide quais simuladores o menu mostra.
 *
 * 17/09/2026 (pedido do dono): gestor e RH veem atendimento e vendas como
 * ACOMPANHAMENTO (sem depender da liberação por cargo, que diz quem treina), e
 * o gestor ganha o simulador de liderança quando responde o trilho.
 */
const mocks = vi.hoisted(() => ({
  colab: null as any,
  platformAdmin: false,
  recepcao: true,
  vendas: true,
  lideranca: false,
  acesso: { vendas: false, atendimento: false, lideranca: false },
  trilho: { ok: true } as any,
  resolver: vi.fn(),
}));

const sb = criarSupabaseMock({
  resolver: (tabela) => {
    if (tabela === 'empresas') return { default_locale: 'pt-BR', sys_config: { modulos: { prontidao_lideranca: true } } };
    if (tabela === 'cargos_empresa') return { top5_workshop: [] };
    return null;
  },
});

vi.mock('@/lib/auth/supabase-server', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: async () => ({ data: { user: { email: 'carla.demo@vertho.ai' } } }) } }),
}));
vi.mock('@/lib/authz', () => ({
  findColabByEmail: async () => mocks.colab,
  isPlatformAdmin: async () => mocks.platformAdmin,
}));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/recepcao/flag', () => ({ recepcaoHabilitada: async () => mocks.recepcao }));
vi.mock('@/lib/simulador-vendas/access', () => ({ vendasHabilitado: async () => mocks.vendas }));
vi.mock('@/lib/prontidao-lideranca/habilitado', () => ({ prontidaoLiderancaHabilitada: async () => mocks.lideranca }));
vi.mock('@/lib/simuladores/acesso', () => ({ acessoSimuladoresDoColaborador: async () => mocks.acesso }));
vi.mock('@/lib/prontidao-lideranca/trilho', () => ({
  resolverTrilhoLideranca: (...args: any[]) => { mocks.resolver(...args); return Promise.resolve(mocks.trilho); },
}));

import { GET } from '@/app/api/me/route';

const cadastro = (role: string) => ({
  id: 'colab-carla', nome_completo: 'Carla Menezes', role, empresa_id: 'acme', cargo: 'Gerente Comercial', locale: null,
});

async function me() {
  const res = await GET();
  return res.json();
}

describe('/api/me: simuladores no menu', () => {
  beforeEach(() => {
    sb.reset();
    mocks.resolver.mockClear();
    mocks.platformAdmin = false;
    mocks.recepcao = true;
    mocks.vendas = true;
    mocks.lideranca = false;
    mocks.acesso = { vendas: false, atendimento: false, lideranca: false };
    mocks.trilho = { ok: true };
  });

  it.each(['gestor', 'rh'])('🔴 %s acompanha atendimento e vendas sem depender da liberação do cargo', async (role) => {
    mocks.colab = cadastro(role);
    const body = await me();
    expect(body).toMatchObject({ treinoRecepcao: true, treinoVendas: true, soAcompanhaSimuladores: true });
  });

  it('colaborador continua dependendo da liberação do cargo', async () => {
    mocks.colab = cadastro('colaborador');
    expect(await me()).toMatchObject({ treinoRecepcao: false, treinoVendas: false, soAcompanhaSimuladores: false });
    mocks.acesso = { vendas: true, atendimento: true, lideranca: false };
    expect(await me()).toMatchObject({ treinoRecepcao: true, treinoVendas: true, soAcompanhaSimuladores: false });
  });

  it('empresa sem o simulador não mostra nem o acompanhamento', async () => {
    mocks.colab = cadastro('gestor');
    mocks.recepcao = false;
    mocks.vendas = false;
    expect(await me()).toMatchObject({ treinoRecepcao: false, treinoVendas: false });
  });

  it('🔴 gestor ganha o simulador de liderança quando responde o trilho', async () => {
    mocks.colab = cadastro('gestor');
    mocks.lideranca = true;
    mocks.acesso = { vendas: false, atendimento: false, lideranca: true };
    expect(await me()).toMatchObject({ simuladorLideranca: true });
    // a régua do trilho recebe a pessoa inteira: id (turma), e-mail (internos) e cargo (variante)
    expect(mocks.resolver).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      id: 'colab-carla', empresa_id: 'acme', cargo: 'Gerente Comercial', role: 'gestor', email: 'carla.demo@vertho.ai',
    }), expect.objectContaining({ modulos: { prontidao_lideranca: true } }));

    mocks.trilho = { ok: false, code: 'FORA_DA_POPULACAO' };
    expect(await me()).toMatchObject({ simuladorLideranca: false });
  });

  it('sem módulo, sem liberação do cargo, ou RH: sem treino de liderança e sem consulta', async () => {
    mocks.acesso = { vendas: false, atendimento: false, lideranca: true };
    mocks.colab = cadastro('gestor');
    mocks.lideranca = false;
    expect(await me()).toMatchObject({ simuladorLideranca: false });

    mocks.lideranca = true;
    mocks.acesso = { vendas: false, atendimento: false, lideranca: false };
    expect(await me()).toMatchObject({ simuladorLideranca: false });

    mocks.acesso = { vendas: false, atendimento: false, lideranca: true };
    for (const role of ['rh']) {
      mocks.colab = cadastro(role);
      expect(await me()).toMatchObject({ simuladorLideranca: false });
    }
    expect(mocks.resolver).not.toHaveBeenCalled();
  });

  // A aba de cargos diz só quem TREINA (decisão do dono, 22/09/2026): o item do
  // Mapeamento de liderança depende do módulo, e o menu o mostra só ao RH (`rhOnly`).
  it('🔴 o Mapeamento aparece para o RH com o próprio cargo fora do simulador', async () => {
    mocks.colab = cadastro('rh');
    mocks.lideranca = true;
    mocks.acesso = { vendas: false, atendimento: false, lideranca: false };
    expect(await me()).toMatchObject({ prontidaoLideranca: true, liderancaEquipe: true });
    mocks.lideranca = false;
    expect(await me()).toMatchObject({ prontidaoLideranca: false, liderancaEquipe: false });
  });

  it('futuro líder dentro da população configurada também encontra o treino', async () => {
    mocks.colab = cadastro('colaborador');
    mocks.lideranca = true;
    mocks.acesso = { vendas: false, atendimento: false, lideranca: true };
    expect(await me()).toMatchObject({ simuladorLideranca: true });
  });

  it('falha ao ler a configuração esconde o item, sem derrubar a rota', async () => {
    mocks.colab = cadastro('gestor');
    mocks.lideranca = true;
    mocks.acesso = { vendas: false, atendimento: false, lideranca: true };
    sb.falharEm({ tabela: 'empresas', op: 'select', mensagem: 'timeout' });
    const body = await me();
    expect(body).toMatchObject({ simuladorLideranca: false, nome_completo: 'Carla Menezes' });
  });

  it('o id do cadastro não sai na resposta', async () => {
    mocks.colab = cadastro('gestor');
    const body = await me();
    expect(body).not.toHaveProperty('id');
    expect(body.nome_completo).toBe('Carla Menezes');
  });
});
