/**
 * R-79 (revisão de 02/10/2026): as portas de login em uso só limitavam por IP
 * (8 por minuto). Com IPs variados, dava para disparar templates pagos
 * repetidos no WhatsApp de uma pessoa e links em série no e-mail dela.
 *
 * Aqui o limiter é o REAL (fallback em memória, sem Upstash), e as rotas
 * também: só o banco e o envio são simulados. Cada pedido vem de um IP
 * diferente, que é exatamente o ataque.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

beforeAll(() => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
});

let slugDoHost: string | null = 'macae';
let temColab = true;

const sb = criarSupabaseMock({
  resolver: (tabela: string) => {
    if (tabela === 'colaboradores') {
      return temColab
        ? { id: 'col-1', nome_completo: 'Geane Souza', telefone: '5522997612255', empresa_id: 'emp-1', email: 'geane@escola.rj.gov.br' }
        : null;
    }
    if (tabela === 'empresas') return { id: 'emp-1', nome: 'Macaé', slug: 'macae' };
    return null;
  },
});
const client: any = sb.client;
const generateLink = vi.fn(async () => ({
  data: { properties: { hashed_token: 'tok-abc12345', action_link: 'https://projeto.supabase.co/auth/v1/verify?token=x' } },
  error: null,
}));
client.auth = {
  admin: {
    createUser: vi.fn(async () => ({ data: { user: null }, error: { message: 'User already registered' } })),
    generateLink,
  },
};

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => client }));
vi.mock('@/lib/tenant-resolver', () => ({ getTenantSlug: () => slugDoHost }));

const enviados: any[] = [];
vi.mock('@/lib/notifications/access-link-service', () => ({
  sendAccessLink: async (p: any) => { enviados.push(p); return { anySent: true, email: 'sent', whatsapp: 'sent' }; },
  recipientFromLookup: (colab: any, admin: any) => ({
    eligible: !!(colab || admin),
    nome: colab?.nome_completo || admin?.nome || '',
    telefone: colab?.telefone ?? null,
  }),
}));

const { limitarPorDestino, chaveDoDestino, LINKS_POR_DESTINO_HORA, LINKS_POR_DESTINO_DIA } = await import('@/lib/rate-limit');
const { CODIGO_LIMITE_DESTINO } = await import('@/lib/auth/login-respostas');
const magicLink = await import('@/app/api/auth/magic-link/route');
const telefoneLink = await import('@/app/api/auth/phone-magic-link/request/route');
const { NextRequest } = await import('next/server');

const HOST = 'macae.vertho.ai';
let ip = 0;
/** Cada chamada sai de um IP novo: o teto por IP nunca dispara aqui. */
function headersDeUmIpNovo() {
  ip += 1;
  return {
    'content-type': 'application/json',
    host: HOST,
    'x-forwarded-host': HOST,
    'x-forwarded-proto': 'https',
    'x-forwarded-for': `10.0.${Math.floor(ip / 250)}.${ip % 250}`,
  };
}
function pedirPorEmail(email: string) {
  return magicLink.POST(new NextRequest(`https://${HOST}/api/auth/magic-link`, {
    method: 'POST',
    headers: headersDeUmIpNovo(),
    body: JSON.stringify({ email, redirectTo: `https://${HOST}/dashboard` }),
  }) as any);
}
function pedirPorTelefone(telefone: string) {
  return telefoneLink.POST(new NextRequest(`https://${HOST}/api/auth/phone-magic-link/request`, {
    method: 'POST',
    headers: headersDeUmIpNovo(),
    body: JSON.stringify({ telefone, redirectTo: `https://${HOST}/dashboard` }),
  }) as any);
}
function reqQualquer() {
  return new Request('https://app.vertho.ai/x', { headers: headersDeUmIpNovo() });
}

beforeEach(() => {
  sb.reset();
  enviados.length = 0;
  generateLink.mockClear();
  slugDoHost = 'macae';
  temColab = true;
});
afterEach(() => { vi.useRealTimers(); });

describe('R-79 · teto por destinatário', () => {
  it('🔴 o mesmo e-mail, de IPs diferentes: o 6º pedido na hora para, com código para a tela', async () => {
    for (let i = 0; i < LINKS_POR_DESTINO_HORA; i++) {
      expect(await limitarPorDestino(reqQualquer(), 'email', 'alvo-1@escola.br')).toBeNull();
    }
    const r = await limitarPorDestino(reqQualquer(), 'email', 'alvo-1@escola.br');
    expect(r?.status).toBe(429);
    expect((await r!.json()).codigo).toBe(CODIGO_LIMITE_DESTINO);
  });

  it('grafia diferente do mesmo e-mail conta junto; outro e-mail conta à parte', async () => {
    for (let i = 0; i < LINKS_POR_DESTINO_HORA; i++) {
      await limitarPorDestino(reqQualquer(), 'email', i % 2 ? ' Alvo-2@Escola.br ' : 'alvo-2@escola.br');
    }
    expect((await limitarPorDestino(reqQualquer(), 'email', 'ALVO-2@escola.br'))?.status).toBe(429);
    expect(await limitarPorDestino(reqQualquer(), 'email', 'outra-pessoa@escola.br')).toBeNull();
  });

  it('telefone conta pelos dígitos, com ou sem máscara', async () => {
    for (let i = 0; i < LINKS_POR_DESTINO_HORA; i++) {
      await limitarPorDestino(reqQualquer(), 'telefone', i % 2 ? '+55 (22) 99761-0001' : '5522997610001');
    }
    expect((await limitarPorDestino(reqQualquer(), 'telefone', '5522997610001'))?.status).toBe(429);
  });

  it('o teto do dia segura quem espaça os pedidos para escapar do da hora', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-03T12:00:00Z') });
    let liberados = 0;
    for (let rodada = 0; rodada < 3; rodada++) {
      for (let i = 0; i < LINKS_POR_DESTINO_HORA; i++) {
        if (!(await limitarPorDestino(reqQualquer(), 'email', 'paciente@escola.br'))) liberados++;
      }
      vi.advanceTimersByTime(61 * 60_000);
    }
    expect(liberados).toBe(LINKS_POR_DESTINO_DIA);
  });

  it('a chave guardada no Redis não carrega o e-mail nem o telefone', async () => {
    const chaveEmail = await chaveDoDestino('email', 'geane@escola.rj.gov.br');
    const chaveTel = await chaveDoDestino('telefone', '5522997612255');
    expect(chaveEmail).not.toContain('geane');
    expect(chaveTel).not.toContain('997612255');
    expect(chaveEmail).not.toBe(await chaveDoDestino('email', 'outra@escola.rj.gov.br'));
  });
});

describe('R-79 · a tela traduz o 429 pelo código', () => {
  it('o código do teto vira a chave de tradução, presente nos 4 idiomas', async () => {
    const { chaveDoErroDoPedido } = await import('@/lib/auth/login-respostas');
    const { readFileSync } = await import('node:fs');
    expect(chaveDoErroDoPedido({ error: 'texto', codigo: CODIGO_LIMITE_DESTINO })).toBe('errors.tooManyLinks');
    expect(chaveDoErroDoPedido({ error: 'texto' })).toBeNull();
    for (const locale of ['pt-BR', 'pt-PT', 'es-ES', 'en-US']) {
      const m = JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8'));
      expect(typeof m.Login.errors.tooManyLinks).toBe('string');
    }
  });
});

describe('R-79 · as rotas usam o teto antes de gerar link', () => {
  it('🔴 e-mail: o 6º pedido de IPs diferentes volta 429 e não gera nem envia link', async () => {
    for (let i = 0; i < LINKS_POR_DESTINO_HORA; i++) {
      const r: any = await pedirPorEmail('rota-email@escola.br');
      expect(r.status).toBe(200);
    }
    expect(enviados).toHaveLength(LINKS_POR_DESTINO_HORA);
    const r: any = await pedirPorEmail('rota-email@escola.br');
    expect(r.status).toBe(429);
    expect(enviados).toHaveLength(LINKS_POR_DESTINO_HORA);
    expect(generateLink).toHaveBeenCalledTimes(LINKS_POR_DESTINO_HORA);
  });

  it('o 429 vale também para e-mail sem cadastro: a resposta não vira enumeração', async () => {
    temColab = false;
    for (let i = 0; i < LINKS_POR_DESTINO_HORA; i++) {
      expect(await (await pedirPorEmail('ninguem@lugar.br') as any).json()).toEqual({ success: true });
    }
    expect((await pedirPorEmail('ninguem@lugar.br') as any).status).toBe(429);
  });

  it('🔴 WhatsApp: o 6º pedido para o mesmo número volta 429 e não dispara template', async () => {
    for (let i = 0; i < LINKS_POR_DESTINO_HORA; i++) {
      const r: any = await pedirPorTelefone('22997612255');
      expect(r.status).toBe(200);
    }
    expect(enviados).toHaveLength(LINKS_POR_DESTINO_HORA);
    const r: any = await pedirPorTelefone('22997612255');
    expect(r.status).toBe(429);
    expect((await r.json()).codigo).toBe(CODIGO_LIMITE_DESTINO);
    expect(enviados).toHaveLength(LINKS_POR_DESTINO_HORA);
  });

  it('🔴 WhatsApp no endereço genérico (R-76): o 6º pedido volta 429 e já não consulta o cadastro', async () => {
    slugDoHost = null;
    const noGenerico = (telefone: string) => telefoneLink.POST(new NextRequest('https://app.vertho.ai/api/auth/phone-magic-link/request', {
      method: 'POST',
      headers: { ...headersDeUmIpNovo(), host: 'app.vertho.ai', 'x-forwarded-host': 'app.vertho.ai' },
      body: JSON.stringify({ telefone, redirectTo: 'https://app.vertho.ai/dashboard' }),
    }) as any);

    for (let i = 0; i < LINKS_POR_DESTINO_HORA; i++) {
      const r: any = await noGenerico('22997610002');
      expect(r.status).toBe(200);
    }
    // Cada um dos pedidos acima descobriu a organização pelo número: é a leitura
    // do cadastro que o teto precisa segurar.
    const consultasAntes = sb.chamadas.length;
    expect(consultasAntes).toBeGreaterThan(0);

    const r: any = await noGenerico('22997610002');
    expect(r.status).toBe(429);
    expect((await r.json()).codigo).toBe(CODIGO_LIMITE_DESTINO);
    expect(sb.chamadas).toHaveLength(consultasAntes);
    expect(enviados).toHaveLength(0);
  });
});
