/**
 * R-78 (revisão de 02/10/2026): "Entrar com senha" aparecia para todos, mas
 * não há como definir senha nem "esqueci a senha"; o erro vinha do Supabase em
 * inglês; e o modo senha pulava a escolha de organização (quem está em duas
 * caía em "Colaborador não encontrado." sem saída).
 *
 * Aqui: onde a senha é oferecida (a regra e a página que a aplica), o erro
 * traduzido e a tela sem cadastro com saída, nos 4 idiomas.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement, isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';

let slugDoHost: string | null = null;
let tenant: any = null;

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'user-agent': 'Mozilla/5.0', ...(slugDoHost ? { 'x-tenant-slug': slugDoHost } : {}) }),
}));
vi.mock('next/server', async (orig) => ({ ...(await orig<any>()), connection: async () => undefined }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (k: string) => k }));
vi.mock('@/lib/tenant-resolver', () => ({
  getTenantSlug: (h: Headers) => h.get('x-tenant-slug'),
  resolveTenant: async () => tenant,
}));
vi.mock('@/lib/supabase-browser', () => ({ getSupabase: () => ({ auth: {} }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: () => {} }) }));

const { senhaDisponivelNoLogin, chaveDoErroDeSenha, ehDestinoDoPainel } = await import('@/lib/auth/login-senha');
const { default: LoginPage } = await import('@/app/login/page');
const { default: LoginForm } = await import('@/app/login/login-form');

const LOCALES = ['pt-BR', 'pt-PT', 'es-ES', 'en-US'];
const pt = JSON.parse(readFileSync('messages/pt-BR.json', 'utf8'));

beforeEach(() => {
  slugDoHost = null;
  tenant = null;
});

describe('R-78 · onde a senha é oferecida', () => {
  it('🔴 endereço genérico, sem pedido de painel nem ?senha=1: não oferece', () => {
    expect(senhaDisponivelNoLogin({ tenantDemo: false })).toBe(false);
    expect(senhaDisponivelNoLogin({ tenantDemo: false, redirect: '/dashboard', senha: null })).toBe(false);
    expect(senhaDisponivelNoLogin({ tenantDemo: false, senha: '0' })).toBe(false);
  });

  it('oferece no tenant de demonstração, no pedido do painel e com ?senha=1', () => {
    expect(senhaDisponivelNoLogin({ tenantDemo: true })).toBe(true);
    expect(senhaDisponivelNoLogin({ tenantDemo: false, redirect: '/admin/dashboard' })).toBe(true);
    expect(senhaDisponivelNoLogin({ tenantDemo: false, redirect: '/admin-v2' })).toBe(true);
    expect(senhaDisponivelNoLogin({ tenantDemo: false, senha: '1' })).toBe(true);
  });

  it('a régua do painel não casa caminho que só começa parecido', () => {
    expect(ehDestinoDoPainel('/administracao')).toBe(false);
    expect(ehDestinoDoPainel('/admin?x=1')).toBe(true);
    expect(ehDestinoDoPainel(null)).toBe(false);
  });
});

describe('R-78 · a página decide no servidor e o formulário obedece', () => {
  async function propsDaPagina(searchParams: Record<string, string> = {}) {
    const el: any = await LoginPage({ searchParams: Promise.resolve(searchParams) });
    expect(isValidElement(el)).toBe(true);
    return el.props;
  }

  it('🔴 tenant de cliente: sem senha; tenant de demonstração: com senha', async () => {
    slugDoHost = 'macae';
    tenant = { id: 'e1', nome: 'Macaé', slug: 'macae', ui_config: {}, is_demo: false };
    expect((await propsDaPagina()).senhaDisponivel).toBe(false);
    tenant = { ...tenant, slug: 'acme-demo', is_demo: true };
    expect((await propsDaPagina()).senhaDisponivel).toBe(true);
  });

  it('endereço genérico: só com ?senha=1 ou pedido do painel', async () => {
    expect((await propsDaPagina()).senhaDisponivel).toBe(false);
    expect((await propsDaPagina({ senha: '1' })).senhaDisponivel).toBe(true);
    expect((await propsDaPagina({ redirect: '/admin/dashboard' })).senhaDisponivel).toBe(true);
  });

  function renderizar(senhaDisponivel: boolean) {
    return renderToStaticMarkup(createElement(NextIntlClientProvider, {
      locale: 'pt-BR',
      messages: pt,
      timeZone: 'America/Sao_Paulo',
      children: createElement(LoginForm, { branding: { tenantName: 'Vertho', subtitle: 'x' }, senhaDisponivel }),
    }));
  }

  it('🔴 sem senha disponível, o formulário não mostra "Entrar com senha"', () => {
    expect(renderizar(false)).not.toContain(pt.Login.enterWithPassword);
    expect(renderizar(true)).toContain(pt.Login.enterWithPassword);
  });
});

describe('R-78 · erro de senha traduzido', () => {
  it('credencial errada vira "e-mail ou senha incorretos"; o resto, falha genérica', () => {
    expect(chaveDoErroDeSenha({ code: 'invalid_credentials', message: 'Invalid login credentials' })).toBe('errors.wrongPassword');
    expect(chaveDoErroDeSenha({ message: 'Invalid login credentials' })).toBe('errors.wrongPassword');
    expect(chaveDoErroDeSenha({ status: 500, message: 'Database error' })).toBe('errors.passwordLogin');
    expect(chaveDoErroDeSenha(null)).toBe('errors.passwordLogin');
  });

  it('as mensagens existem nos 4 idiomas, e a tela sem cadastro tem texto e ação', () => {
    for (const locale of LOCALES) {
      const m = JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8'));
      expect(typeof m.Login.errors.wrongPassword, locale).toBe('string');
      expect(typeof m.Login.errors.passwordLogin, locale).toBe('string');
      expect(typeof m.DashboardHome.missingCollaboratorBody, locale).toBe('string');
      expect(typeof m.DashboardHome.missingCollaboratorAction, locale).toBe('string');
    }
  });

  it('a tela sem cadastro tem a saída (sair e entrar de novo), e não só o aviso', () => {
    const fonte = readFileSync('app/dashboard/page.tsx', 'utf8');
    const bloco = fonte.slice(fonte.indexOf('data-dashboard="sem-colaborador"'));
    const ate = bloco.slice(0, bloco.indexOf('</div>'));
    expect(ate).toContain("t('missingCollaboratorAction')");
    expect(ate).toContain('signOut');
    expect(ate).toContain("router.replace('/login')");
  });
});
