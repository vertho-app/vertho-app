import { describe, expect, it } from 'vitest';
import { detectRewriteSubdomain, extractTenantSlug, resolveRadarbettRedirect } from '@/proxy';

describe('proxy multi-tenant routing', () => {
  it('extrai tenant de subdominios vertho.ai e ignora dominios raiz', () => {
    expect(extractTenantSlug('macae.vertho.ai')).toBe('macae');
    expect(extractTenantSlug('bett.vertho.ai')).toBe('bett');
    expect(extractTenantSlug('macae.vertho.ai:443')).toBe('macae');
    expect(extractTenantSlug('vertho.ai')).toBeNull();
    expect(extractTenantSlug('app.vertho.ai')).toBeNull();
    expect(extractTenantSlug('www.vertho.ai')).toBeNull();
    expect(extractTenantSlug('preview.vercel.app')).toBeNull();
  });

  it('mantem subdominios publicos reservados como rewrites, nao tenants', () => {
    expect(extractTenantSlug('radar.vertho.ai')).toBeNull();
    expect(extractTenantSlug('radarbett.vertho.ai')).toBeNull();
    expect(extractTenantSlug('imprensa.vertho.ai')).toBeNull();
    expect(detectRewriteSubdomain('radar.vertho.ai')).toBe('/radar');
    expect(detectRewriteSubdomain('imprensa.vertho.ai')).toBe('/imprensa');
    // radarbett saiu dos rewrites (descontinuado → redirect)
    expect(detectRewriteSubdomain('radarbett.vertho.ai')).toBeNull();
  });

  it('radarbett descontinuado: deep-links vao pro radar, o resto pra home institucional', () => {
    // Deep-links com equivalente preservam o path no radar
    expect(resolveRadarbettRedirect('radarbett.vertho.ai', '/escola/35010591')).toBe('https://radar.vertho.ai/escola/35010591');
    expect(resolveRadarbettRedirect('radarbett.vertho.ai', '/municipio/3550308')).toBe('https://radar.vertho.ai/municipio/3550308');
    expect(resolveRadarbettRedirect('radarbett.vertho.ai', '/comparar')).toBe('https://radar.vertho.ai/comparar');
    expect(resolveRadarbettRedirect('radarbett.vertho.ai', '/metodologia')).toBe('https://radar.vertho.ai/metodologia');
    expect(resolveRadarbettRedirect('radarbett.vertho.ai:443', '/escola/1')).toBe('https://radar.vertho.ai/escola/1');
    // Home e paths sem equivalente vao pra vertho.ai
    expect(resolveRadarbettRedirect('radarbett.vertho.ai', '/')).toBe('https://vertho.ai');
    expect(resolveRadarbettRedirect('radarbett.vertho.ai', '/jornada')).toBe('https://vertho.ai');
    expect(resolveRadarbettRedirect('radarbett.vertho.ai', '/buscar')).toBe('https://vertho.ai');
    // Não-radarbett não redireciona
    expect(resolveRadarbettRedirect('radar.vertho.ai', '/escola/1')).toBeNull();
    expect(resolveRadarbettRedirect('vertho.ai', '/')).toBeNull();
  });

  it('suporta dominio legado vertho.com.br durante migracao', () => {
    expect(extractTenantSlug('cliente.vertho.com.br')).toBe('cliente');
    expect(extractTenantSlug('app.vertho.com.br')).toBeNull();
    expect(detectRewriteSubdomain('radar.vertho.com.br')).toBe('/radar');
  });
});
