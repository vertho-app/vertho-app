import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * R-75 (revisão de 02/10/2026): open redirect depois do login.
 *
 * `next` (no `/auth/callback`) e `redirect` (na tela de login) eram aceitos com
 * `startsWith('/')`, e `//outro-site` começa com uma barra. A pessoa clicava no
 * link de acesso legítimo, a sessão nascia, e o último passo do login a levava
 * para fora do Vertho. Os três pontos usam agora `lib/auth/caminho-local.ts`.
 */
vi.mock('next/headers', () => ({ cookies: async () => ({ set: vi.fn() }) }));
vi.mock('@/lib/i18n-server', () => ({ getLocaleForEmail: async () => null }));
vi.mock('@/lib/auth/supabase-server', () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      verifyOtp: async () => ({ error: null }),
      exchangeCodeForSession: async () => ({ error: null }),
      getUser: async () => ({ data: { user: { email: 'pessoa@empresa.com' } } }),
      signOut: async () => ({ error: null }),
    },
  }),
}));
vi.mock('@/lib/demo/acme-prospect-tracking', () => ({
  readAcmeProspectAuthContext: () => null,
  recordAcmeProspectPersonalAccess: async () => true,
}));

import { ehCaminhoLocal, caminhoLocalOu } from '@/lib/auth/caminho-local';
import { resolveSafeAuthRedirect } from '@/lib/auth/redirect';
import { GET } from '@/app/auth/callback/route';

const EXTERNOS = [
  '//evil.example',
  '//evil.example/dashboard',
  '/\\evil.example',
  '\\\\evil.example',
  '/\t/evil.example',
  '/\n/evil.example',
  '/\r/evil.example',
  ' //evil.example',
  'https://evil.example',
  'http:evil.example',
  'javascript:alert(1)',
  'evil.example',
  '',
];

const LOCAIS = ['/dashboard', '/admin/dashboard', '/admin-v2', '/dashboard/gestor?turma=1#topo', '/v/abc123', '/%2F%2Fevil.example'];

describe('régua do caminho local', () => {
  it.each(EXTERNOS)('recusa %j', (valor) => {
    expect(ehCaminhoLocal(valor)).toBe(false);
    expect(caminhoLocalOu(valor)).toBe('/dashboard');
  });

  it.each(LOCAIS)('aceita %j', (valor) => {
    expect(ehCaminhoLocal(valor)).toBe(true);
    expect(caminhoLocalOu(valor)).toBe(valor);
  });

  it('valor que não é texto não vira destino', () => {
    for (const v of [null, undefined, 42, {}, ['/dashboard']]) expect(ehCaminhoLocal(v)).toBe(false);
  });
});

describe('/auth/callback só redireciona para o próprio host', () => {
  const chamar = (next: string) =>
    GET(new NextRequest(`https://empresa.vertho.ai/auth/callback?token_hash=h&type=email&next=${encodeURIComponent(next)}`));

  it.each(['//evil.example', '/\\evil.example', '/\t/evil.example'])('🔴 next=%j cai no /dashboard do próprio host', async (next) => {
    const r = await chamar(next);
    const destino = new URL(r.headers.get('location')!);
    expect(destino.host).toBe('empresa.vertho.ai');
    expect(destino.pathname).toBe('/dashboard');
  });

  it('caminho local segue intacto (controle positivo)', async () => {
    const r = await chamar('/admin/dashboard');
    const destino = new URL(r.headers.get('location')!);
    expect(destino.host).toBe('empresa.vertho.ai');
    expect(destino.pathname).toBe('/admin/dashboard');
  });
});

describe('resolveSafeAuthRedirect não monta `next` externo', () => {
  const req = new Request('https://app.vertho.ai/api/auth/magic-link', { headers: { host: 'app.vertho.ai' } });

  it('🔴 host certo com caminho `//outro-site` vira o caminho padrão', () => {
    const r = resolveSafeAuthRedirect(req, 'https://app.vertho.ai//evil.example');
    expect(r.nextPath).toBe('/dashboard');
  });

  it('caminho local é preservado', () => {
    const r = resolveSafeAuthRedirect(req, 'https://app.vertho.ai/admin/dashboard?x=1');
    expect(r.nextPath).toBe('/admin/dashboard?x=1');
  });
});

describe('a tela de login usa a mesma régua', () => {
  const TELA = readFileSync('app/login/login-form.tsx', 'utf8');

  it('o `?redirect=` passa por ehCaminhoLocal, não por startsWith', () => {
    expect(TELA).toContain('ehCaminhoLocal(redir)');
    expect(TELA).not.toMatch(/redir\s*&&\s*redir\.startsWith\('\/'\)/);
  });
});
