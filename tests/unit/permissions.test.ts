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

  /**
   * `program.configure` existe porque nenhuma chave anterior fechava sozinha:
   * `settings.company.manage` o rh TEM; `admin.access` o socio TEM (e
   * `autorizarEmpresa` libera qualquer isPlatformAdmin depois de checar a
   * permissão). Contratar módulo pago e reescrever o programa de um cliente é
   * governança — o desenho do papel Sócio declara "nenhuma ação geradora".
   */
  it('program.configure é exclusiva do master: nem socio nem rh nem gestor', () => {
    expect(hasBasePermission('platform_admin', 'program.configure')).toBe(true);
    for (const papel of ['socio', 'rh', 'gestor', 'colaborador'] as const) {
      expect(hasBasePermission(papel, 'program.configure'), papel).toBe(false);
    }
  });

  /**
   * R-73 (revisão de 02/10/2026) e a decisão de 24/08: "a Vertho opera, o
   * cliente consome". Antes de tirar, o levantamento procurou os consumidores
   * de cada permissão FORA de /admin e /admin-v2: nenhuma tela do RH usa as
   * quatro abaixo, e elas abriam operação da Vertho pelo action id.
   */
  it('rh não opera: sem users.manage, settings.company.manage, knowledge_base.manage, exports.run', () => {
    for (const p of ['users.manage', 'settings.company.manage', 'knowledge_base.manage', 'exports.run'] as const) {
      expect(hasBasePermission('rh', p), p).toBe(false);
    }
  });

  it('rh mantém o que a tela dele usa: content.manage (cenários do simulador de atendimento) e a leitura', () => {
    for (const p of ['content.manage', 'users.view', 'reports.aggregate.view', 'reports.individual.view', 'journey.team.view'] as const) {
      expect(hasBasePermission('rh', p), p).toBe(true);
    }
  });
});
