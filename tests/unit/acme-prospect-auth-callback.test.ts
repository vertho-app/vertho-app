import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  prospect: { sessionId: '1234567890abcdef1234', expiresAt: '2999-09-02T07:00:00.000Z', expired: false } as any,
  verifyOtp: vi.fn(async () => ({ error: null })),
  getUser: vi.fn(async () => ({ data: { user: { email: 'convidado.acme.1234567890abcdef1234@vertho.ai' } } })),
  signOut: vi.fn(async () => ({ error: null })),
  recordAccess: vi.fn(async () => true),
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({ set: vi.fn() }),
}));
vi.mock('@/lib/i18n-server', () => ({ getLocaleForEmail: async () => null }));
vi.mock('@/lib/auth/supabase-server', () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      verifyOtp: mocks.verifyOtp,
      exchangeCodeForSession: vi.fn(),
      getUser: mocks.getUser,
      signOut: mocks.signOut,
    },
  }),
}));
vi.mock('@/lib/demo/acme-prospect-tracking', () => ({
  readAcmeProspectAuthContext: () => mocks.prospect,
  recordAcmeProspectPersonalAccess: mocks.recordAccess,
}));

import { GET } from '@/app/auth/callback/route';

describe('callback do convidado ACME', () => {
  beforeEach(() => {
    mocks.prospect = {
      sessionId: '1234567890abcdef1234',
      expiresAt: '2999-09-02T07:00:00.000Z',
      expired: false,
    };
    mocks.verifyOtp.mockClear();
    mocks.getUser.mockClear();
    mocks.signOut.mockClear();
    mocks.recordAccess.mockClear();
  });

  it('registra o primeiro acesso depois de validar o magic link', async () => {
    const req = new NextRequest('https://acme-demo.vertho.ai/auth/callback?token_hash=hash&type=email&next=%2Fdashboard');
    const response = await GET(req);

    expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: 'hash', type: 'email' });
    expect(mocks.recordAccess).toHaveBeenCalledTimes(1);
    expect(new URL(response.headers.get('location')!).pathname).toBe('/dashboard');
  });

  it('encerra a sessão e nega um convite depois de D+2', async () => {
    mocks.prospect = {
      sessionId: '1234567890abcdef1234',
      expiresAt: '2026-09-02T07:00:00.000Z',
      expired: true,
    };
    const req = new NextRequest('https://acme-demo.vertho.ai/auth/callback?token_hash=hash&type=email');
    const response = await GET(req);

    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(mocks.recordAccess).not.toHaveBeenCalled();
    const location = new URL(response.headers.get('location')!);
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('error')).toBe('convite-expirado');
  });
});
