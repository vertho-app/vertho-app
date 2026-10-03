import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

/**
 * R-130 (revisão de 02/10/2026): "os testes de permissão provam a tabela, não o
 * comportamento". `permissions.test.ts` confere `BASE_ROLE_PERMISSIONS`; nada
 * exercitava `savePermissionOverride`, `removePermissionOverride` nem
 * `loadAuditLog`, as actions que de fato decidem.
 *
 * Aqui o gate roda inteiro (`requirePermissionAction`/`requireAdminAction` ->
 * `can()` -> overrides lidos de `permission_overrides`); só o login e o
 * contexto do usuário são simulados.
 *
 * Nota de decisão (03/10/2026): o dono descartou o R-70. Pode haver mais de um
 * Master e os sócios podem se promover, então NÃO há teto de concessão, e o
 * teste do override de papel abaixo registra isso como comportamento esperado.
 */
const estado = vi.hoisted(() => ({
  email: 'master@vertho.ai' as string | null,
  ctx: null as any,
  overrides: [] as any[],
  existente: null as any,
  auditoria: [] as any[],
}));

const sb = criarSupabaseMock({
  resolver: (tabela) => (tabela === 'permission_overrides' ? estado.existente : null),
  lista: (tabela, _cols, cadeia) => {
    if (tabela === 'permission_overrides') {
      const chaves: string[] = cadeia.find((c) => c.metodo === 'in')?.args[1] || [];
      return estado.overrides.filter((o) => chaves.includes(o.scope_key));
    }
    if (tabela === 'admin_audit_log') return estado.auditoria;
    return [];
  },
});
const revalidatePath = vi.fn();

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/auth/supabase-server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: estado.email ? { email: estado.email } : null }, error: null }) },
  }),
}));
vi.mock('@/lib/authz', () => ({ getUserContext: async () => (estado.ctx ? { ...estado.ctx } : null) }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next/cache', () => ({ revalidatePath: (...a: any[]) => revalidatePath(...a) }));

import { savePermissionOverride, removePermissionOverride } from '@/app/admin/permissoes/actions';
import { loadAuditLog } from '@/app/admin/auditoria/actions';

const MASTER = { role: 'colaborador', isPlatformAdmin: true, platformAdminRole: 'master', empresaId: null, colaborador: null };
const SOCIO = { role: 'colaborador', isPlatformAdmin: true, platformAdminRole: 'socio', empresaId: null, colaborador: null };
const RH = { role: 'rh', isPlatformAdmin: false, platformAdminRole: null, empresaId: 'emp-1', colaborador: { id: 'c-rh' } };

const gravacoes = () => sb.escritas.filter((e) => e.tabela === 'permission_overrides');
const auditorias = () => sb.escritas.filter((e) => e.tabela === 'admin_audit_log').map((e) => e.payload);

const PEDIDO = {
  scopeType: 'user' as const,
  scopeValue: 'Gestora@Cliente.com ',
  permissionKey: 'reports.individual.view' as const,
  effect: 'deny' as const,
  reason: 'Afastada por licença',
};

beforeEach(() => {
  sb.reset();
  revalidatePath.mockClear();
  estado.email = 'master@vertho.ai';
  estado.ctx = MASTER;
  estado.overrides = [];
  estado.existente = null;
  estado.auditoria = [];
});

describe('savePermissionOverride', () => {
  it('master grava o override com a chave normalizada, registra e revalida a tela', async () => {
    const r = await savePermissionOverride(PEDIDO);

    expect(r).toEqual({ success: true });
    expect(gravacoes()).toHaveLength(1);
    expect(gravacoes()[0].payload).toMatchObject({
      scope_type: 'user', scope_key: 'user:gestora@cliente.com', permission_key: 'reports.individual.view',
      effect: 'deny', reason: 'Afastada por licença', created_by_email: 'master@vertho.ai',
    });
    expect(auditorias()[0]).toMatchObject({ acao: 'permissions.override.save', alvo: 'user:gestora@cliente.com:reports.individual.view' });
    expect(revalidatePath).toHaveBeenCalledWith('/admin/permissoes');
  });

  it('sócio no papel base (só permissions.view) é recusado sem gravar nada', async () => {
    estado.email = 'socia@vertho.ai'; estado.ctx = SOCIO;
    await expect(savePermissionOverride(PEDIDO)).rejects.toThrow(/permissions\.manage/);
    expect(sb.escritas).toEqual([]);
  });

  it('override de PAPEL lido do banco vale no gate: com permissions.manage no papel, o sócio edita a matriz (R-70 descartado)', async () => {
    estado.email = 'socia@vertho.ai'; estado.ctx = SOCIO;
    estado.overrides = [{ scope_type: 'role', scope_key: 'role:socio', permission_key: 'permissions.manage', effect: 'allow' }];
    const r = await savePermissionOverride({ ...PEDIDO, scopeValue: 'socia@vertho.ai', permissionKey: 'platform_admins.manage', effect: 'allow' });
    expect(r.success).toBe(true);
    expect(gravacoes()).toHaveLength(1);
  });

  it('deny por usuário tira o poder até do master', async () => {
    estado.overrides = [{ scope_type: 'user', scope_key: 'user:master@vertho.ai', permission_key: 'permissions.manage', effect: 'deny' }];
    await expect(savePermissionOverride(PEDIDO)).rejects.toThrow(/permissions\.manage/);
    expect(sb.escritas).toEqual([]);
  });

  it('ninguém nega a si mesmo uma permissão crítica (não se tranca fora)', async () => {
    for (const permissionKey of ['admin.access', 'permissions.view', 'permissions.manage'] as const) {
      const r = await savePermissionOverride({ ...PEDIDO, scopeValue: 'MASTER@vertho.ai', permissionKey, effect: 'deny' });
      expect(r.success, permissionKey).toBe(false);
    }
    expect(gravacoes()).toEqual([]);
  });

  it('o papel Admin Master não perde permissão crítica por override de papel', async () => {
    const r = await savePermissionOverride({ ...PEDIDO, scopeType: 'role', scopeValue: 'platform_admin', permissionKey: 'admin.access', effect: 'deny' });
    expect(r.success).toBe(false);
    expect(gravacoes()).toEqual([]);
  });

  it.each([
    ['permissão inexistente', { permissionKey: 'tudo.manage' }],
    ['efeito inválido', { effect: 'talvez' }],
    ['motivo curto', { reason: 'ok' }],
    ['papel inexistente', { scopeType: 'role', scopeValue: 'superadmin' }],
    ['e-mail inválido', { scopeValue: 'gestora' }],
  ])('%s: recusa sem gravar', async (_nome, mudanca) => {
    const r = await savePermissionOverride({ ...PEDIDO, ...(mudanca as any) });
    expect(r.success).toBe(false);
    expect(sb.escritas).toEqual([]);
  });

  it('upsert que falha: devolve o erro e não registra sucesso na auditoria', async () => {
    sb.falharEm({ tabela: 'permission_overrides', op: 'upsert', mensagem: 'duplicate key' });
    const r = await savePermissionOverride(PEDIDO);
    expect(r).toEqual({ success: false, error: 'duplicate key' });
    expect(auditorias()).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe('removePermissionOverride', () => {
  it('remove e registra o que foi removido', async () => {
    estado.existente = { id: 'ov-1', scope_key: 'role:socio', permission_key: 'companies.manage', effect: 'allow' };
    const r = await removePermissionOverride('ov-1');
    expect(r).toEqual({ success: true });
    expect(gravacoes().map((e) => e.op)).toEqual(['delete']);
    expect(auditorias()[0]).toMatchObject({ acao: 'permissions.override.remove', alvo: 'role:socio:companies.manage' });
  });

  it('override inexistente: nada é apagado', async () => {
    const r = await removePermissionOverride('ov-x');
    expect(r.success).toBe(false);
    expect(sb.escritas).toEqual([]);
  });

  it('delete que falha: devolve o erro e não registra', async () => {
    estado.existente = { id: 'ov-1', scope_key: 'role:socio', permission_key: 'companies.manage', effect: 'allow' };
    sb.falharEm({ tabela: 'permission_overrides', op: 'delete', mensagem: 'sem conexão' });
    const r = await removePermissionOverride('ov-1');
    expect(r).toEqual({ success: false, error: 'sem conexão' });
    expect(auditorias()).toEqual([]);
  });

  it('sócio no papel base é recusado', async () => {
    estado.email = 'socia@vertho.ai'; estado.ctx = SOCIO;
    estado.existente = { id: 'ov-1', scope_key: 'role:socio', permission_key: 'companies.manage', effect: 'allow' };
    await expect(removePermissionOverride('ov-1')).rejects.toThrow(/permissions\.manage/);
    expect(sb.escritas).toEqual([]);
  });
});

describe('loadAuditLog', () => {
  it('RH do cliente não lê o log de auditoria da plataforma', async () => {
    estado.email = 'rh@cliente.com'; estado.ctx = RH;
    await expect(loadAuditLog()).rejects.toThrow(/platform admin/);
    expect(sb.chamadas.some((c) => c.tabela === 'admin_audit_log')).toBe(false);
  });

  it('sem sessão: recusado', async () => {
    estado.email = null;
    await expect(loadAuditLog()).rejects.toThrow(/UNAUTHORIZED/);
  });

  it('sócio lê, com os filtros aplicados na consulta e as facetas montadas', async () => {
    estado.email = 'socia@vertho.ai'; estado.ctx = SOCIO;
    estado.auditoria = [
      { id: 'a1', acao: 'lixeira.restaurar', empresa_id: 'emp-1', empresa_slug: 'escola', admin_email: 'master@vertho.ai' },
      { id: 'a2', acao: 'dados.limpar', empresa_id: 'emp-1', empresa_slug: 'escola', admin_email: 'master@vertho.ai' },
    ];
    const r = await loadAuditLog({ acao: 'lixeira.restaurar', empresaId: 'emp-1', adminEmail: 'master' });

    expect(r.error).toBeUndefined();
    expect(r.rows).toHaveLength(2);
    expect(sb.usou('admin_audit_log', 'eq', 'acao')).toBe(true);
    expect(sb.usou('admin_audit_log', 'eq', 'empresa_id')).toBe(true);
    expect(sb.usou('admin_audit_log', 'ilike', 'admin_email')).toBe(true);
    expect(r.acoes).toEqual(['dados.limpar', 'lixeira.restaurar']);
    expect(r.empresas).toEqual([{ id: 'emp-1', label: 'escola' }]);
  });

  it('falha na leitura chega à tela como erro, não como log vazio', async () => {
    sb.falharEm({ tabela: 'admin_audit_log', op: 'select', mensagem: 'relation does not exist' });
    const r = await loadAuditLog();
    expect(r.rows).toEqual([]);
    expect(r.error).toMatch(/does not exist/);
  });
});
