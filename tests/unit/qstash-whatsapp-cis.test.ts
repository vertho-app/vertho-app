import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockPOST } from '../helpers/mock-request';

const mocks = vi.hoisted(() => ({
  supabaseState: {
    status: 'pendente',
    canal: null as string | null,
    updateError: null as { message: string } | null,
    updates: [] as any[],
  },
  zapi: {
    connected: true,
    configured: true,
  },
}));

vi.mock('@/lib/supabase', () => ({
  createSupabaseAdmin: () => ({
    from: () => {
      let selected = '';
      return {
        select(cols: string) {
          selected = cols;
          return this;
        },
        update(payload: any) {
          mocks.supabaseState.updates.push(payload);
          return this;
        },
        eq() {
          return this;
        },
        neq() {
          return Promise.resolve({ error: mocks.supabaseState.updateError });
        },
        maybeSingle() {
          if (selected.includes('status')) {
            return Promise.resolve({ data: { status: mocks.supabaseState.status }, error: null });
          }
          if (selected.includes('canal')) {
            return Promise.resolve({ data: { canal: mocks.supabaseState.canal }, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  }),
}));

vi.mock('@/lib/zapi', () => ({
  getZapiConfig: () => ({
    configured: mocks.zapi.configured,
    instanceId: 'instance-123',
    token: 'token-123',
    clientToken: 'client-token-123',
    baseUrl: 'https://api.z-api.io/instances/instance-123/token/token-123',
  }),
  getZapiStatus: () => Promise.resolve({
    configured: mocks.zapi.configured,
    connected: mocks.zapi.connected,
    session: mocks.zapi.connected,
    smartphoneConnected: mocks.zapi.connected,
  }),
  assertZapiConnected: () => {
    if (!mocks.zapi.connected) {
      throw new Error('Z-API desconectada');
    }
    return Promise.resolve({
      configured: true,
      connected: true,
      session: true,
      smartphoneConnected: true,
    });
  },
}));

vi.mock('@/lib/whatsapp', () => ({
  sendWhatsapp: vi.fn(async () => ({
    ok: mocks.zapi.connected,
    provider: mocks.zapi.connected ? 'zapi' : undefined,
    reason: mocks.zapi.connected ? undefined : 'zapi:saúde: desconectada (connected=false, smartphone=false)',
    attempts: [
      {
        provider: 'zapi',
        ok: mocks.zapi.connected,
        reason: mocks.zapi.connected ? undefined : 'saúde: desconectada (connected=false, smartphone=false)',
      },
    ],
  })),
}));

const { POST } = await import('@/app/api/webhooks/qstash/whatsapp-cis/route');
const { sendWhatsapp } = await import('@/lib/whatsapp');

function makeReq(body: any) {
  return mockPOST('http://localhost:3000/api/webhooks/qstash/whatsapp-cis', body);
}

async function json(res: Response) {
  return res.json() as Promise<any>;
}

describe('qstash whatsapp-cis webhook', () => {
  beforeEach(() => {
    mocks.supabaseState.status = 'pendente';
    mocks.supabaseState.canal = null;
    mocks.supabaseState.updateError = null;
    mocks.supabaseState.updates = [];
    mocks.zapi.connected = true;
    mocks.zapi.configured = true;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('rejects invalid payload before calling Z-API', async () => {
    const res = await POST(makeReq({ telefone: '123456789' }));

    expect(res.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns 503 for offline Z-API so QStash can retry', async () => {
    mocks.zapi.connected = false;

    const res = await POST(makeReq({
      telefone: '11999999999',
      mensagem: 'Mensagem de teste',
      envioId: '11111111-1111-4111-8111-111111111111',
    }));

    expect(res.status).toBe(503);
    expect(mocks.supabaseState.updates).toHaveLength(0);
  });

  it('ignores duplicate retries when envio is already finalized', async () => {
    mocks.supabaseState.status = 'enviado';

    const res = await POST(makeReq({
      telefone: '11999999999',
      mensagem: 'Mensagem de teste',
      envioId: '11111111-1111-4111-8111-111111111111',
    }));
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body.duplicate).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('marks envio as email_whatsapp after Z-API success when email was already sent', async () => {
    mocks.supabaseState.canal = 'email';

    const res = await POST(makeReq({
      telefone: '(11) 99999-9999',
      mensagem: 'Mensagem de teste',
      envioId: '11111111-1111-4111-8111-111111111111',
    }));
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.provider).toBe('zapi');
    expect(mocks.supabaseState.updates[0]).toMatchObject({
      status: 'enviado',
      canal: 'email_whatsapp',
    });
  });

  it('sends the attached document after the text when documentoUrl is present', async () => {
    const res = await POST(makeReq({
      telefone: '11999999999',
      mensagem: 'Seu relatório está pronto',
      documentoUrl: 'https://example.com/rel.pdf?token=abc',
      documentoNome: 'relatorio-maria.pdf',
    }));

    expect(res.status).toBe(200);
    expect(sendWhatsapp).toHaveBeenCalledTimes(2);
    // 2º argumento = meta de negócio para a telemetria de entrega (mig 198).
    // Sem fase4EnvioId nem envioId no payload, o contexto é vazio — e a entrega
    // ainda assim é gravada, com kind nulo (lacuna contável, não invisível).
    expect(sendWhatsapp).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'text' }), {});
    expect(sendWhatsapp).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        kind: 'document',
        url: 'https://example.com/rel.pdf?token=abc',
        filename: 'relatorio-maria.pdf',
      }),
      // O anexo nunca herda o kind do texto: seria uma segunda "pílula" para uma
      // pílula só.
      expect.objectContaining({ kind: 'anexo' }),
    );
  });

  it('still returns 200 when the document fails but the text was delivered', async () => {
    // texto OK; documento falha → não pode virar 5xx (retry duplicaria o texto)
    (sendWhatsapp as any)
      .mockResolvedValueOnce({ ok: true, provider: 'zapi', attempts: [{ provider: 'zapi', ok: true }] })
      .mockResolvedValueOnce({ ok: false, reason: 'documento indisponível', attempts: [{ provider: 'zapi', ok: false }] });

    const res = await POST(makeReq({
      telefone: '11999999999',
      mensagem: 'Seu relatório está pronto',
      documentoUrl: 'https://example.com/rel.pdf',
    }));
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('carimba ultima_pilulaN_whatsapp_em em fase4_envios após o envio confirmado', async () => {
    const res = await POST(makeReq({
      telefone: '11999999999',
      mensagem: 'Sua pílula da semana',
      fase4EnvioId: '22222222-2222-4222-8222-222222222222',
      carimboCampo: 'ultima_pilula1_whatsapp_em',
    }));
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body.carimboFase4).toBe(true);
    // UM campo só: o carimbo do canal — nunca o consolidado nem o do e-mail.
    expect(mocks.supabaseState.updates[0]).toHaveProperty('ultima_pilula1_whatsapp_em');
    expect(Object.keys(mocks.supabaseState.updates[0])).toEqual(['ultima_pilula1_whatsapp_em']);
  });

  it('rejeita carimboCampo fora do enum (não pode escolher coluna arbitrária)', async () => {
    const res = await POST(makeReq({
      telefone: '11999999999',
      mensagem: 'Sua pílula da semana',
      fase4EnvioId: '22222222-2222-4222-8222-222222222222',
      carimboCampo: 'ultima_pilula1_em',
    }));

    expect(res.status).toBe(400);
    expect(sendWhatsapp).not.toHaveBeenCalled();
  });

  it('não carimba fase4 quando o envio falha (503 para o QStash retentar)', async () => {
    mocks.zapi.connected = false;

    const res = await POST(makeReq({
      telefone: '11999999999',
      mensagem: 'Sua pílula da semana',
      fase4EnvioId: '22222222-2222-4222-8222-222222222222',
      carimboCampo: 'ultima_pilula2_whatsapp_em',
    }));

    expect(res.status).toBe(503);
    expect(mocks.supabaseState.updates).toHaveLength(0);
  });
});
