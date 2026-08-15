// Tetos de espera nas chamadas à Graph API (Cloud API oficial).
//
// Sem teto, uma conexão pendurada da Meta segura a chamada até o `maxDuration`
// da função: quem clicou fica olhando "Enviando…" que nunca termina, e no
// webhook o custo é a Meta reentregar o evento por não receber o 200 a tempo.
// Nada disso aparece como erro — aparece como lentidão.
//
// A segunda invariante é de HONESTIDADE: timeout no envio NÃO é "não enviou".
// A Meta pode ter aceitado depois de o nosso lado desistir, e o motivo gravado
// precisa dizer isso, senão a telemetria afirma um fato que ninguém verificou.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ entregas: [] as any[] }));

vi.mock('@/lib/notifications/delivery-log', () => ({
  registrarEntrega: async (e: any) => { h.entregas.push(e); },
}));

const { enviarTextoCloud, urlDaMidia, baixarMidia } = await import('@/lib/whatsapp/cloud-api');

const chamadas: RequestInit[] = [];

function stubarFetch(impl: (url: any, init: any) => Promise<any>) {
  global.fetch = vi.fn(async (url: any, init: any) => {
    chamadas.push(init);
    return impl(url, init);
  }) as any;
}

const respostaOk = (json: any) => ({
  ok: true,
  status: 200,
  json: async () => json,
  headers: new Headers({ 'content-type': 'audio/ogg' }),
  arrayBuffer: async () => new ArrayBuffer(8),
});

function erroDeTimeout() {
  const e = new Error('The operation was aborted due to timeout');
  e.name = 'TimeoutError';
  return e;
}

beforeEach(() => {
  chamadas.length = 0;
  h.entregas.length = 0;
  process.env.META_WHATSAPPBUSINESS_API = 'token-de-teste';
  process.env.PHONE_NUMBER_ID = '123456';
});

describe('toda chamada à Graph API leva um teto de espera', () => {
  it('envio de texto passa um AbortSignal', async () => {
    stubarFetch(async () => respostaOk({ messages: [{ id: 'wamid.X' }] }));

    const r = await enviarTextoCloud({ phone: '5511999998888', texto: 'oi' });
    expect(r.ok).toBe(true);
    expect(chamadas[0].signal).toBeInstanceOf(AbortSignal);
  });

  it('a busca da URL da mídia e o download também', async () => {
    stubarFetch(async () => respostaOk({ url: 'https://lookaside.meta/x', mime_type: 'audio/ogg' }));

    await urlDaMidia('9876543210');
    await baixarMidia('https://lookaside.meta/x');

    expect(chamadas).toHaveLength(2);
    for (const c of chamadas) expect(c.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('estouro do teto — o que é dito sobre o que aconteceu', () => {
  it('🔴 o motivo diz que o estado é DESCONHECIDO, não que falhou o envio', async () => {
    stubarFetch(async () => { throw erroDeTimeout(); });

    const r = await enviarTextoCloud({ phone: '5511999998888', texto: 'oi' });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/sem resposta em 15s/);
    expect(r.reason).toMatch(/DESCONHECIDO/);
  });

  it('mesmo com teto estourado, a telemetria é gravada com o motivo', async () => {
    stubarFetch(async () => { throw erroDeTimeout(); });

    await enviarTextoCloud({ phone: '5511999998888', texto: 'oi' }, { empresaId: 'e1' });

    expect(h.entregas).toHaveLength(1);
    expect(h.entregas[0].status).toBe('falha');
    expect(h.entregas[0].provider).toBe('cloud-api');
    expect(h.entregas[0].error).toMatch(/sem resposta/);
  });

  it('erro de rede comum continua com a mensagem original', async () => {
    stubarFetch(async () => { throw new Error('ECONNREFUSED'); });

    const r = await enviarTextoCloud({ phone: '5511999998888', texto: 'oi' });
    expect(r.reason).toMatch(/ECONNREFUSED/);
    expect(r.reason).not.toMatch(/DESCONHECIDO/);
  });

  it('download que estoura o teto devolve o motivo do download, com o teto dele', async () => {
    stubarFetch(async () => { throw erroDeTimeout(); });

    const r = await baixarMidia('https://lookaside.meta/x');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/sem resposta em 30s/);
  });
});
