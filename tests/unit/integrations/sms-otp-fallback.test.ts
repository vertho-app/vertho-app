/**
 * Contrato do canal de SMS (contingência de acesso, 13/08/2026).
 *
 * O que estes testes protegem, e por quê cada um existe:
 *
 *  - O adapter Twilio precisa distinguir "a API respondeu 200" de "a mensagem
 *    foi aceita": a Twilio devolve 201 com `error_code` preenchido quando
 *    recusa. Tratar isso como sucesso reproduziria o relatório mentiroso de
 *    11/08 ("155 enviados", 50 entregues).
 *  - O teto diário é a única defesa de CUSTO deste canal, e ele só é exercitado
 *    em produção quando algo já está errado (WhatsApp fora + volume de login).
 *    Caminho raro sem teste é caminho que estreia no usuário.
 *  - `fetch` real lança de propósito: nenhum teste desta suíte pode tocar a API
 *    do fornecedor.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// `fetch` real é proibido aqui — se algum caminho escapar do stub, o teste
// quebra em vez de mandar SMS de verdade a partir do CI.
const fetchProibido = vi.fn(() => {
  throw new Error('fetch real chamado num teste de integração');
});

const registrarEntregaMock = vi.fn(async () => 'delivery-id');
const registrarDegradacaoMock = vi.fn(async () => undefined);
let contagemSms: { count: number | null; error: { message: string } | null } = { count: 0, error: null };

vi.mock('@/lib/notifications/delivery-log', () => ({
  registrarEntrega: (...args: unknown[]) => registrarEntregaMock(...(args as [])),
}));

vi.mock('@/lib/degradacao', () => ({
  registrarDegradacao: (...args: unknown[]) => registrarDegradacaoMock(...(args as [])),
  DEGRADACAO: { SMS_TETO_DIARIO: 'sms-teto-diario' },
}));

// `normalizePhone` real depende de libphonenumber, que já falhou em silêncio sob
// outro runtime nesta base (devolvendo null para TODO número). Aqui ele é
// stubado para que o teste exercite o SERVIÇO, não a biblioteca de telefone.
vi.mock('@/lib/phone', () => ({
  normalizePhone: (p: string) => (p && p.replace(/\D/g, '').length >= 10 ? p.replace(/\D/g, '') : null),
}));

vi.mock('@/lib/supabase', () => ({
  createSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            gte: async () => contagemSms,
          }),
        }),
      }),
    }),
  }),
}));

const ENV_ORIGINAL = { ...process.env };

beforeEach(() => {
  vi.stubGlobal('fetch', fetchProibido);
  registrarEntregaMock.mockClear();
  registrarDegradacaoMock.mockClear();
  fetchProibido.mockClear();
  contagemSms = { count: 0, error: null };
  process.env.TWILIO_ACCOUNT_SID = 'AC' + '0'.repeat(32);
  process.env.TWILIO_AUTH_TOKEN = 'token-de-teste';
  process.env.TWILIO_SMS_FROM = '+15550001111';
  delete process.env.TWILIO_API_KEY_SID;
  delete process.env.TWILIO_API_KEY_SECRET;
  process.env.SMS_MAX_DIA = '200';
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  process.env = { ...ENV_ORIGINAL };
});

/** Importa o serviço DEPOIS dos stubs de env (os módulos leem env no topo). */
async function carregarSms() {
  vi.resetModules();
  return import('@/lib/sms');
}

function respostaTwilio(body: unknown, status = 201) {
  return { ok: status < 400, status, json: async () => body } as unknown as Response;
}

describe('adapter Twilio', () => {
  it('aceita 201 sem error_code e devolve o sid', async () => {
    const fetchOk = vi.fn(async () => respostaTwilio({ sid: 'SM123', status: 'queued', error_code: null }));
    vi.stubGlobal('fetch', fetchOk);

    const { sendSms } = await carregarSms();
    const r = await sendSms({ phone: '+5511999998888', text: 'código 123456' }, { motivo: 'otp' });

    expect(r.ok).toBe(true);
    expect(r.provider).toBe('twilio');
    expect(r.providerMessageId).toBe('SM123');
  });

  it('trata 201 COM error_code como falha — 200 não é aceite', async () => {
    const fetchRecusa = vi.fn(async () =>
      respostaTwilio({ sid: 'SM124', status: 'failed', error_code: 21610, error_message: 'Unsubscribed recipient' }),
    );
    vi.stubGlobal('fetch', fetchRecusa);

    const { sendSms } = await carregarSms();
    const r = await sendSms({ phone: '+5511999998888', text: 'código 123456' }, { motivo: 'otp' });

    expect(r.ok).toBe(false);
    expect(r.reason).toContain('21610');
    // A falha tem que chegar à telemetria, senão o canal parece saudável.
    expect(registrarEntregaMock).toHaveBeenCalledWith(
      expect.objectContaining({ canal: 'sms', status: 'falha' }),
    );
  });

  it('manda o remetente em MessagingServiceSid quando é um MG..., não em From', async () => {
    process.env.TWILIO_SMS_FROM = 'MG' + 'a'.repeat(32);
    // Assinatura explícita: sem os parâmetros declarados, `mock.calls[0]` é a
    // tupla vazia e a leitura do corpo não compila.
    const fetchOk = vi.fn(async (_url: string, _init: RequestInit) =>
      respostaTwilio({ sid: 'SM125', error_code: null }),
    );
    vi.stubGlobal('fetch', fetchOk);

    const { sendSms } = await carregarSms();
    await sendSms({ phone: '+5511999998888', text: 'oi' }, { motivo: 'otp' });

    const corpo = String(fetchOk.mock.calls[0]![1].body);
    expect(corpo).toContain('MessagingServiceSid=MG');
    expect(corpo).not.toContain('From=MG');
  });

  it('normaliza o remetente para E.164 — env sem "+" era o caso real', async () => {
    process.env.TWILIO_SMS_FROM = '551151980701'; // exatamente como foi salvo
    const fetchOk = vi.fn(async (_url: string, _init: RequestInit) =>
      respostaTwilio({ sid: 'SM300', error_code: null }),
    );
    vi.stubGlobal('fetch', fetchOk);

    const { sendSms } = await carregarSms();
    await sendSms({ phone: '+5511999998888', text: 'oi' }, { motivo: 'otp' });

    // URLSearchParams codifica '+' como %2B.
    const corpo = String(fetchOk.mock.calls[0]![1].body);
    expect(corpo).toContain('From=%2B551151980701');
  });
});

describe('teto diário de custo', () => {
  it('bloqueia ANTES de chamar o provedor quando o teto foi atingido', async () => {
    contagemSms = { count: 200, error: null };

    const { sendSms } = await carregarSms();
    const r = await sendSms({ phone: '+5511999998888', text: 'oi' }, { motivo: 'otp' });

    expect(r.ok).toBe(false);
    expect(r.bloqueadoPorTeto).toBe(true);
    // O ponto do teto é não gastar: o fetch não pode ter sido chamado.
    expect(fetchProibido).not.toHaveBeenCalled();
    expect(registrarDegradacaoMock).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: 'sms-teto-diario', severidade: 'critico' }),
    );
  });

  it('não bloqueia quando a leitura do teto falha — "não sei" nunca derruba o login', async () => {
    contagemSms = { count: null, error: { message: 'timeout' } };
    const fetchOk = vi.fn(async () => respostaTwilio({ sid: 'SM126', error_code: null }));
    vi.stubGlobal('fetch', fetchOk);

    const { sendSms } = await carregarSms();
    const r = await sendSms({ phone: '+5511999998888', text: 'oi' }, { motivo: 'otp' });

    expect(r.ok).toBe(true);
    expect(fetchOk).toHaveBeenCalled();
  });

  it('SMS_MAX_DIA=0 desliga o canal sem tocar no banco nem no provedor', async () => {
    process.env.SMS_MAX_DIA = '0';

    const { sendSms } = await carregarSms();
    const r = await sendSms({ phone: '+5511999998888', text: 'oi' }, { motivo: 'otp' });

    expect(r.ok).toBe(false);
    expect(r.bloqueadoPorTeto).toBe(true);
    expect(fetchProibido).not.toHaveBeenCalled();
  });
});

describe('esquemas de credencial', () => {
  it('API Key (SK) autentica, mas a URL continua usando o ACCOUNT SID', async () => {
    // O erro clássico é mandar o SK na URL: devolve 404 num endpoint que existe.
    process.env.TWILIO_API_KEY_SID = 'SK' + 'b'.repeat(32);
    process.env.TWILIO_API_KEY_SECRET = 'segredo-da-api-key';
    delete process.env.TWILIO_AUTH_TOKEN;

    const fetchOk = vi.fn(async (_url: string, _init: RequestInit) =>
      respostaTwilio({ sid: 'SM200', error_code: null }),
    );
    vi.stubGlobal('fetch', fetchOk);

    const { sendSms } = await carregarSms();
    const r = await sendSms({ phone: '+5511999998888', text: 'oi' }, { motivo: 'otp' });
    expect(r.ok).toBe(true);

    const url = String(fetchOk.mock.calls[0]![0]);
    expect(url).toContain('/Accounts/AC00000000000000000000000000000000/');
    expect(url).not.toContain('SK');

    // ...e a API Key é quem assina.
    const auth = String((fetchOk.mock.calls[0]![1].headers as Record<string, string>).Authorization);
    const decodificado = Buffer.from(auth.replace('Basic ', ''), 'base64').toString();
    expect(decodificado.startsWith('SK')).toBe(true);
    expect(decodificado.endsWith(':segredo-da-api-key')).toBe(true);
  });

  it('API Key SEM o Account SID não é "configurado" — e diz o que falta', async () => {
    // Estado real de quem acabou de criar a API Key no painel: tem SK e secret,
    // ainda não copiou o AC. Sem mensagem acionável isso vira 404 misterioso.
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    process.env.TWILIO_API_KEY_SID = 'SK' + 'b'.repeat(32);
    process.env.TWILIO_API_KEY_SECRET = 'segredo';

    const { smsDisponivel } = await carregarSms();
    const { pendenciasDeConfig } = await import('@/lib/sms/providers/twilio');

    expect(smsDisponivel()).toBe(false);
    expect(pendenciasDeConfig().join(' ')).toContain('TWILIO_ACCOUNT_SID');
    expect(fetchProibido).not.toHaveBeenCalled();
  });
});

describe('fail-closed sem credencial', () => {
  it('sem env da Twilio não tenta nada e não polui a telemetria', async () => {
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_SMS_FROM;

    const { sendSms, smsDisponivel } = await carregarSms();
    expect(smsDisponivel()).toBe(false);

    const r = await sendSms({ phone: '+5511999998888', text: 'oi' }, { motivo: 'otp' });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('nenhum provedor');
    expect(fetchProibido).not.toHaveBeenCalled();
    // Sem provedor NÃO houve tentativa: gravar "falha" aqui estragaria o
    // denominador de confiabilidade do canal quando ele existir de verdade.
    expect(registrarEntregaMock).not.toHaveBeenCalled();
  });
});

describe('copy de SMS', () => {
  it('não leva markdown do WhatsApp e cabe em um segmento UCS-2 (70)', async () => {
    const { otpSms, otpWhatsapp } = await import('@/lib/i18n-auth-templates');
    const empresaNome = 'Secretaria Municipal de Ibipeba/BA';

    const sms = otpSms('pt-BR', { empresaNome, code: '123456' });
    expect(sms).not.toContain('*');
    expect(sms).toContain('123456');
    expect(sms.length).toBeLessThanOrEqual(70);

    // O WhatsApp continua com a copy longa e formatada — são canais diferentes.
    expect(otpWhatsapp('pt-BR', { empresaNome, code: '123456' })).toContain('*');
  });

  it('cabe em um segmento nos quatro locales', async () => {
    const { otpSms } = await import('@/lib/i18n-auth-templates');
    for (const locale of ['pt-BR', 'pt-PT', 'es-ES', 'en-US'] as const) {
      const texto = otpSms(locale, { empresaNome: 'Secretaria Municipal de Ibipeba/BA', code: '123456' });
      expect(texto.length, `${locale}: ${texto.length} chars`).toBeLessThanOrEqual(70);
    }
  });
});
