import { beforeEach, expect, test, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ auth: null as any, executar: vi.fn(), contexto: vi.fn(), limited: null as any }));
vi.mock('@/lib/auth/request-context', () => ({ requireUser: async () => mocks.auth }));
vi.mock('@/lib/recepcao/access', () => ({
  RecepcaoError: class extends Error { status = 403; }, contextoRecepcao: (...args: any[]) => mocks.contexto(...args),
}));
vi.mock('@/lib/recepcao/service', () => ({ executar: (...args: any[]) => mocks.executar(...args), consultar: async () => ({ historico: [] }) }));
vi.mock('@/lib/rate-limit', () => ({ aiLimiter: { check: async () => mocks.limited } }));
vi.mock('@/lib/execucao-contexto', () => ({ comContexto: (_ctx: any, fn: any) => fn() }));
import { GET, POST } from '@/app/api/recepcao/route';
const body = { acao: 'iniciar', requestId: '20000000-0000-4000-8000-000000000001' };
const req = (payload = body, headers: Record<string, string> = { authorization: 'Bearer fixture' }) => new Request('http://localhost:3107/api/recepcao', { method: 'POST', headers, body: JSON.stringify(payload) });
beforeEach(() => {
  mocks.auth = { email: 'fixture@example.test' }; mocks.limited = null;
  mocks.contexto.mockReset().mockResolvedValue({ auth: mocks.auth });
  mocks.executar.mockReset().mockResolvedValue({ sessao: { id: body.requestId } });
});
test('GET e POST não autenticados retornam 401 sem entrar no serviço', async () => {
  mocks.auth = new Response(null, { status: 401 });
  expect((await GET(new Request('http://localhost/api/recepcao'))).status).toBe(401);
  expect((await POST(req())).status).toBe(401);
  expect(mocks.executar).not.toHaveBeenCalled();
});
test('cookie sem origem confiável recebe 403 antes de qualquer mutação', async () => {
  expect((await POST(req(body, {}))).status).toBe(403);
  expect(mocks.contexto).not.toHaveBeenCalled();
});
test('cliente não pode fornecer nota, gabarito, identidade ou modelo', async () => {
  for (const extra of [{ nota: 100 }, { modelo: 'outro' }, { owner_email: 'outro' }, { cenario: {} }]) {
    expect((await POST(req({ ...body, ...extra }))).status).toBe(400);
  }
  expect(mocks.executar).not.toHaveBeenCalled();
});
test('rate limit impede geração; resposta válida não é cacheável', async () => {
  mocks.limited = new Response(null, { status: 429 });
  expect((await POST(req())).status).toBe(429);
  expect(mocks.executar).not.toHaveBeenCalled();
  mocks.limited = null;
  const res = await POST(req());
  expect(res.status).toBe(200); expect(res.headers.get('cache-control')).toBe('no-store');
});
