import { describe, expect, it } from 'vitest';
import {
  DEMO_PRESENTATION_ROOMS,
  listarPapeisDeApresentacao,
  demoPresentationAuthUrl,
  demoPresentationUrl,
  getDemoPresentationDeviceQueryValue,
  getDemoPresentationRoleFromHostname,
  launchDemoPresentationAccess,
  parseDemoPresentationDevice,
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
    expect(demoPresentationAuthUrl('gestor', 'passe.assinado', 'vertho.test')).toBe(
      'https://gestor-demo.vertho.test/auth/apresentacao?ticket=passe.assinado',
    );
  });

  it('aceita somente Computador e Celular como dispositivos da apresentação', () => {
    expect(parseDemoPresentationDevice('computador')).toBe('desktop');
    expect(parseDemoPresentationDevice('celular')).toBe('mobile');
    expect(parseDemoPresentationDevice('tablet')).toBeNull();
    expect(getDemoPresentationDeviceQueryValue('desktop')).toBe('computador');
    expect(getDemoPresentationDeviceQueryValue('mobile')).toBe('celular');
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

  /**
   * 🔴 O hostname identifica papel E ambiente. Um alias repetido entre salas
   * abriria tenants diferentes conforme quem emitiu o passe — e como a rota de
   * auth confere o passe CONTRA o host, um host ambíguo transforma essa
   * conferência num sorteio.
   */
  it('nenhum host de apresentação pertence a dois ambientes', () => {
    const papeis = listarPapeisDeApresentacao();
    const hosts = papeis.map((papel) => papel.hostSlug);
    expect(new Set(hosts).size, `hosts repetidos em ${hosts.join(', ')}`).toBe(hosts.length);
  });

  it('toda sala cobre as três visões que o produto autoriza', () => {
    for (const sala of Object.values(DEMO_PRESENTATION_ROOMS)) {
      expect(sala.roles.map((role) => role.key)).toEqual(['usuario', 'gestor', 'rh']);
      for (const role of sala.roles) {
        expect(role.label.length, `${sala.tenantSlug}/${role.key} sem rótulo`).toBeGreaterThan(1);
      }
    }
  });

  it('cada host resolve para o tenant da própria sala', () => {
    for (const sala of Object.values(DEMO_PRESENTATION_ROOMS)) {
      for (const role of sala.roles) {
        expect(resolvePresentationTenantSlug(role.hostSlug)).toBe(sala.tenantSlug);
      }
    }
  });
});
