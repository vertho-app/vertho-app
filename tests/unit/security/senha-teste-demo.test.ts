import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

/**
 * R-19 (revisão de 02/10/2026): "Definir senha teste123" existia no pipeline de
 * QUALQUER empresa. A senha vai para o `auth.users`, que é global por e-mail:
 * num cliente real ela valeria no login de verdade de cada pessoa, e na mesma
 * pessoa em outras empresas. Sem auditoria.
 */
const estado = vi.hoisted(() => ({
  empresa: null as any,
  demoEmails: [] as any[],
  admins: [] as any[],
  empresas: [] as any[],
  vinculosReais: [] as any[],
}));

const sb = criarSupabaseMock({
  resolver: (tabela) => (tabela === 'empresas' ? estado.empresa : null),
  lista: (tabela, _cols, cadeia) => {
    if (tabela === 'platform_admins') return estado.admins;
    if (tabela === 'empresas') return estado.empresas;
    if (tabela === 'colaboradores') {
      const porEmpresaReal = cadeia.some((c) => c.metodo === 'in' && c.args[0] === 'empresa_id');
      if (!porEmpresaReal) return estado.demoEmails;
      const lote: string[] = cadeia.find((c) => c.metodo === 'in' && c.args[0] === 'email')?.args[1] || [];
      return estado.vinculosReais.filter((v) => lote.includes(v.email));
    }
    return [];
  },
});
const authAdmin = {
  listUsers: vi.fn(async () => ({ data: { users: [{ id: 'u-ana', email: 'ana.demo@vertho.ai' }] }, error: null })),
  updateUserById: vi.fn(async () => ({ error: null })),
  createUser: vi.fn(async () => ({ error: null })),
};
sb.client.auth = { admin: authAdmin };

const logAdminAction = vi.fn(async () => {});
vi.mock('@/lib/auth/action-context', () => ({ requireAdminAction: async () => ({ email: 'master@vertho.ai', isPlatformAdmin: true }) }));
vi.mock('@/lib/admin-supabase', () => ({ requireAdminSupabase: async () => sb.client }));
vi.mock('@/lib/audit', () => ({ logAdminAction: (...a: any[]) => (logAdminAction as any)(...a) }));
vi.mock('@/lib/vercel-domain', () => ({ removeVercelDomain: vi.fn() }));
vi.mock('@/lib/internal-emails', () => ({ excludeInternalEmails: (q: any) => q }));
vi.mock('@/lib/simulador-vendas/exclusao', () => ({ preverExclusaoPace: vi.fn(), excluirCadastroComBackupPace: vi.fn() }));
vi.mock('@/lib/simulador-vendas/core', () => ({ SimuladorError: class extends Error {} }));

import { definirSenhaTesteEmpresa } from '@/app/admin/empresas/[empresaId]/actions';

const senhasGravadas = () => authAdmin.updateUserById.mock.calls.length + authAdmin.createUser.mock.calls.length;

describe('definirSenhaTesteEmpresa só em empresa de demonstração (R-19)', () => {
  beforeEach(() => {
    sb.reset();
    logAdminAction.mockClear();
    authAdmin.updateUserById.mockClear();
    authAdmin.createUser.mockClear();
    authAdmin.listUsers.mockClear();
    estado.demoEmails = [
      { email: 'ana.demo@vertho.ai' },
      { email: 'bruno.demo@vertho.ai' },
      { email: 'socia@vertho.ai' },
      { email: 'professora@escola.com' },
    ];
    estado.admins = [{ email: 'socia@vertho.ai' }];
    estado.empresas = [
      { id: 'demo-1', is_demo: true },
      { id: 'real-1', is_demo: false },
      { id: 'demo-2', is_demo: true },
    ];
    // A professora treinou na demo E é colaboradora de um cliente real.
    estado.vinculosReais = [{ id: 'c-real', email: 'professora@escola.com' }];
  });

  it('🔴 empresa que NÃO é demo: recusa com motivo, não grava senha nenhuma e audita a recusa', async () => {
    estado.empresa = { id: 'real-1', nome: 'Cliente Real', slug: 'cliente', is_demo: false };
    const r: any = await definirSenhaTesteEmpresa('real-1');
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/demonstração/);
    expect(senhasGravadas()).toBe(0);
    expect(authAdmin.listUsers).not.toHaveBeenCalled();
    expect(logAdminAction).toHaveBeenCalledWith(expect.objectContaining({ acao: 'empresa.senha_teste', resultado: 'erro', empresaId: 'real-1' }));
  });

  it('is_demo ausente conta como NÃO demo (fail-closed)', async () => {
    estado.empresa = { id: 'x', nome: 'Sem flag', slug: 'x', is_demo: null };
    const r: any = await definirSenhaTesteEmpresa('x');
    expect(r.success).toBe(false);
    expect(senhasGravadas()).toBe(0);
  });

  it('🔴 demo: pula o admin da plataforma e quem tem cadastro em empresa real; só as personas recebem', async () => {
    estado.empresa = { id: 'demo-1', nome: 'ACME', slug: 'acme-demo', is_demo: true };
    const r: any = await definirSenhaTesteEmpresa('demo-1');
    expect(r.success).toBe(true);

    const alcançados = [
      ...authAdmin.updateUserById.mock.calls.map((c: any[]) => c[0]),
      ...authAdmin.createUser.mock.calls.map((c: any[]) => c[0].email),
    ];
    expect(alcançados.sort()).toEqual(['bruno.demo@vertho.ai', 'u-ana'].sort());
    expect(r.message).toMatch(/2 conta\(s\) pulada\(s\)/);

    // A busca por cadastro real é escopada às empresas que não são demo.
    const busca = sb.chamadas.find((c) => c.tabela === 'colaboradores' && c.metodo === 'in' && c.args[0] === 'empresa_id');
    expect(busca?.args[1]).toEqual(['real-1']);

    expect(logAdminAction).toHaveBeenCalledWith(expect.objectContaining({
      acao: 'empresa.senha_teste',
      resultado: 'ok',
      detalhes: expect.objectContaining({ pulados_admin_plataforma: 1, pulados_outra_empresa: 1, atualizados: 1, criados: 1 }),
    }));
  });

  it('falha ao ler os admins da plataforma recusa tudo (não vira "ninguém a proteger")', async () => {
    estado.empresa = { id: 'demo-1', nome: 'ACME', slug: 'acme-demo', is_demo: true };
    sb.falharEm({ tabela: 'platform_admins', op: 'select', mensagem: 'timeout' });
    const r: any = await definirSenhaTesteEmpresa('demo-1');
    expect(r.success).toBe(false);
    expect(senhasGravadas()).toBe(0);
  });

  it('falha ao ler a empresa recusa (não vira "é demo")', async () => {
    estado.empresa = { id: 'demo-1', nome: 'ACME', slug: 'acme-demo', is_demo: true };
    sb.falharEm({ tabela: 'empresas', op: 'select', mensagem: 'timeout' });
    const r: any = await definirSenhaTesteEmpresa('demo-1');
    expect(r.success).toBe(false);
    expect(senhasGravadas()).toBe(0);
  });
});

describe('a tela só oferece o botão em empresa de demonstração', () => {
  it('o botão fica dentro da condição de is_demo', () => {
    const tela = readFileSync('app/admin/empresas/[empresaId]/page.tsx', 'utf8');
    const cond = tela.indexOf('data?.empresa?.is_demo === true');
    const botao = tela.indexOf('definirSenhaTesteEmpresa(empresaId)');
    expect(cond).toBeGreaterThan(-1);
    expect(botao).toBeGreaterThan(cond);
    // E a leitura do pipeline traz a coluna que a condição lê.
    expect(readFileSync('app/admin/empresas/[empresaId]/actions.ts', 'utf8')).toContain("select('id, nome, segmento, slug, ui_config, sys_config, is_demo')");
  });
});
