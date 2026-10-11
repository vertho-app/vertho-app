import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

/**
 * Segundo fator para o PODER de plataforma (R-145, passo 3, 10/10/2026). A regra mora na derivação
 * de poder (`lib/authz.ts`, `lib/authz-plataforma.ts`), então este arquivo roda as funções REAIS e
 * simula só o que chega na requisição: o cookie de sessão e o Bearer, cada um com as claims que o
 * `getClaims` verificaria.
 *
 * O que prova: só libera com identidade VERIFICADA do MESMO e-mail em `aal2`; a dúvida nega
 * (sem sessão, outra pessoa, Bearer `aal1` com cookie alheio, níveis divergentes, fora de
 * requisição); o admin perde o poder, não a conta; consulta sobre outra pessoa só com
 * `fatoDoBanco`; quem não está na fase 1 segue como antes; e o `allow` POR USUÁRIO de quem é da
 * equipe não devolve, sem o código, o poder que o segundo fator tirou (pré-requisito da fase 2).
 */
type Claims = { email: string; aal: string } | null;
const estado = vi.hoisted(() => ({
  cookie: null as Claims,
  bearerToken: null as string | null,
  bearer: {} as Record<string, Claims>,
  semRequisicao: false,
  admins: [] as Array<{ email: string; role: string }>,
  colabs: [] as any[],
  sessaoEmail: null as string | null,
  overrides: [] as Array<{ scope_type: 'role' | 'user'; scope_key: string; permission_key: string; effect: 'allow' | 'deny' }>,
}));

const sb = criarSupabaseMock({
  resolver: (tabela, _cols, cadeia) => {
    if (tabela !== 'platform_admins') return null;
    const email = cadeia.find((c) => c.metodo === 'eq' && c.args[0] === 'email')?.args[1];
    const a = estado.admins.find((x) => x.email === email);
    return a ? { id: `pa-${email}`, role: a.role } : null;
  },
  lista: (tabela, _cols, cadeia) => {
    if (tabela === 'colaboradores') {
      const email = cadeia.find((c) => c.metodo === 'eq' && c.args[0] === 'email')?.args[1];
      return estado.colabs.filter((c) => c.email === email);
    }
    if (tabela === 'permission_overrides') {
      const chaves: string[] = cadeia.find((c) => c.metodo === 'in' && c.args[0] === 'scope_key')?.args[1] ?? [];
      return estado.overrides.filter((o) => chaves.includes(o.scope_key));
    }
    return [];
  },
});

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/auth/supabase-server', () => ({
  createSupabaseServerClient: async () => {
    if (estado.semRequisicao) throw new Error('cookies() fora de requisição');
    return {
      auth: {
        getClaims: async (jwt?: string) => {
          const claims = jwt === undefined ? estado.cookie : (estado.bearer[jwt] ?? null);
          return claims ? { data: { claims }, error: null } : { data: null, error: { message: 'sem sessão' } };
        },
        getUser: async () => ({ data: { user: estado.sessaoEmail ? { email: estado.sessaoEmail } : null }, error: null }),
      },
    };
  },
}));
vi.mock('next/headers', () => ({
  headers: async () => {
    if (estado.semRequisicao) throw new Error('headers() fora de requisição');
    return new Headers(estado.bearerToken ? { authorization: `Bearer ${estado.bearerToken}` } : {});
  },
  cookies: async () => ({ get: () => undefined, getAll: () => [] }),
}));

import { exigeSegundoFator, segundoFatorConfirmado } from '@/lib/auth/segundo-fator';
import { getUserContext, isPlatformAdmin } from '@/lib/authz';
import { checarAcessoPlataforma } from '@/lib/authz-plataforma';
import { requireAdminAction } from '@/lib/auth/action-context';
import { can, getEffectivePermissionKeys } from '@/lib/permissions';

const MASTER = 'rodrigo@vertho.ai';
const SOCIO = 'socio@vertho.ai';

beforeEach(() => {
  sb.reset();
  estado.cookie = null;
  estado.bearerToken = null;
  estado.bearer = {};
  estado.semRequisicao = false;
  estado.admins = [{ email: MASTER, role: 'master' }, { email: SOCIO, role: 'socio' }];
  estado.colabs = [{ id: 'c-rod', email: MASTER, empresa_id: 'emp-boehringer', role: 'colaborador', nome_completo: 'Rodrigo' }];
  estado.sessaoEmail = MASTER;
  estado.overrides = [];
  delete process.env.ADMIN_EMAILS;
});

describe('quem exige (fase 1)', () => {
  it('só o master, sem diferenciar maiúsculas', () => {
    expect(exigeSegundoFator(MASTER)).toBe(true);
    expect(exigeSegundoFator(' Rodrigo@Vertho.ai ')).toBe(true);
    expect(exigeSegundoFator(SOCIO)).toBe(false);
    expect(exigeSegundoFator('')).toBe(false);
  });
});

describe('segundoFatorConfirmado: só a mesma identidade verificada em aal2 libera', () => {
  it('cookie do mesmo e-mail em aal2: libera', async () => {
    estado.cookie = { email: MASTER, aal: 'aal2' };
    expect(await segundoFatorConfirmado(MASTER)).toBe(true);
  });
  it('cookie em aal1: nega', async () => {
    estado.cookie = { email: MASTER, aal: 'aal1' };
    expect(await segundoFatorConfirmado(MASTER)).toBe(false);
  });
  it('sessão de OUTRA pessoa em aal2: nega', async () => {
    estado.cookie = { email: 'outra@cliente.com', aal: 'aal2' };
    expect(await segundoFatorConfirmado(MASTER)).toBe(false);
  });
  it('sem sessão: nega', async () => {
    expect(await segundoFatorConfirmado(MASTER)).toBe(false);
  });
  it('fora de requisição (task, script): nega', async () => {
    estado.semRequisicao = true;
    expect(await segundoFatorConfirmado(MASTER)).toBe(false);
  });
  it('Bearer do master em aal1 com cookie de outra conta: nega', async () => {
    estado.cookie = { email: 'outra@cliente.com', aal: 'aal2' };
    estado.bearerToken = 'tok-master'; estado.bearer['tok-master'] = { email: MASTER, aal: 'aal1' };
    expect(await segundoFatorConfirmado(MASTER)).toBe(false);
  });
  it('mesmo e-mail em níveis diferentes (cookie aal2, Bearer aal1): nega', async () => {
    estado.cookie = { email: MASTER, aal: 'aal2' };
    estado.bearerToken = 'tok-master'; estado.bearer['tok-master'] = { email: MASTER, aal: 'aal1' };
    expect(await segundoFatorConfirmado(MASTER)).toBe(false);
  });
  it('Bearer verificado do master em aal2, sem cookie: libera', async () => {
    estado.bearerToken = 'tok-master'; estado.bearer['tok-master'] = { email: MASTER, aal: 'aal2' };
    expect(await segundoFatorConfirmado(MASTER)).toBe(true);
  });
  it('Bearer que o getClaims não verifica: nega', async () => {
    estado.bearerToken = 'forjado';
    expect(await segundoFatorConfirmado(MASTER)).toBe(false);
  });
});

describe('getUserContext / isPlatformAdmin: sem o código, perde o PODER, não a conta', () => {
  it('master em aal1: não é admin, segue como colaborador da Boehringer e fica com o fator pendente', async () => {
    estado.cookie = { email: MASTER, aal: 'aal1' };
    const ctx = await getUserContext(MASTER);
    expect(ctx).toMatchObject({ isPlatformAdmin: false, platformAdminRole: null, segundoFatorPendente: true, role: 'colaborador', empresaId: 'emp-boehringer' });
    expect(ctx?.colaborador?.id).toBe('c-rod');
    expect(await isPlatformAdmin(MASTER)).toBe(false);
  });

  it('master em aal2: admin master', async () => {
    estado.cookie = { email: MASTER, aal: 'aal2' };
    expect(await getUserContext(MASTER)).toMatchObject({ isPlatformAdmin: true, platformAdminRole: 'master', segundoFatorPendente: false });
    expect(await isPlatformAdmin(MASTER)).toBe(true);
  });

  it('consulta sobre outra pessoa (fatoDoBanco): devolve o papel do banco', async () => {
    estado.cookie = { email: 'outra@cliente.com', aal: 'aal1' };
    expect(await getUserContext(MASTER, { fatoDoBanco: true })).toMatchObject({ isPlatformAdmin: true, platformAdminRole: 'master' });
    expect(await isPlatformAdmin(MASTER, { fatoDoBanco: true })).toBe(true);
  });

  it('sócio (fora da fase 1) em aal1: segue admin, como antes', async () => {
    estado.cookie = { email: SOCIO, aal: 'aal1' };
    expect(await getUserContext(SOCIO)).toMatchObject({ isPlatformAdmin: true, platformAdminRole: 'socio', segundoFatorPendente: false });
  });

  it('quem não é admin não muda', async () => {
    estado.cookie = { email: 'pessoa@cliente.com', aal: 'aal1' };
    expect(await getUserContext('pessoa@cliente.com')).toMatchObject({ isPlatformAdmin: false, segundoFatorPendente: false });
  });
});

describe('o login fica FORA da regra', () => {
  it('canal e host do link decidem pelo fato do banco, não pelo poder da sessão (quem pede link ainda não tem sessão)', async () => {
    const { readFileSync } = await import('node:fs');
    for (const arquivo of ['lib/auth/conta-privilegiada.ts', 'app/api/auth/magic-link/route.ts']) {
      const fonte = readFileSync(arquivo, 'utf8');
      expect(fonte, arquivo).toMatch(/from\('platform_admins'\)/);
      expect(fonte, arquivo).not.toMatch(/\b(isPlatformAdmin|getUserContext|poderDePlataformaLiberado)\s*\(/);
    }
  });
});

describe('portão do painel e actions de admin', () => {
  it('master em aal1: o painel manda para o segundo fator', async () => {
    estado.cookie = { email: MASTER, aal: 'aal1' };
    expect(await checarAcessoPlataforma()).toEqual({ authorized: false, reason: 'segundo_fator', email: MASTER });
  });

  it('master em aal2: entra', async () => {
    estado.cookie = { email: MASTER, aal: 'aal2' };
    expect(await checarAcessoPlataforma()).toEqual({ authorized: true, email: MASTER });
  });

  it('pela env ADMIN_EMAILS também exige o código (a env não vira atalho)', async () => {
    estado.admins = [];
    process.env.ADMIN_EMAILS = MASTER;
    estado.cookie = { email: MASTER, aal: 'aal1' };
    expect((await checarAcessoPlataforma()).reason).toBe('segundo_fator');
    estado.cookie = { email: MASTER, aal: 'aal2' };
    expect((await checarAcessoPlataforma()).authorized).toBe(true);
  });

  it('quem não é da equipe: sem permissão (não vai para o segundo fator)', async () => {
    estado.sessaoEmail = 'pessoa@cliente.com';
    estado.cookie = { email: 'pessoa@cliente.com', aal: 'aal1' };
    expect(await checarAcessoPlataforma()).toEqual({ authorized: false, reason: 'unauthorized' });
  });

  it('requireAdminAction recusa o master em aal1 e aceita em aal2', async () => {
    estado.cookie = { email: MASTER, aal: 'aal1' };
    await expect(requireAdminAction()).rejects.toThrow(/platform admin/);
    estado.cookie = { email: MASTER, aal: 'aal2' };
    await expect(requireAdminAction()).resolves.toMatchObject({ isPlatformAdmin: true, email: MASTER });
  });
});

describe('allow POR USUÁRIO de quem é da equipe só vale com o poder de plataforma', () => {
  const allowDoUsuario = (email: string, permission_key: string) =>
    ({ scope_type: 'user' as const, scope_key: `user:${email}`, permission_key, effect: 'allow' as const });

  it('master em aal1: o allow por usuário não devolve o que o segundo fator tirou; o deny segue valendo', async () => {
    estado.overrides = [
      allowDoUsuario(MASTER, 'permissions.manage'),
      { scope_type: 'user', scope_key: `user:${MASTER}`, permission_key: 'assessments.answer', effect: 'deny' },
    ];
    estado.cookie = { email: MASTER, aal: 'aal1' };
    const ctx = { ...(await getUserContext(MASTER))!, email: MASTER };
    expect(ctx.segundoFatorPendente).toBe(true);
    expect(await can(ctx, 'permissions.manage')).toBe(false);
    expect(await can(ctx, 'assessments.answer')).toBe(false);
    expect(await can(ctx, 'journey.own.view')).toBe(true); // o papel do tenant fica
  });

  it('contexto montado à mão, sem o campo segundoFatorPendente: decide pelo banco e também suspende', async () => {
    estado.overrides = [allowDoUsuario(MASTER, 'permissions.manage')];
    expect(await can({ role: 'colaborador', isPlatformAdmin: false, email: MASTER }, 'permissions.manage')).toBe(false);
  });

  it('o allow do PAPEL do tenant continua valendo para o master sem o código (só o do usuário é suspenso)', async () => {
    estado.overrides = [
      { scope_type: 'role', scope_key: 'role:colaborador', permission_key: 'journey.team.view', effect: 'allow' },
      allowDoUsuario(MASTER, 'permissions.manage'),
    ];
    estado.cookie = { email: MASTER, aal: 'aal1' };
    const ctx = { ...(await getUserContext(MASTER))!, email: MASTER };
    expect(await can(ctx, 'journey.team.view')).toBe(true);
    expect(await can(ctx, 'permissions.manage')).toBe(false);
  });

  it('sócio (fora da fase 1) com allow por usuário: vale, como antes', async () => {
    estado.overrides = [allowDoUsuario(SOCIO, 'permissions.manage')];
    estado.cookie = { email: SOCIO, aal: 'aal1' };
    const ctx = { ...(await getUserContext(SOCIO))!, email: SOCIO };
    expect(ctx.platformAdminRole).toBe('socio');
    expect(await can(ctx, 'permissions.manage')).toBe(true);
  });

  it('quem não é da equipe não muda: o allow por usuário vale', async () => {
    estado.overrides = [allowDoUsuario('pessoa@cliente.com', 'reports.aggregate.view')];
    expect(await can({ role: 'colaborador', isPlatformAdmin: false, email: 'pessoa@cliente.com' }, 'reports.aggregate.view')).toBe(true);
  });

  it('leitura de platform_admins falhando: a dúvida suspende o allow por usuário', async () => {
    estado.overrides = [allowDoUsuario('pessoa@cliente.com', 'reports.aggregate.view')];
    sb.falharEm({ tabela: 'platform_admins', op: 'select', mensagem: 'timeout no pool' });
    expect(await can({ role: 'colaborador', isPlatformAdmin: false, email: 'pessoa@cliente.com' }, 'reports.aggregate.view')).toBe(false);
  });

  it('sem allow por usuário, a régua não consulta a platform_admins', async () => {
    estado.overrides = [{ scope_type: 'role', scope_key: 'role:colaborador', permission_key: 'journey.team.view', effect: 'allow' }];
    const keys = await getEffectivePermissionKeys({ role: 'colaborador', isPlatformAdmin: false, email: MASTER });
    expect(keys.has('journey.team.view')).toBe(true);
    expect(sb.usou('platform_admins', 'eq', 'email')).toBe(false);
  });
});
