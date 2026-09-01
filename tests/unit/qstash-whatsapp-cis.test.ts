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
  cloud: {
    ok: true,
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

vi.mock('@/lib/whatsapp/cloud-api', () => ({
  enviarTemplateCloud: vi.fn(async () => ({ ok: mocks.cloud.ok, reason: mocks.cloud.ok ? undefined : 'Meta 131049' })),
  cloudApiConfigurada: () => true,
}));

const { POST } = await import('@/app/api/webhooks/qstash/whatsapp-cis/route');
const { sendWhatsapp } = await import('@/lib/whatsapp');
const { enviarTemplateCloud } = await import('@/lib/whatsapp/cloud-api');

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
    mocks.cloud.ok = true;
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
      expect.objectContaining({ motivo: 'anexo' }),
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

  // ── Identificação da pessoa no lote (11/08/2026) ──────────────────────────
  // O broadcast não tem envioId nem fase4EnvioId, então antes disto a entrega
  // era gravada com colaborador_id NULO: não havia no banco quem tinha
  // recebido, e a lista de quem ficou de fora teve de sair da DLQ do QStash.
  it('propaga colaboradorId/empresaId do lote para a telemetria de entrega', async () => {
    const res = await POST(makeReq({
      telefone: '11999999999',
      mensagem: 'Convite do projeto',
      colaboradorId: '33333333-3333-4333-8333-333333333333',
      empresaId: '44444444-4444-4444-8444-444444444444',
      kindEnvio: 'broadcast',
    }));

    expect(res.status).toBe(200);
    expect(sendWhatsapp).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'text' }),
      expect.objectContaining({
        motivo: 'broadcast',
        colaboradorId: '33333333-3333-4333-8333-333333333333',
        empresaId: '44444444-4444-4444-8444-444444444444',
      }),
    );
  });

  it('usa kindEnvio=relatorio quando o lote é de relatórios', async () => {
    const res = await POST(makeReq({
      telefone: '11999999999',
      mensagem: 'Seu relatório',
      colaboradorId: '33333333-3333-4333-8333-333333333333',
      kindEnvio: 'relatorio',
    }));

    expect(res.status).toBe(200);
    expect(sendWhatsapp).toHaveBeenNthCalledWith(1, expect.anything(), expect.objectContaining({ motivo: 'relatorio' }));
  });

  it('rejeita kindEnvio fora do enum (payload não escolhe o valor da coluna)', async () => {
    const res = await POST(makeReq({
      telefone: '11999999999',
      mensagem: 'oi',
      kindEnvio: 'qualquer_coisa',
    }));

    expect(res.status).toBe(400);
    expect(sendWhatsapp).not.toHaveBeenCalled();
  });

  it('rejeita colaboradorId que não é uuid', async () => {
    const res = await POST(makeReq({
      telefone: '11999999999',
      mensagem: 'oi',
      colaboradorId: 'nao-e-uuid',
    }));

    expect(res.status).toBe(400);
    expect(sendWhatsapp).not.toHaveBeenCalled();
  });

  it('lote sem identificação continua válido (retrocompatível), com meta vazia', async () => {
    const res = await POST(makeReq({ telefone: '11999999999', mensagem: 'oi' }));

    expect(res.status).toBe(200);
    expect(sendWhatsapp).toHaveBeenCalledWith(expect.anything(), {});
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
  /*
   * MODO TEMPLATE (Cloud API) — o caminho que a tela de Envios passou a usar.
   *
   * O schema deste webhook é `.strict()`, e o arquivo já carrega o aviso de que
   * publicar campo novo sem declará-lo faz o Zod recusar o payload INTEIRO e a
   * mensagem não sair. Estes testes existem para que isso seja pego aqui, e não
   * num lote real.
   */
  describe('modo template', () => {
    it('entrega pela Cloud API e NÃO usa o provedor de texto livre', async () => {
      const res = await POST(makeReq({
        telefone: '5522999999999',
        template: 'avaliacao_competencias',
        templateParams: ['Maria', 'Autocuidado e bem-estar profissional', 'https://macae.vertho.ai/dashboard/assessment'],
        colaboradorId: '33333333-3333-4333-8333-333333333333',
        empresaId: '44444444-4444-4444-8444-444444444444',
      }));

      expect(res.status).toBe(200);
      expect(await json(res)).toMatchObject({ success: true, via: 'cloud-api', template: 'avaliacao_competencias' });
      expect(enviarTemplateCloud).toHaveBeenCalledTimes(1);
      // O provedor legado está desconectado desde 11/08; passar por ele aqui
      // seria mandar a mensagem pelo canal que não entrega.
      expect(sendWhatsapp).not.toHaveBeenCalled();
    });

    it('grava o kind da telemetria como o NOME DO TEMPLATE', async () => {
      await POST(makeReq({
        telefone: '5522999999999',
        template: 'boas_vindas_v2',
        templateParams: ['Maria', 'Secretaria', 'https://macae.vertho.ai/entrar'],
        colaboradorId: '33333333-3333-4333-8333-333333333333',
      }));

      // Sem isso, duas copies do mesmo momento viram uma métrica só — e a
      // idempotência de quem publica deixa de distinguir uma da outra.
      expect(enviarTemplateCloud).toHaveBeenCalledWith(
        expect.objectContaining({ template: 'boas_vindas_v2' }),
        expect.objectContaining({ motivo: 'boas_vindas_v2' }),
      );
    });

    it('preserva o botão dinâmico e o slot semanal calculados antes da fila', async () => {
      await POST(makeReq({
        telefone: '5522999999999',
        template: 'semana_pendente_v2',
        templateParams: ['Maria', '3', '2'],
        templateBotaoParam: 'macae/2',
        templateDedupeKey: 'semana_pendente_v2:colab-1:calendario:3:pendente:2',
        colaboradorId: '33333333-3333-4333-8333-333333333333',
      }));

      expect(enviarTemplateCloud).toHaveBeenCalledWith(
        expect.objectContaining({
          template: 'semana_pendente_v2',
          params: ['Maria', '3', '2'],
          botaoParam: 'macae/2',
        }),
        expect.objectContaining({
          dedupeKey: 'semana_pendente_v2:colab-1:calendario:3:pendente:2',
        }),
      );
    });

    it('template sem contrato é recusado com 400 — e sem tentar enviar', async () => {
      const res = await POST(makeReq({
        telefone: '5522999999999',
        template: 'template_que_nao_existe',
        templateParams: ['Maria'],
      }));

      // 400 e não 503: retentar não faz template desconhecido passar a existir,
      // e deixar na fila só produz repetição eterna.
      expect(res.status).toBe(400);
      expect(enviarTemplateCloud).not.toHaveBeenCalled();
    });

    it('falha da Meta devolve 503 para o QStash retentar', async () => {
      mocks.cloud.ok = false;

      const res = await POST(makeReq({
        telefone: '5522999999999',
        template: 'avaliacao_competencias',
        templateParams: ['Maria', 'Autocuidado', 'https://macae.vertho.ai/dashboard/assessment'],
      }));

      expect(res.status).toBe(503);
    });

    it('payload sem `mensagem` E sem `template` é recusado', async () => {
      const res = await POST(makeReq({ telefone: '5522999999999', colaboradorId: '33333333-3333-4333-8333-333333333333' }));

      expect(res.status).toBe(400);
      expect(enviarTemplateCloud).not.toHaveBeenCalled();
      expect(sendWhatsapp).not.toHaveBeenCalled();
    });
  });
});
