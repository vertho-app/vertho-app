import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

let isDemo = true;
const contas = [
  { email: 'bruna.demo@vertho.ai', role: 'colaborador' },
  { email: 'carla.demo@vertho.ai', role: 'gestor' },
  { email: 'helena.demo@vertho.ai', role: 'rh' },
];

const sb = criarSupabaseMock({
  resolver: (tabela) => tabela === 'empresas' ? { id: 'demo-1', is_demo: isDemo } : null,
  lista: (tabela) => tabela === 'colaboradores' ? contas : [],
});

const updateUserById = vi.fn(async () => ({ data: {}, error: null }));
const createUser = vi.fn(async () => ({ data: {}, error: null }));
const listUsers = vi.fn(async () => ({
  data: { users: contas.map((c, i) => ({ id: `u${i + 1}`, email: c.email })), aud: 'authenticated' },
  error: null,
}));

sb.client.auth = { admin: { listUsers, updateUserById, createUser } };

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));

import { prepararAcessosDemo } from '@/lib/demo/reset-acme-demo';

describe('preparo dos acessos temporários do demo', () => {
  beforeEach(() => {
    isDemo = true;
    sb.reset();
    updateUserById.mockClear();
    createUser.mockClear();
    listUsers.mockClear();
  });

  it('rotaciona exatamente as três contas e devolve uma única senha', async () => {
    const r = await prepararAcessosDemo();

    expect(r.ok).toBe(true);
    expect(r.senha).toMatch(/^Demo-.+-Aa7!$/);
    expect(r.acessos?.map((a) => a.email)).toEqual(contas.map((c) => c.email));
    expect(updateUserById).toHaveBeenCalledTimes(3);
    expect(createUser).not.toHaveBeenCalled();
    const senhas = (updateUserById.mock.calls as any[][]).map((call) => call[1].password);
    expect(new Set(senhas)).toEqual(new Set([r.senha]));
  });

  it('não toca no Auth se o tenant não estiver marcado como demo', async () => {
    isDemo = false;
    vi.spyOn(console, 'error').mockImplementationOnce(() => {});

    const r = await prepararAcessosDemo();

    expect(r.ok).toBe(false);
    expect(r.error).toContain('não está marcado como demonstração');
    expect(listUsers).not.toHaveBeenCalled();
    expect(updateUserById).not.toHaveBeenCalled();
    expect(createUser).not.toHaveBeenCalled();
  });
});
