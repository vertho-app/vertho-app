import { describe, expect, it } from 'vitest';
import {
  demoPresentationUrl,
  getDemoPresentationRoleFromHostname,
  resolvePresentationTenantSlug,
} from '@/lib/demo/presentation';

describe('hosts da sala de apresentação', () => {
  it('identifica somente os aliases fixos', () => {
    expect(getDemoPresentationRoleFromHostname('usuario-demo.vertho.ai')?.key).toBe('usuario');
    expect(getDemoPresentationRoleFromHostname('gestor-demo.vertho.ai:443')?.key).toBe('gestor');
    expect(getDemoPresentationRoleFromHostname('rh-demo.vertho.ai')?.key).toBe('rh');
    expect(getDemoPresentationRoleFromHostname('acme-demo.vertho.ai')).toBeNull();
  });

  it('resolve os aliases para o tenant neutro, sem aceitar aproximações', () => {
    expect(resolvePresentationTenantSlug('usuario-demo')).toBe('acme-demo');
    expect(resolvePresentationTenantSlug('RH-DEMO')).toBe('acme-demo');
    expect(resolvePresentationTenantSlug('usuario-demo-falso')).toBeNull();
  });

  it('monta a home segura de cada papel', () => {
    expect(demoPresentationUrl('usuario', undefined, 'vertho.test')).toBe('https://usuario-demo.vertho.test/dashboard');
    expect(demoPresentationUrl('gestor', undefined, 'vertho.test')).toBe('https://gestor-demo.vertho.test/dashboard/gestor');
    expect(demoPresentationUrl('rh', '/dashboard', 'vertho.test')).toBe('https://rh-demo.vertho.test/dashboard');
  });
});
