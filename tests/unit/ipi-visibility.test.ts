import { beforeEach, describe, expect, it, vi } from 'vitest';
import IpiAccess from '@/components/ipi/ipi-access';

const mocks = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock('@/lib/auth/action-context', () => ({ requireUserAction: mocks.auth }));
vi.mock('@/components/ipi/ipi-chat', () => ({ default: () => null }));

describe('Ipi — visibilidade independente do perfil', () => {
  beforeEach(() => vi.resetAllMocks());
  it.each(['colaborador', 'gestor', 'rh'])('mostra para %s Vertho sem papel administrativo', async role => {
    const empresaId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
    mocks.auth.mockResolvedValue({ email: 'equipe@vertho.ai', role, isPlatformAdmin: false, empresaId });
    const result = await IpiAccess();
    expect(result).not.toBeNull();
    expect(result?.props.defaultEmpresaId).toBe(empresaId);
  });
  it('mostra para conta Vertho sem vínculo de empresa', async () => {
    mocks.auth.mockResolvedValue({ email: 'comercial@vertho.ai', isPlatformAdmin: false, empresaId: null });
    expect(await IpiAccess()).not.toBeNull();
  });
  it('mantém seleção de empresa para administrador', async () => {
    mocks.auth.mockResolvedValue({ email: 'rodrigo@vertho.ai', isPlatformAdmin: true, empresaId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa' });
    expect((await IpiAccess())?.props.defaultEmpresaId).toBeNull();
  });
  it('não mostra para outro domínio mesmo sendo administrador', async () => {
    mocks.auth.mockResolvedValue({ email: 'admin@cliente.com', isPlatformAdmin: true });
    expect(await IpiAccess()).toBeNull();
  });
  it('não mostra sem sessão autenticada', async () => {
    mocks.auth.mockRejectedValue(new Error('UNAUTHORIZED'));
    expect(await IpiAccess()).toBeNull();
  });
});
