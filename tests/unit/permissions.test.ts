import { describe, it, expect } from 'vitest';
import { getSystemRole, BASE_ROLE_PERMISSIONS, hasBasePermission } from '@/lib/permissions';

describe('papel Admin Sócio', () => {
  it('getSystemRole distingue master x sócio', () => {
    expect(getSystemRole({ role: 'rh', isPlatformAdmin: true, platformAdminRole: 'master' })).toBe('platform_admin');
    expect(getSystemRole({ role: 'rh', isPlatformAdmin: true, platformAdminRole: 'socio' })).toBe('socio');
    // admin sem tier explícito → master (compat)
    expect(getSystemRole({ role: 'rh', isPlatformAdmin: true })).toBe('platform_admin');
    // não-admin mantém role do tenant
    expect(getSystemRole({ role: 'gestor', isPlatformAdmin: false })).toBe('gestor');
  });

  it('sócio vê (leitura) mas NÃO destrói/gera', () => {
    // pode (leitura ampla + extras aprovados)
    for (const p of ['admin.access', 'permissions.view', 'audit.view', 'companies.view',
      'users.view', 'reports.individual.view', 'ai.costs.view', 'exports.run',
      'radar_empresas.access', 'settings.locale.manage'] as const) {
      expect(hasBasePermission('socio', p)).toBe(true);
    }
    // NÃO pode (destrutivo/gerador/governança)
    for (const p of ['permissions.manage', 'platform_admins.manage', 'companies.manage',
      'users.manage', 'settings.company.manage', 'assessments.dispatch', 'content.manage',
      'knowledge_base.manage', 'ai.audit.regenerate', 'radar.admin.access', 'trash.manage'] as const) {
      expect(hasBasePermission('socio', p)).toBe(false);
    }
  });

  it('sócio não pode se auto-promover', () => {
    expect(BASE_ROLE_PERMISSIONS.socio).not.toContain('platform_admins.manage');
    expect(BASE_ROLE_PERMISSIONS.socio).not.toContain('permissions.manage');
  });
});
