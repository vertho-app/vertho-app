import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'service-role-key-used-only-by-unit-test';

const mocks = vi.hoisted(() => ({
  state: {
    ticketValid: true,
    ticketTenant: 'acme-demo',
    prospectSessionId: '1234567890abcdef1234' as string | undefined,
  },
  gerarLogin: vi.fn(async () => ({
    ok: true as const,
    tokenHash: 'hashed-token-gestor',
    nextPath: '/dashboard/gestor',
  })),
  verifyOtp: vi.fn(async () => ({ error: null })),
  recordAccess: vi.fn(async () => true),
}));

vi.mock('@/lib/demo/presentation-ticket', () => ({
  verifyDemoPresentationTicket: () => mocks.state.ticketValid
    ? { tenant: mocks.state.ticketTenant, prospectSessionId: mocks.state.prospectSessionId }
    : null,
}));
vi.mock('@/lib/demo/reset-acme-demo', () => ({
  autenticarPapelApresentacaoDemo: mocks.gerarLogin,
}));
vi.mock('@/lib/auth/supabase-server', () => ({
  createSupabaseServerClient: async () => ({ auth: { verifyOtp: mocks.verifyOtp } }),
}));
vi.mock('@/lib/demo/acme-prospect-tracking', () => ({
  recordAcmeProspectPresentationAccess: mocks.recordAccess,
}));

import { GET } from '@/app/auth/apresentacao/route';
import { emitirCodigoCurto } from '@/lib/demo/degustacao-link-curto';

describe('rota de autenticação automática da apresentação', () => {
  beforeEach(() => {
    mocks.state.ticketValid = true;
    mocks.state.ticketTenant = 'acme-demo';
    mocks.state.prospectSessionId = '1234567890abcdef1234';
    mocks.gerarLogin.mockReset().mockResolvedValue({ ok: true, tokenHash: 'hashed-token-gestor', nextPath: '/dashboard/gestor' });
    mocks.verifyOtp.mockClear();
    mocks.recordAccess.mockClear();
  });

  it('deriva o papel do hostname e cria a sessão sem aceitar role da query', async () => {
    const req = new NextRequest('https://gestor-demo.vertho.ai/auth/apresentacao?ticket=passe.assinado&role=rh');
    const res = await GET(req);

    expect(mocks.gerarLogin).toHaveBeenCalledWith('gestor', expect.anything(), 'acme-demo');
    expect(mocks.recordAccess).toHaveBeenCalledWith('1234567890abcdef1234', 'gestor');
    const destino = new URL(res.headers.get('location')!);
    expect(destino.origin + destino.pathname).toBe('https://gestor-demo.vertho.ai/dashboard/gestor');
    expect(destino.searchParams.get('sala')).toBe('passe.assinado');
    expect(destino.searchParams.get('tela')).toBe('computador');
  });

  it('falha temporária mantém o convidado no convite e não diz que expirou', async () => {
    mocks.gerarLogin.mockResolvedValueOnce({ ok: false, error: 'temporário' } as any);
    const res = await GET(new NextRequest('https://gestor-demo.vertho.ai/auth/apresentacao?ticket=passe.assinado'));
    const destino = new URL(res.headers.get('location')!);
    expect(destino.origin).toBe('https://acme-demo.vertho.ai');
    expect(destino.pathname).toBe(`/c/${emitirCodigoCurto('acme-demo', mocks.state.prospectSessionId!)}`);
    expect(destino.searchParams.get('aviso')).toBe('indisponivel');
    expect(mocks.recordAccess).not.toHaveBeenCalled();
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('preserva a visão de celular ao preparar a sessão do próximo papel', async () => {
    const req = new NextRequest('https://gestor-demo.vertho.ai/auth/apresentacao?ticket=passe.assinado&tela=celular');
    const res = await GET(req);

    const destino = new URL(res.headers.get('location')!);
    expect(destino.searchParams.get('sala')).toBe('passe.assinado');
    expect(destino.searchParams.get('tela')).toBe('celular');
  });

  it('descarta dispositivos fora da allowlist', async () => {
    const req = new NextRequest('https://gestor-demo.vertho.ai/auth/apresentacao?ticket=passe.assinado&tela=tablet');
    const res = await GET(req);

    expect(new URL(res.headers.get('location')!).searchParams.get('tela')).toBe('computador');
  });

  it('nega passe inválido antes de tocar no Auth', async () => {
    mocks.state.ticketValid = false;
    const req = new NextRequest('https://rh-demo.vertho.ai/auth/apresentacao?ticket=adulterado');
    const res = await GET(req);

    expect(new URL(res.headers.get('location')!).pathname).toBe('/login');
    expect(mocks.gerarLogin).not.toHaveBeenCalled();
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(mocks.recordAccess).not.toHaveBeenCalled();
  });

  it('não funciona no tenant canônico nem em host fora da allowlist', async () => {
    const req = new NextRequest('https://acme-demo.vertho.ai/auth/apresentacao?ticket=passe.assinado');
    const res = await GET(req);

    expect(new URL(res.headers.get('location')!).pathname).toBe('/login');
    expect(mocks.gerarLogin).not.toHaveBeenCalled();
  });

  // Com mais de um ambiente demo, a assinatura deixa de bastar: ela prova que o
  // passe é nosso, não que ele é DESTA sala. Sem esta conferência, um passe
  // legítimo do ambiente escolar abriria sessão no ACME, e vice-versa.
  it('recusa passe assinado para OUTRO ambiente demo', async () => {
    mocks.state.ticketTenant = 'escolas-acme';

    const req = new NextRequest('https://gestor-demo.vertho.ai/auth/apresentacao?ticket=passe.de.outra.sala');
    const res = await GET(req);

    expect(mocks.gerarLogin).not.toHaveBeenCalled();
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    const destino = new URL(res.headers.get('location')!);
    expect(destino.pathname).toBe('/login');
    expect(destino.searchParams.get('error')).toBe('apresentacao-invalida');
  });
});

describe('"Voltar ao início": o código da página de boas-vindas atravessa a sala', () => {
  const SID = '1234567890abcdef1234';
  const abrir = async (volta: string) => {
    const url = new URL('https://gestor-demo.vertho.ai/auth/apresentacao?ticket=passe.assinado');
    url.searchParams.set('volta', volta);
    const res = await GET(new NextRequest(url));
    return new URL(res.headers.get('location')!);
  };

  beforeEach(() => {
    mocks.state.ticketValid = true;
    mocks.state.ticketTenant = 'acme-demo';
    mocks.state.prospectSessionId = SID;
  });

  it('código deste ambiente e da MESMA sessão do ticket segue para a sala', async () => {
    const codigo = emitirCodigoCurto('acme-demo', SID);
    const destino = await abrir(codigo);
    expect(destino.pathname).toBe('/dashboard/gestor');
    expect(destino.searchParams.get('volta')).toBe(codigo);
  });

  it('🔴 código de outra sessão, de outro ambiente ou forjado é descartado, e a sala abre mesmo assim', async () => {
    const legitimo = emitirCodigoCurto('acme-demo', SID);
    const casos = [
      emitirCodigoCurto('acme-demo', 'ffffffffffffffffffff'),
      emitirCodigoCurto('gruposinal', SID),
      `${legitimo.slice(0, -1)}${legitimo.endsWith('A') ? 'B' : 'A'}`,
      'https://phishing.example/x',
    ];
    for (const volta of casos) {
      const destino = await abrir(volta);
      expect(destino.pathname).toBe('/dashboard/gestor');
      expect(destino.searchParams.has('volta')).toBe(false);
    }
  });

  it('sala preparada no painel, sem sessão de convidado no ticket, não ganha o botão', async () => {
    mocks.state.prospectSessionId = undefined;
    const destino = await abrir(emitirCodigoCurto('acme-demo', SID));
    expect(destino.pathname).toBe('/dashboard/gestor');
    expect(destino.searchParams.has('volta')).toBe(false);
  });
});
