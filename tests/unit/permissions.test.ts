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

  /**
   * Isto prova só o PAPEL BASE. O nome antigo ("sócio não pode se
   * auto-promover") prometia comportamento, e em produção o papel tem
   * `permissions.manage` por override desde 16/07: com ele o sócio se concede o
   * que quiser. O dono decidiu em 03/10/2026 que isso é aceito (R-70 descartado:
   * pode haver mais de um Master). O comportamento das actions, com override
   * lido do banco, está em `security/permissoes-auditoria-acoes.test.ts`.
   */
  it('o papel BASE do sócio não inclui platform_admins.manage nem permissions.manage (override pode conceder)', () => {
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
   * cinco abaixo, e elas abriam operação da Vertho pelo action id.
   */
  it('rh não opera: sem users.manage, settings.company.manage, knowledge_base.manage, exports.run, assessments.dispatch, content.manage', () => {
    for (const p of ['users.manage', 'settings.company.manage', 'knowledge_base.manage', 'exports.run', 'assessments.dispatch', 'content.manage'] as const) {
      expect(hasBasePermission('rh', p), p).toBe(false);
    }
  });

  /**
   * 03/10/2026 (decisão do dono): `content.manage` saiu do rh. Ela abria, pelo
   * action id e dentro da empresa dele, gerar conteúdo e kits com IA paga,
   * Cenários B, manuscrito, PPP e competências. A única tela do RH que a usava
   * (`/dashboard/treino-atendimento`, abas Cenários e Competências) passou para
   * `simulador.casos.manage`.
   */
  it('rh mantém o que a tela dele usa: simulador.casos.manage (casos do atendimento) e a leitura', () => {
    for (const p of ['simulador.casos.manage', 'users.view', 'reports.aggregate.view', 'reports.individual.view', 'journey.team.view'] as const) {
      expect(hasBasePermission('rh', p), p).toBe(true);
    }
  });

  it('rh sem content.manage; a plataforma (master) segue com as duas chaves; sócio e gestor sem a nova', () => {
    expect(hasBasePermission('rh', 'content.manage')).toBe(false);
    expect(hasBasePermission('platform_admin', 'content.manage')).toBe(true);
    expect(hasBasePermission('platform_admin', 'simulador.casos.manage')).toBe(true);
    for (const papel of ['socio', 'gestor', 'colaborador'] as const) {
      expect(hasBasePermission(papel, 'simulador.casos.manage'), papel).toBe(false);
    }
  });

  /**
   * DRE por tenant (05/10/2026). Decisão do dono: o master e TODOS os sócios
   * veem (`dre.view`) e lançam (`dre.manage`). É a única escrita do papel Sócio.
   * O que nunca pode acontecer é o dado de margem chegar a quem não é da
   * plataforma: o rh é o admin do CLIENTE, e a DRE mostra o que a Vertho ganha
   * com ele.
   */
  it('dre.view e dre.manage: master e sócio têm as duas; rh, gestor e usuário não têm nenhuma', () => {
    for (const papel of ['platform_admin', 'socio'] as const) {
      expect(hasBasePermission(papel, 'dre.view'), `${papel} dre.view`).toBe(true);
      expect(hasBasePermission(papel, 'dre.manage'), `${papel} dre.manage`).toBe(true);
    }
    for (const papel of ['rh', 'gestor', 'colaborador'] as const) {
      expect(hasBasePermission(papel, 'dre.view'), `${papel} dre.view`).toBe(false);
      expect(hasBasePermission(papel, 'dre.manage'), `${papel} dre.manage`).toBe(false);
    }
  });

  it('as ÚNICAS chaves *.manage do sócio são idioma (já existia) e DRE: nenhuma outra escrita entrou no papel base', () => {
    const manages = BASE_ROLE_PERMISSIONS.socio.filter((p) => p.endsWith('.manage')).sort();
    expect(manages).toEqual(['dre.manage', 'settings.locale.manage']);
  });

  /**
   * Board multi-modelo (reanálise de 06/10/2026): enfileirar painel executa os CLIs de IA na máquina do dono, com
   * a raiz do repositório. O gate era "qualquer platform admin", e o Sócio entrava. Só o master tem `board.use`.
   */
  it('board.use: só o master tem; sócio, rh, gestor e usuário não', () => {
    expect(hasBasePermission('platform_admin', 'board.use')).toBe(true);
    for (const papel of ['socio', 'rh', 'gestor', 'colaborador'] as const) {
      expect(hasBasePermission(papel, 'board.use'), `${papel} board.use`).toBe(false);
    }
  });
});
