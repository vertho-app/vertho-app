import { describe, expect, it } from 'vitest';
import { detectRewriteSubdomain, extractTenantSlug, resolveSubdominioAposentado } from '@/proxy';

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

  it('so a imprensa segue como subdominio publico com rewrite', () => {
    expect(extractTenantSlug('radar.vertho.ai')).toBeNull();
    expect(extractTenantSlug('radarbett.vertho.ai')).toBeNull();
    expect(extractTenantSlug('imprensa.vertho.ai')).toBeNull();
    expect(detectRewriteSubdomain('imprensa.vertho.ai')).toBe('/imprensa');
    // radar saiu do ar publico em 10/08/2026 (virou interno); radarbett em 25/05
    expect(detectRewriteSubdomain('radar.vertho.ai')).toBeNull();
    expect(detectRewriteSubdomain('radarbett.vertho.ai')).toBeNull();
  });

  it('subdominios aposentados vao 301 pra home institucional, em um salto', () => {
    // Todo path vai pro mesmo destino: os deep-links do radarbett apontavam pro
    // radar publico, que deixou de existir — preserva-los seria 301 em cadeia
    // ate uma tela de login.
    expect(resolveSubdominioAposentado('radar.vertho.ai')).toBe('https://vertho.ai');
    expect(resolveSubdominioAposentado('radarbett.vertho.ai')).toBe('https://vertho.ai');
    expect(resolveSubdominioAposentado('radar.vertho.ai:443')).toBe('https://vertho.ai');
    expect(resolveSubdominioAposentado('radar.vertho.com.br')).toBe('https://vertho.ai');
    // Quem nao esta aposentado nao redireciona
    expect(resolveSubdominioAposentado('imprensa.vertho.ai')).toBeNull();
    expect(resolveSubdominioAposentado('acme.vertho.ai')).toBeNull();
    expect(resolveSubdominioAposentado('vertho.ai')).toBeNull();
  });

  it('suporta dominio legado vertho.com.br durante migracao', () => {
    expect(extractTenantSlug('cliente.vertho.com.br')).toBe('cliente');
    expect(extractTenantSlug('app.vertho.com.br')).toBeNull();
    expect(detectRewriteSubdomain('imprensa.vertho.com.br')).toBe('/imprensa');
  });
});
