import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  contexto: vi.fn(),
  consultar: vi.fn(),
  historico: vi.fn(),
  executar: vi.fn(),
  limit: vi.fn(async () => null),
}));
vi.mock('@/lib/auth/request-context', () => ({
  getAuthenticatedUser: mocks.user,
}));
vi.mock('@/lib/simulador-vendas/vertho-access', async (original) => ({
  ...(await original<typeof import('@/lib/simulador-vendas/vertho-access')>()),
  contextoVertho: mocks.contexto,
}));
vi.mock('@/lib/simulador-vendas/service', () => ({
  consultar: mocks.consultar,
  consultarHistorico: mocks.historico,
  executar: mocks.executar,
}));
vi.mock('@/lib/rate-limit', () => ({
  readLimiter: { check: mocks.limit },
  aiLimiter: { check: mocks.limit },
  simVendasInicioLimiter: { check: mocks.limit },
}));
vi.mock('@/lib/execucao-contexto', () => ({
  comContexto: (_: unknown, fn: () => unknown) => fn(),
}));
import { GET, POST } from '@/app/api/simulador-vendas/vertho/route';
import { SimuladorError } from '@/lib/simulador-vendas/core';
const id = '20000000-0000-4000-8000-000000000002';
const req = (payload: unknown, origin = 'https://app.vertho.ai') =>
  new Request('https://app.vertho.ai/api/simulador-vendas/vertho', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify(payload),
  });
describe('API comercial: autenticação e isolamento', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({ id, email: 'pessoa@example.test' });
    mocks.contexto.mockResolvedValue({
      empresaId: 'fixa',
      ownerKey: `vendedor:${id}`,
    });
    mocks.consultar.mockResolvedValue({ historico: [] });
    mocks.historico.mockResolvedValue({ historico: [], proximoCursor: null });
    mocks.executar.mockResolvedValue({ sessao: { id } });
    mocks.limit.mockResolvedValue(null);
  });
  it('nega anônimo antes do banco ou serviço', async () => {
    mocks.user.mockResolvedValue(null);
    expect(
      (
        await GET(
          new Request('https://app.vertho.ai/api/simulador-vendas/vertho'),
        )
      ).status,
    ).toBe(401);
    expect(
      (await POST(req({ acao: 'iniciar', requestId: id, nivel: 1 }))).status,
    ).toBe(401);
    expect(mocks.contexto).not.toHaveBeenCalled();
  });
  it('rejeita escolha de tenant em leitura e escrita', async () => {
    expect(
      (
        await GET(
          new Request(
            `https://app.vertho.ai/api/simulador-vendas/vertho?empresaId=${id}`,
          ),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await POST(
          req({ acao: 'iniciar', requestId: id, nivel: 1, empresaId: id }),
        )
      ).status,
    ).toBe(400);
    expect(mocks.contexto).not.toHaveBeenCalled();
  });
  it('revalida participante e mantém filtro do dono também na paginação', async () => {
    const r = await GET(
      new Request(
        'https://app.vertho.ai/api/simulador-vendas/vertho?historico=1&cursor=abc',
      ),
    );
    expect(r.status).toBe(200);
    expect(mocks.historico).toHaveBeenCalledWith(
      { empresaId: 'fixa', ownerKey: `vendedor:${id}` },
      'abc',
    );
    mocks.contexto.mockRejectedValue(
      new SimuladorError(403, 'Acesso suspenso'),
    );
    expect(
      (
        await POST(
          req({ acao: 'encerrar', requestId: id, sessaoId: id, revisao: 1 }),
        )
      ).status,
    ).toBe(403);
    expect(mocks.executar).not.toHaveBeenCalled();
  });
  it('protege mutações com CSRF e limita antes de gerar', async () => {
    expect(
      (
        await POST(
          req(
            { acao: 'iniciar', requestId: id, nivel: 1 },
            'https://outra.example',
          ),
        )
      ).status,
    ).toBe(403);
    mocks.limit.mockResolvedValue(
      new Response('limite', { status: 429 }) as never,
    );
    expect(
      (await POST(req({ acao: 'iniciar', requestId: id, nivel: 1 }))).status,
    ).toBe(429);
    expect(mocks.executar).not.toHaveBeenCalled();
  });
});
