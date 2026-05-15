import { describe, expect, it } from 'vitest';
import { detectRewriteSubdomain, extractTenantSlug } from '@/proxy';

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
    expect(detectRewriteSubdomain('radarbett.vertho.ai')).toBe('/radarbett');
    expect(detectRewriteSubdomain('imprensa.vertho.ai')).toBe('/imprensa');
  });

  it('suporta dominio legado vertho.com.br durante migracao', () => {
    expect(extractTenantSlug('cliente.vertho.com.br')).toBe('cliente');
    expect(extractTenantSlug('app.vertho.com.br')).toBeNull();
    expect(detectRewriteSubdomain('radar.vertho.com.br')).toBe('/radar');
  });
});
