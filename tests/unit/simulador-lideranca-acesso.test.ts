import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
  can: true,
  liberado: true,
  trilho: { ok: true, variante: 'lider' },
  dbError: null as unknown,
  empresa: true,
}));
vi.mock('@/lib/permissions', () => ({ can: vi.fn(async () => m.can) }));
vi.mock('@/lib/simuladores/acesso', () => ({
  acessoSimuladoresDoColaborador: vi.fn(async () => ({
    lideranca: m.liberado,
  })),
}));
vi.mock('@/lib/prontidao-lideranca/trilho', () => ({
  resolverTrilhoLideranca: vi.fn(async () => m.trilho),
}));
vi.mock('@/lib/tenant-db', () => ({
  tenantDb: () => ({
    raw: {
      from: (t: string) => {
        const q: any = {
          select: () => q,
          eq: () => q,
          maybeSingle: async () => ({
            error: m.dbError,
            data:
              t === 'platform_admins'
                ? { id: 'admin' }
                : m.empresa
                  ? { id: 'empresa-a', nome: 'A', sys_config: {} }
                  : null,
          }),
        };
        return q;
      },
    },
  }),
}));
import { contexto } from '@/lib/simulador-lideranca/access';
const auth = () =>
  ({
    empresaId: 'empresa-a',
    email: 'lider@example.test',
    role: 'gestor',
    isPlatformAdmin: false,
    colaborador: { id: 'lider', empresa_id: 'empresa-a', role: 'gestor' },
  }) as any;
beforeEach(() => {
  m.can = true;
  m.liberado = true;
  m.trilho = { ok: true, variante: 'lider' };
  m.dbError = null;
  m.empresa = true;
});
describe('acesso ao treino de liderança', () => {
  it('deriva o proprietário da sessão', async () => {
    expect(await contexto(auth())).toMatchObject({
      empresaId: 'empresa-a',
      ownerKey: 'colab:lider',
    });
  });
  it('nega empresa enviada pelo cliente que difere da sessão', async () => {
    await expect(contexto(auth(), 'empresa-b')).rejects.toMatchObject({
      status: 403,
    });
  });
  it('nega cadastro de outra empresa mesmo com auth.empresaId', async () => {
    const a = auth();
    a.colaborador.empresa_id = 'empresa-b';
    await expect(contexto(a)).rejects.toMatchObject({ status: 403 });
  });
  it('exige permissão de treino', async () => {
    m.can = false;
    await expect(contexto(auth())).rejects.toMatchObject({ status: 403 });
  });
  it('exige liberação do cargo', async () => {
    m.liberado = false;
    await expect(contexto(auth())).rejects.toMatchObject({ status: 403 });
  });
  it('exige participação na população configurada', async () => {
    m.trilho = { ok: false, message: 'Fora do programa' } as any;
    await expect(contexto(auth())).rejects.toMatchObject({ status: 403 });
  });
  it('falha fechada em erro de banco', async () => {
    m.dbError = {};
    await expect(contexto(auth())).rejects.toMatchObject({ status: 503 });
  });
  it('teste do administrador usa acervo próprio e não o participante', async () => {
    const a = { ...auth(), isPlatformAdmin: true };
    expect(await contexto(a, 'empresa-b')).toMatchObject({
      empresaId: 'empresa-b',
      ownerKey: 'admin:admin',
      colaboradorId: null,
    });
  });
});
