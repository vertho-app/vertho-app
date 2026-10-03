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
  emitirPasse: vi.fn(() => 'passe.renovado'),
}));

vi.mock('@/lib/demo/presentation-ticket', () => ({
  verifyDemoPresentationTicket: () => mocks.state.ticketValid
    ? { tenant: mocks.state.ticketTenant, prospectSessionId: mocks.state.prospectSessionId }
    : null,
  issueDemoPresentationTicket: mocks.emitirPasse,
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

describe('renovação do passe na troca de papel', () => {
  beforeEach(() => {
    mocks.state.ticketValid = true;
    mocks.state.ticketTenant = 'acme-demo';
    mocks.emitirPasse.mockClear();
  });

  it('🔴 passe do apresentador é REEMITIDO para a sala do passe e segue no redirect (senão expira em 4 h e o login pisca)', async () => {
    mocks.state.prospectSessionId = undefined;
    const res = await GET(new NextRequest('https://gestor-demo.vertho.ai/auth/apresentacao?ticket=passe.velho'));
    const destino = new URL(res.headers.get('location')!);
    expect(mocks.emitirPasse).toHaveBeenCalledWith(undefined, undefined, 'acme-demo');
    expect(destino.searchParams.get('sala')).toBe('passe.renovado');
  });

  it('🔴 passe de convidado NÃO é renovado: a validade é a do passaporte', async () => {
    mocks.state.prospectSessionId = '1234567890abcdef1234';
    const res = await GET(new NextRequest('https://gestor-demo.vertho.ai/auth/apresentacao?ticket=passe.do.convidado'));
    const destino = new URL(res.headers.get('location')!);
    expect(mocks.emitirPasse).not.toHaveBeenCalled();
    expect(destino.searchParams.get('sala')).toBe('passe.do.convidado');
  });
});

describe('versão C: o convite abre a sala DIRETO na tela que responde ao desafio', () => {
  const SID = '1234567890abcdef1234';
  const abrir = async (host: string, cena: string | null, extra = '') => {
    const url = new URL(`https://${host}/auth/apresentacao?ticket=passe.assinado${extra}`);
    if (cena !== null) url.searchParams.set('cena', cena);
    const res = await GET(new NextRequest(url));
    return new URL(res.headers.get('location')!);
  };

  beforeEach(() => {
    mocks.state.ticketValid = true;
    mocks.state.ticketTenant = 'acme-demo';
    mocks.state.prospectSessionId = SID;
    mocks.gerarLogin.mockReset().mockResolvedValue({ ok: true, tokenHash: 'hashed-token', nextPath: '/dashboard/casa-do-papel' });
  });

  it('o destino sai do MAPA pela chave, mantém o ticket e leva a chave junto para o painel', async () => {
    const destino = await abrir('rh-demo.vertho.ai', 'engajamento');
    expect(destino.origin + destino.pathname).toBe('https://rh-demo.vertho.ai/dashboard/gestor/engajamento');
    expect(destino.searchParams.get('cena')).toBe('engajamento');
    expect(destino.searchParams.get('sala')).toBe('passe.assinado');
    expect(destino.searchParams.get('tela')).toBe('computador');
  });

  it('a query do destino (DNA) sobrevive e a chave se soma a ela', async () => {
    const destino = await abrir('rh-demo.vertho.ai', 'diagnostico');
    expect(destino.pathname).toBe('/dashboard/relatorios');
    expect(destino.searchParams.get('document')).toBe('organization-dna');
    expect(destino.searchParams.get('cena')).toBe('diagnostico');
  });

  it('cada sala abre a cena do SEU papel (gestor e participante também)', async () => {
    expect((await abrir('gestor-demo.vertho.ai', 'gestao')).pathname).toBe('/dashboard/gestor');
    expect((await abrir('usuario-demo.vertho.ai', 'personalizacao')).pathname).toBe('/dashboard/temporada');
  });

  it('chave de OUTRO papel, desconhecida ou de protótipo é ignorada: a sala abre na casa, como sempre abriu', async () => {
    for (const cena of ['gestao', 'constructor', '__proto__', '../../admin', 'https://evil.test', '', 'ENGAJAMENTO']) {
      const destino = await abrir('rh-demo.vertho.ai', cena);
      expect(destino.pathname, cena).toBe('/dashboard/casa-do-papel');
      expect(destino.searchParams.has('cena'), cena).toBe(false);
    }
  });

  it('sem convidado no ticket (apresentador da plataforma) a cena não existe', async () => {
    mocks.state.prospectSessionId = undefined;
    const destino = await abrir('rh-demo.vertho.ai', 'engajamento');
    expect(destino.pathname).toBe('/dashboard/casa-do-papel');
    expect(destino.searchParams.has('cena')).toBe(false);
  });

  it('o código de volta continua atravessando junto com a cena', async () => {
    const codigo = emitirCodigoCurto('acme-demo', SID);
    const destino = await abrir('rh-demo.vertho.ai', 'engajamento', `&volta=${codigo}`);
    expect(destino.searchParams.get('volta')).toBe(codigo);
    expect(destino.searchParams.get('cena')).toBe('engajamento');
  });
});
