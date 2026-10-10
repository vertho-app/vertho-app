import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

/**
 * Acesso assistido (10/10/2026): "entrar como esta pessoa" substitui a senha previsível que o dono
 * usava para entrar no lugar de um usuário do cliente (R-145). O botão cria a SESSÃO de outra
 * pessoa, então o que este arquivo prova é quem passa e o que acontece antes do link:
 *
 *  - o gate roda inteiro (`requireAdminAction('users.impersonate')` -> `can()` -> overrides lidos
 *    de `permission_overrides`); só o login e o contexto do usuário são simulados;
 *  - nunca como admin da plataforma, nunca fora da empresa pedida, nunca criando conta;
 *  - sem registro na auditoria, nada é aberto (o registro vem ANTES do link).
 */
const estado = vi.hoisted(() => ({
  email: 'master@vertho.ai' as string | null,
  ctx: null as any,
  overrides: [] as any[],
  empresa: null as any,
  colab: null as any,
  admins: [] as string[],
  contas: [] as string[],
  auditoriaGrava: true,
  ordem: [] as string[],
  auditorias: [] as any[],
}));

const EMP = '11111111-1111-4111-8111-111111111111';
const OUTRA = '22222222-2222-4222-8222-222222222222';
const COLAB = '33333333-3333-4333-8333-333333333333';

const sb = criarSupabaseMock({
  resolver: (tabela, _cols, cadeia) => {
    const eq = (col: string) => cadeia.find((c) => c.metodo === 'eq' && c.args[0] === col)?.args[1];
    if (tabela === 'empresas') return estado.empresa && eq('id') === estado.empresa.id ? estado.empresa : null;
    if (tabela === 'colaboradores') {
      const c = estado.colab;
      return c && eq('id') === c.id && eq('empresa_id') === c.empresa_id ? c : null;
    }
    if (tabela === 'platform_admins') return estado.admins.includes(eq('email')) ? { id: `pa-${eq('email')}` } : null;
    return null;
  },
  lista: (tabela, _cols, cadeia) => {
    if (tabela === 'permission_overrides') {
      const chaves: string[] = cadeia.find((c) => c.metodo === 'in')?.args[1] || [];
      return estado.overrides.filter((o) => chaves.includes(o.scope_key));
    }
    return [];
  },
});

const listUsers = vi.fn(async ({ page, perPage }: { page: number; perPage: number }) => {
  const users = estado.contas.slice((page - 1) * perPage, page * perPage).map((email, i) => ({ id: `u-${page}-${i}`, email }));
  return { data: { users }, error: null as any };
});
const generateLink = vi.fn(async (_args: any) => {
  estado.ordem.push('link');
  return { data: { properties: { hashed_token: 'hash/123' } }, error: null as any };
});
(sb.client as any).auth = { admin: { listUsers, generateLink } };

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/auth/supabase-server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: estado.email ? { email: estado.email } : null }, error: null }) },
  }),
}));
vi.mock('@/lib/authz', () => ({ getUserContext: async () => (estado.ctx ? { ...estado.ctx } : null) }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/audit', () => ({
  logAdminAction: async (entry: any) => {
    estado.ordem.push('auditoria');
    estado.auditorias.push(entry);
    return estado.auditoriaGrava;
  },
}));

import { entrarComoPessoa, podeEntrarComoPessoa } from '@/actions/acesso-assistido';
import { tenantUrl } from '@/lib/domain';
import { BASE_ROLE_PERMISSIONS, PERMISSIONS } from '@/lib/permissions';

const MASTER = { role: 'colaborador', isPlatformAdmin: true, platformAdminRole: 'master', empresaId: null, colaborador: null };
const SOCIO = { role: 'colaborador', isPlatformAdmin: true, platformAdminRole: 'socio', empresaId: null, colaborador: null };
const RH = { role: 'rh', isPlatformAdmin: false, platformAdminRole: null, empresaId: EMP, colaborador: { id: 'c-rh' } };

const nadaAberto = () => {
  expect(generateLink).not.toHaveBeenCalled();
};

beforeEach(() => {
  sb.reset();
  listUsers.mockClear();
  generateLink.mockClear();
  estado.email = 'master@vertho.ai';
  estado.ctx = MASTER;
  estado.overrides = [];
  estado.empresa = { id: EMP, slug: 'macae' };
  estado.colab = { id: COLAB, empresa_id: EMP, nome_completo: 'Ana Souza', email: ' Ana@Cliente.com ' };
  estado.admins = ['master@vertho.ai', 'socia@vertho.ai'];
  estado.contas = ['outra@cliente.com', 'ana@cliente.com'];
  estado.auditoriaGrava = true;
  estado.ordem = [];
  estado.auditorias = [];
});

describe('a permissão', () => {
  it('é crítica, nasce só no Admin Master e não está no papel base de mais ninguém', () => {
    expect(PERMISSIONS.find((p) => p.key === 'users.impersonate')?.risk).toBe('critical');
    expect(BASE_ROLE_PERMISSIONS.platform_admin).toContain('users.impersonate');
    for (const papel of ['socio', 'rh', 'gestor', 'colaborador'] as const) {
      expect(BASE_ROLE_PERMISSIONS[papel], papel).not.toContain('users.impersonate');
    }
  });
});

describe('entrarComoPessoa: quem passa', () => {
  it('sem sessão: recusado, sem abrir nada', async () => {
    estado.email = null;
    await expect(entrarComoPessoa(EMP, COLAB)).rejects.toThrow(/UNAUTHORIZED/);
    nadaAberto();
    expect(estado.auditorias).toEqual([]);
  });

  it('RH do cliente: recusado (não é admin da plataforma)', async () => {
    estado.email = 'rh@cliente.com'; estado.ctx = RH;
    await expect(entrarComoPessoa(EMP, COLAB)).rejects.toThrow(/platform admin/);
    nadaAberto();
  });

  it('Sócio no papel base: recusado pela permissão', async () => {
    estado.email = 'socia@vertho.ai'; estado.ctx = SOCIO;
    await expect(entrarComoPessoa(EMP, COLAB)).rejects.toThrow(/users\.impersonate/);
    nadaAberto();
  });

  it('deny por usuário tira o acesso até do master', async () => {
    estado.overrides = [{ scope_type: 'user', scope_key: 'user:master@vertho.ai', permission_key: 'users.impersonate', effect: 'deny' }];
    await expect(entrarComoPessoa(EMP, COLAB)).rejects.toThrow(/users\.impersonate/);
    nadaAberto();
  });
});

describe('entrarComoPessoa: o master', () => {
  it('registra ANTES, gera o link de uso único no host da empresa e devolve o callback', async () => {
    const r = await entrarComoPessoa(EMP, COLAB);

    expect(r).toEqual({
      success: true,
      nome: 'Ana Souza',
      url: tenantUrl('macae', '/auth/callback?token_hash=hash%2F123&type=email&next=%2Fdashboard'),
    });
    expect(estado.ordem).toEqual(['auditoria', 'link']);
    expect(estado.auditorias[0]).toMatchObject({
      adminEmail: 'master@vertho.ai', acao: 'acesso_assistido.entrar', empresaId: EMP, empresaSlug: 'macae', alvo: COLAB,
      detalhes: { email: 'ana@cliente.com' },
    });
    expect(generateLink).toHaveBeenCalledWith({
      type: 'magiclink', email: 'ana@cliente.com', options: { redirectTo: tenantUrl('macae', '/dashboard') },
    });
    // A pessoa é lida DENTRO da empresa pedida.
    expect(sb.usou('colaboradores', 'eq', 'empresa_id')).toBe(true);
    // Nada é gravado no banco pelo acesso (além do registro da auditoria, que vai pelo logAdminAction).
    expect(sb.escritas).toEqual([]);
  });

  it('a conta de login é procurada em todas as páginas do Auth', async () => {
    estado.contas = [...Array.from({ length: 1000 }, (_, i) => `p${i}@cliente.com`), 'ana@cliente.com'];
    const r = await entrarComoPessoa(EMP, COLAB);
    expect(r.success).toBe(true);
    expect(listUsers).toHaveBeenCalledTimes(2);
  });
});

describe('entrarComoPessoa: o que recusa sem abrir nada', () => {
  it('ids que não são UUID: recusa antes de qualquer leitura', async () => {
    const r = await entrarComoPessoa('macae', COLAB);
    expect(r.success).toBe(false);
    expect(sb.chamadas.filter((c) => c.tabela !== 'permission_overrides')).toEqual([]);
    nadaAberto();
  });

  it('pessoa de OUTRA empresa: não encontrada', async () => {
    estado.colab = { ...estado.colab, empresa_id: OUTRA };
    const r = await entrarComoPessoa(EMP, COLAB);
    expect(r).toEqual({ success: false, error: 'Pessoa não encontrada nesta empresa.' });
    nadaAberto();
    expect(estado.auditorias).toEqual([]);
  });

  it('alvo que é admin da plataforma: recusado', async () => {
    estado.colab = { ...estado.colab, email: 'Socia@vertho.ai' };
    const r = await entrarComoPessoa(EMP, COLAB);
    expect(r).toEqual({ success: false, error: 'Não é possível entrar como um admin da plataforma.' });
    nadaAberto();
    expect(estado.auditorias).toEqual([]);
  });

  it('pessoa sem conta de login: recusa, e NÃO cria conta', async () => {
    estado.contas = ['outra@cliente.com'];
    const r = await entrarComoPessoa(EMP, COLAB);
    expect(r).toEqual({ success: false, error: 'Esta pessoa ainda não tem conta de login (nunca entrou).' });
    nadaAberto();
    expect(estado.auditorias).toEqual([]);
  });

  it('pessoa sem e-mail: recusa', async () => {
    estado.colab = { ...estado.colab, email: null };
    const r = await entrarComoPessoa(EMP, COLAB);
    expect(r.success).toBe(false);
    nadaAberto();
  });

  it('auditoria que não grava: nada é aberto', async () => {
    estado.auditoriaGrava = false;
    const r = await entrarComoPessoa(EMP, COLAB);
    expect(r).toEqual({ success: false, error: 'Não consegui registrar a entrada na auditoria, então nada foi aberto.' });
    nadaAberto();
  });

  it('falha ao ler platform_admins: recusa (não trata como "não é admin")', async () => {
    sb.falharEm({ tabela: 'platform_admins', op: 'select', mensagem: 'timeout' });
    const r = await entrarComoPessoa(EMP, COLAB);
    expect(r.success).toBe(false);
    nadaAberto();
  });

  it('falha ao listar as contas do Auth: recusa', async () => {
    listUsers.mockResolvedValueOnce({ data: { users: [] }, error: { message: 'auth fora do ar' } });
    const r = await entrarComoPessoa(EMP, COLAB);
    expect(r).toEqual({ success: false, error: 'Não consegui conferir a conta de login: auth fora do ar' });
    nadaAberto();
  });

  it('falha ao gerar o link: devolve o erro', async () => {
    generateLink.mockResolvedValueOnce({ data: null as any, error: { message: 'rate limit' } });
    const r = await entrarComoPessoa(EMP, COLAB);
    expect(r).toEqual({ success: false, error: 'Não consegui gerar o acesso: rate limit' });
  });
});

describe('podeEntrarComoPessoa (só decide se o botão aparece)', () => {
  it('master: sim', async () => {
    expect(await podeEntrarComoPessoa()).toBe(true);
  });
  it('Sócio no papel base, RH e sem sessão: não', async () => {
    estado.email = 'socia@vertho.ai'; estado.ctx = SOCIO;
    expect(await podeEntrarComoPessoa()).toBe(false);
    estado.email = 'rh@cliente.com'; estado.ctx = RH;
    expect(await podeEntrarComoPessoa()).toBe(false);
    estado.email = null;
    expect(await podeEntrarComoPessoa()).toBe(false);
  });
});
