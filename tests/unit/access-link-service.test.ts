import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const sendMock = vi.fn();
// `new Resend()` precisa de construtor — classe, não arrow (arrow não é construtor).
vi.mock('resend', () => ({ Resend: class { emails = { send: sendMock }; } }));
vi.mock('@/lib/i18n-auth-templates', () => ({
  magicLinkEmail: () => ({ subject: 'assunto', html: '<p>x</p>' }),
  magicLinkWhatsapp: () => 'mensagem whatsapp',
  signupEmail: () => ({ subject: 'bem-vindo', html: '<p>welcome</p>' }),
  signupWhatsapp: () => 'mensagem signup',
}));
vi.mock('@/lib/domain', () => ({ EMAIL_FROM_DEFAULT: 'no-reply@vertho.ai' }));

const guardMocks = vi.hoisted(() => ({
  isTenantDemo: vi.fn(async (_id?: string | null) => false),
  destinatarioLiberadoEmDemo: vi.fn(async (_id?: string | null, _email?: string | null) => false),
}));
vi.mock('@/lib/demo/envio-guard', () => guardMocks);

import { sendAccessLink, recipientFromLookup } from '@/lib/notifications/access-link-service';

describe('recipientFromLookup (elegibilidade)', () => {
  it('não elegível quando não é colaborador nem platform admin', () => {
    expect(recipientFromLookup(null, null).eligible).toBe(false);
  });

  it('platform admin sem colaborador é elegível (sem telefone)', () => {
    const r = recipientFromLookup(null, { nome: 'Juliane Silva' });
    expect(r.eligible).toBe(true);
    expect(r.nome).toBe('Juliane');
    expect(r.telefone).toBe(null);
  });

  it('colaborador normal: primeiro nome + telefone', () => {
    const r = recipientFromLookup({ nome_completo: 'Ana Souza', telefone: '11999998888' }, null);
    expect(r.eligible).toBe(true);
    expect(r.nome).toBe('Ana');
    expect(r.telefone).toBe('11999998888');
  });

  it('email duplicado em tenants (registro representativo) é elegível — não silencia', () => {
    // o route, no apex, pega 1 representativo em vez de fail-closed → elegível
    const r = recipientFromLookup({ nome_completo: 'Carlos Lima', telefone: null }, null);
    expect(r.eligible).toBe(true);
  });
});

describe('sendAccessLink (status explícito por canal)', () => {
  const base = { to: 'a@b.com', nome: 'Ana', empresaNome: 'X', locale: 'pt-BR' as const, emailLink: 'https://l/e', whatsappLink: 'https://l/w' };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = 'rk';
    process.env.ZAPI_INSTANCE_ID = 'inst';
    process.env.ZAPI_TOKEN = 'tok';
    sendMock.mockResolvedValue({ id: 'em_1' });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).endsWith('/status')) {
        return new Response(JSON.stringify({
          connected: true,
          session: true,
          smartphoneConnected: true,
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('envia email e whatsapp quando tudo ok', async () => {
    const r = await sendAccessLink({ ...base, telefone: '11999998888' });
    expect(r.email).toBe('sent');
    expect(r.whatsapp).toBe('sent');
    expect(r.anySent).toBe(true);
  });

  it('Resend indisponível → email failed, mas whatsapp ainda envia', async () => {
    delete process.env.RESEND_API_KEY;
    const r = await sendAccessLink({ ...base, telefone: '11999998888' });
    expect(r.email).toBe('failed');
    expect(r.emailReason).toMatch(/RESEND/);
    expect(r.whatsapp).toBe('sent');
    expect(r.anySent).toBe(true);
  });

  it('WhatsApp sem telefone → skipped com motivo', async () => {
    const r = await sendAccessLink({ ...base, telefone: null });
    expect(r.whatsapp).toBe('skipped');
    expect(r.whatsappReason).toMatch(/telefone/);
    expect(r.email).toBe('sent');
  });

  it('Resend retorna erro → email failed', async () => {
    sendMock.mockResolvedValue({ error: { message: 'invalid from' } });
    const r = await sendAccessLink({ ...base, telefone: null, channels: ['email'] });
    expect(r.email).toBe('failed');
    expect(r.emailReason).toMatch(/invalid from/);
    expect(r.anySent).toBe(false);
  });

  it('nenhum canal enviado → anySent false (o bug que não pode voltar)', async () => {
    delete process.env.RESEND_API_KEY;            // email failed
    const r = await sendAccessLink({ ...base, telefone: null }); // whatsapp skipped (sem telefone)
    expect(r.anySent).toBe(false);
    expect(r.email).toBe('failed');
    expect(r.whatsapp).toBe('skipped');
  });

  it('respeita channels=[email] (não tenta whatsapp)', async () => {
    const r = await sendAccessLink({ ...base, telefone: '11999998888', channels: ['email'] });
    expect(r.email).toBe('sent');
    expect(r.whatsapp).toBe('skipped');
  });

  it('kind=signup usa templates de boas-vindas e reporta status', async () => {
    const r = await sendAccessLink({ ...base, telefone: '11999998888', kind: 'signup' });
    expect(r.email).toBe('sent');
    expect(r.whatsapp).toBe('sent');
    expect(r.anySent).toBe(true);
  });
});

/**
 * POR QUAL CANAL o link saiu — a pergunta que `whatsapp: 'sent'` não responde.
 *
 * 🔴 Medido em 18/08/2026: o parâmetro do botão era derivado do HOST do
 * callback, e `app.vertho.ai` (o `NEXT_PUBLIC_APP_URL`) é subdomínio reservado.
 * Quem pedia o link no endereço genérico caía no legado da Z-API — desconectada
 * desde 11/08 — e não recebia nada no WhatsApp, só o e-mail. Os testes antigos
 * não pegariam: com a Z-API mockada de pé, o legado devolve `sent` alegremente.
 * Por isso aqui se observa a URL chamada, não o veredito.
 */
describe('🔴 o link de acesso sai pela Cloud API, não pelo legado', () => {
  const CALLBACK_GENERICO = 'https://app.vertho.ai/auth/callback?token_hash=pkce_abc12345&type=email&next=%2Fdashboard';
  const base = { to: 'a@b.com', nome: 'Ana', empresaNome: 'X', locale: 'pt-BR' as const, telefone: '11999998888' };
  let chamadas: Array<{ url: string; body: any }>;

  beforeEach(() => {
    vi.clearAllMocks();
    chamadas = [];
    process.env.RESEND_API_KEY = 'rk';
    process.env.ZAPI_INSTANCE_ID = 'inst';
    process.env.ZAPI_TOKEN = 'tok';
    // Cloud API configurada e template de acesso ligado — como em produção.
    process.env.META_WHATSAPPBUSINESS_API = 'meta-token';
    process.env.PHONE_NUMBER_ID = '123456';
    process.env.WHATSAPP_TEMPLATE_ACESSO = 'acesso_vertho';
    sendMock.mockResolvedValue({ id: 'em_1' });
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
      chamadas.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
      if (String(url).endsWith('/status')) {
        return new Response(JSON.stringify({ connected: true, session: true, smartphoneConnected: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ messages: [{ id: 'wamid.X' }] }), { status: 200 });
    }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.META_WHATSAPPBUSINESS_API;
    delete process.env.PHONE_NUMBER_ID;
    delete process.env.WHATSAPP_TEMPLATE_ACESSO;
  });

  const foiPelaGraph = () => chamadas.some((c) => c.url.includes('graph.facebook.com'));

  it('host SEM tenant + tenantSlug → template da Cloud API, com o slug do banco no botão', async () => {
    const r = await sendAccessLink({
      ...base, channels: ['whatsapp'], whatsappLink: CALLBACK_GENERICO, tenantSlug: 'ibipeba',
    });
    expect(r.whatsapp).toBe('sent');
    expect(foiPelaGraph()).toBe(true);
    const envio = chamadas.find((c) => c.url.includes('graph.facebook.com'))!;
    expect(JSON.stringify(envio.body)).toContain('ibipeba~pkce_abc12345');
  });

  it('o mesmo pedido SEM tenantSlug cai no legado — o check pode falhar', async () => {
    // Guarda contra o teste que passa por acidente: se este caso também fosse
    // pela Graph, o de cima não estaria provando nada.
    const r = await sendAccessLink({
      ...base, channels: ['whatsapp'], whatsappLink: CALLBACK_GENERICO,
    });
    expect(foiPelaGraph()).toBe(false);
    expect(r.whatsapp).toBe('sent'); // legado "funciona" no teste; em produção, não
  });

  it('host DE tenant já resolvia sozinho — o slug do banco não atrapalha', async () => {
    const r = await sendAccessLink({
      ...base, channels: ['whatsapp'],
      whatsappLink: 'https://macae.vertho.ai/auth/callback?token_hash=pkce_abc12345&type=email&next=%2Fdashboard',
      tenantSlug: 'ibipeba',
    });
    expect(r.whatsapp).toBe('sent');
    const envio = chamadas.find((c) => c.url.includes('graph.facebook.com'))!;
    // O host vence quando existe: é onde a pessoa já está.
    expect(JSON.stringify(envio.body)).toContain('macae~pkce_abc12345');
  });
});

/**
 * Gate de tenant-demo (is_demo) no link de acesso — com a exceção da
 * allowlist (`sys_config.demo_acesso_allowlist`), criada para a degustação
 * self-service: o prospect digita o e-mail na tela de login do tenant demo
 * e recebe o magic link DE VERDADE. Todo o resto (lote, cadência) segue
 * bloqueado pelo gate, que não conhece destinatário.
 */
describe('gate de tenant demo no access-link', () => {
  const base = { to: 'prospect@cliente.com', nome: 'Prospect', empresaNome: 'Demo', empresaId: 'emp-demo', locale: 'pt-BR' as const, emailLink: 'https://l/e', whatsappLink: 'https://l/w', telefone: '11999998888' };

  beforeEach(() => {
    vi.clearAllMocks();
    guardMocks.isTenantDemo.mockResolvedValue(true);
    guardMocks.destinatarioLiberadoEmDemo.mockResolvedValue(false);
    process.env.RESEND_API_KEY = 'rk';
    sendMock.mockResolvedValue({ id: 'em_1' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('demo SEM allowlist → nenhum canal envia (motivo explícito)', async () => {
    const r = await sendAccessLink({ ...base });
    expect(r.anySent).toBe(false);
    expect(r.email).toBe('skipped');
    expect(r.whatsapp).toBe('skipped');
    expect(r.emailReason).toMatch(/demonstração/);
  });

  it('demo COM destinatário allowlistado → envia de verdade', async () => {
    guardMocks.destinatarioLiberadoEmDemo.mockResolvedValue(true);
    const r = await sendAccessLink({ ...base });
    expect(r.anySent).toBe(true);
    expect(r.email).toBe('sent');
    // WhatsApp pode falhar por config de provider no teste — o que o gate
    // não pode mais devolver é o skip de "ambiente de demonstração".
    expect(r.whatsapp).not.toBe('skipped');
    expect(r.whatsappReason ?? '').not.toMatch(/demonstração/);
  });

  it('tenant NÃO demo nem consulta a allowlist', async () => {
    guardMocks.isTenantDemo.mockResolvedValue(false);
    const r = await sendAccessLink({ ...base });
    expect(r.anySent).toBe(true);
    expect(guardMocks.destinatarioLiberadoEmDemo).not.toHaveBeenCalled();
  });
});
