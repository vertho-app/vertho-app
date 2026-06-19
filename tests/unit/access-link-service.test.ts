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
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, text: async () => '' })));
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
