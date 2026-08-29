import { describe, expect, it } from 'vitest';
import {
  demoPresentationUrl,
  getDemoPresentationRoleFromHostname,
  launchDemoPresentationAccess,
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

  it('consome o magic link antes de marcar a sessão como preparada', () => {
    const events: string[] = [];
    launchDemoPresentationAccess(
      { authUrl: 'https://usuario-demo.test/auth/callback?token=one-time', directUrl: 'https://usuario-demo.test/dashboard', prepared: false },
      (url) => events.push(`open:${url}`),
      () => events.push('mark'),
    );
    expect(events).toEqual([
      'open:https://usuario-demo.test/auth/callback?token=one-time',
      'mark',
    ]);
  });

  it('reabre direto somente depois que a sessão já foi preparada', () => {
    const events: string[] = [];
    launchDemoPresentationAccess(
      { authUrl: 'https://rh-demo.test/auth/callback?token=one-time', directUrl: 'https://rh-demo.test/dashboard', prepared: true },
      (url) => events.push(`open:${url}`),
      () => events.push('mark'),
    );
    expect(events).toEqual(['open:https://rh-demo.test/dashboard']);
  });
});
