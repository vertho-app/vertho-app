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
});
