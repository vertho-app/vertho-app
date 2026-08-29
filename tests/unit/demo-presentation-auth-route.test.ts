import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  state: { ticketValid: true },
  gerarLogin: vi.fn(async () => ({
    ok: true as const,
    tokenHash: 'hashed-token-gestor',
    nextPath: '/dashboard/gestor',
  })),
  verifyOtp: vi.fn(async () => ({ error: null })),
}));

vi.mock('@/lib/demo/presentation-ticket', () => ({
  verifyDemoPresentationTicket: () => mocks.state.ticketValid ? { tenant: 'acme-demo' } : null,
}));
vi.mock('@/lib/demo/reset-acme-demo', () => ({
  gerarMagicLinkPapelApresentacaoDemo: mocks.gerarLogin,
}));
vi.mock('@/lib/auth/supabase-server', () => ({
  createSupabaseServerClient: async () => ({ auth: { verifyOtp: mocks.verifyOtp } }),
}));

import { GET } from '@/app/auth/apresentacao/route';

describe('rota de autenticação automática da apresentação', () => {
  beforeEach(() => {
    mocks.state.ticketValid = true;
    mocks.gerarLogin.mockClear();
    mocks.verifyOtp.mockClear();
  });

  it('deriva o papel do hostname e cria a sessão sem aceitar role da query', async () => {
    const req = new NextRequest('https://gestor-demo.vertho.ai/auth/apresentacao?ticket=passe.assinado&role=rh');
    const res = await GET(req);

    expect(mocks.gerarLogin).toHaveBeenCalledWith('gestor');
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: 'hashed-token-gestor', type: 'email' });
    const destino = new URL(res.headers.get('location')!);
    expect(destino.origin + destino.pathname).toBe('https://gestor-demo.vertho.ai/dashboard/gestor');
    expect(destino.searchParams.get('sala')).toBe('passe.assinado');
  });

  it('nega passe inválido antes de tocar no Auth', async () => {
    mocks.state.ticketValid = false;
    const req = new NextRequest('https://rh-demo.vertho.ai/auth/apresentacao?ticket=adulterado');
    const res = await GET(req);

    expect(new URL(res.headers.get('location')!).pathname).toBe('/login');
    expect(mocks.gerarLogin).not.toHaveBeenCalled();
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it('não funciona no tenant canônico nem em host fora da allowlist', async () => {
    const req = new NextRequest('https://acme-demo.vertho.ai/auth/apresentacao?ticket=passe.assinado');
    const res = await GET(req);

    expect(new URL(res.headers.get('location')!).pathname).toBe('/login');
    expect(mocks.gerarLogin).not.toHaveBeenCalled();
  });
});
