import { beforeEach, describe, expect, it, vi } from 'vitest';
const { gate, permissao, cliente } = vi.hoisted(() => ({ gate: vi.fn(), permissao: vi.fn(), cliente: vi.fn(() => ({ from: vi.fn() })) }));
vi.mock('@/lib/auth/request-context', () => ({ requireAdmin: gate }));
vi.mock('@/lib/permissions', () => ({ can: permissao }));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: cliente }));
vi.mock('@/lib/audit', () => ({ logAdminAction: vi.fn() }));
vi.mock('@/lib/auth/action-context', () => ({ requirePermissionAction: vi.fn(), requireUserAction: vi.fn(), requireAdminAction: vi.fn() }));
import { requireAdminRequestSupabase } from '@/lib/admin-supabase';
const req = new Request('https://app.vertho.ai/api/simulador-vendas/config');
const auth = { isPlatformAdmin: true, email: 'admin@example.test', role: 'colaborador', empresaId: null, colaborador: null };
describe('gate administrativo das rotas PACE', () => {
  beforeEach(() => { gate.mockReset().mockResolvedValue(auth); permissao.mockReset().mockResolvedValue(true); cliente.mockClear(); });
  it('respeita a negativa de identidade/plataforma sem abrir client de serviço', async () => {
    const negativa = new Response('', { status: 403 }); gate.mockResolvedValue(negativa);
    expect(await requireAdminRequestSupabase(req, 'settings.company.manage')).toBe(negativa);
    expect(gate).toHaveBeenCalledWith(req); expect(permissao).not.toHaveBeenCalled(); expect(cliente).not.toHaveBeenCalled();
  });
  it('papel de plataforma não dispensa a permissão granular', async () => {
    permissao.mockResolvedValue(false);
    const result = await requireAdminRequestSupabase(req, 'settings.company.manage');
    expect((result as Response).status).toBe(403); expect(cliente).not.toHaveBeenCalled();
    expect(permissao).toHaveBeenCalledWith(auth, 'settings.company.manage');
  });
  it('devolve client só depois dos dois gates', async () => {
    const result = await requireAdminRequestSupabase(req, 'reports.individual.view');
    expect(result).toMatchObject({ auth, sb: expect.any(Object) }); expect(cliente).toHaveBeenCalledOnce();
    expect(gate.mock.invocationCallOrder[0]).toBeLessThan(permissao.mock.invocationCallOrder[0]);
    expect(permissao.mock.invocationCallOrder[0]).toBeLessThan(cliente.mock.invocationCallOrder[0]);
  });
});
