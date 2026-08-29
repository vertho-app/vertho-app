import { describe, expect, it } from 'vitest';
import { proxy, stripTenantCookie } from '@/proxy';

/**
 * O tenant é decidido pelo HOSTNAME. Header e cookie de tenant que cheguem na
 * request são entrada do CLIENTE e precisam ser descartados — senão o apex e os
 * previews *.vercel.app dão contexto de qualquer tenant a um cliente anônimo
 * (enumeração de e-mail, signup em tenant alheio, OTP fora de contexto).
 */

function fakeRequest(host: string, headers: Record<string, string> = {}) {
  const url = new URL(`https://${host}/api/auth/check-email`);
  return {
    headers: new Headers({ host, ...headers }),
    nextUrl: Object.assign(url, { clone: () => new URL(url.href) }),
  } as any;
}

/** Header que o middleware repassa para a request (convenção do Next). */
function headerRepassado(res: Response, nome: string) {
  return res.headers.get(`x-middleware-request-${nome}`);
}

describe('proxy — tenant não pode vir do cliente', () => {
  it('descarta x-tenant-slug forjado no apex', async () => {
    const res = await proxy(fakeRequest('vertho.ai', { 'x-tenant-slug': 'macae' }));
    expect(headerRepassado(res, 'x-tenant-slug')).toBeNull();
  });

  it('descarta x-tenant-slug forjado em preview *.vercel.app', async () => {
    const res = await proxy(fakeRequest('vertho-abc123.vercel.app', { 'x-tenant-slug': 'macae' }));
    expect(headerRepassado(res, 'x-tenant-slug')).toBeNull();
  });

  it('descarta cookie de tenant forjado no apex, preservando os demais cookies', async () => {
    const res = await proxy(fakeRequest('vertho.ai', { cookie: 'sb-x-auth-token=abc; vertho-tenant-slug=macae' }));
    const cookie = headerRepassado(res, 'cookie') || '';
    expect(cookie).not.toContain('vertho-tenant-slug');
    expect(cookie).toContain('sb-x-auth-token=abc');
  });

  it('no subdomínio, o slug do HOST vence o header forjado', async () => {
    const res = await proxy(fakeRequest('ibipeba.vertho.ai', { 'x-tenant-slug': 'macae' }));
    expect(headerRepassado(res, 'x-tenant-slug')).toBe('ibipeba');
  });

  it('no host da apresentação, o alias fixo vence o header forjado', async () => {
    const res = await proxy(fakeRequest('gestor-demo.vertho.ai', { 'x-tenant-slug': 'macae' }));
    expect(headerRepassado(res, 'x-tenant-slug')).toBe('acme-demo');
  });
});

describe('stripTenantCookie', () => {
  it('remove só o cookie de tenant', () => {
    expect(stripTenantCookie('a=1; vertho-tenant-slug=macae; b=2')).toBe('a=1; b=2');
    expect(stripTenantCookie('vertho-tenant-slug=macae')).toBeNull();
    expect(stripTenantCookie('a=1')).toBe('a=1');
    expect(stripTenantCookie('')).toBeNull();
    expect(stripTenantCookie(null)).toBeNull();
  });

  it('não confunde cookie de nome parecido', () => {
    expect(stripTenantCookie('vertho-tenant-slug-old=x; a=1')).toBe('vertho-tenant-slug-old=x; a=1');
  });
});
