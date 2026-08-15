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

/**
 * Retry: onde pode e onde NÃO pode.
 *
 * A assimetria é a regra inteira. Ler mídia é idempotente — buscar duas vezes
 * devolve o mesmo áudio, e desistir na primeira falha transitória deixa quem
 * atende sem ouvir a resposta da pessoa. Enviar NÃO é: a Graph API não aceita
 * chave de idempotência em `/messages`, e um timeout não prova que a Meta
 * recusou. Repetir ali é o caminho curto para a mesma mensagem chegar duas vezes.
 */
describe('retry só nas leituras', () => {
  it('mídia: falha de rede é tentada de novo e a segunda vale', async () => {
    let n = 0;
    stubarFetch(async () => {
      n++;
      if (n === 1) throw new Error('ECONNRESET');
      return respostaOk({ url: 'https://lookaside.meta/x', mime_type: 'audio/ogg' });
    });

    const r = await urlDaMidia('9876543210');
    expect(r.ok).toBe(true);
    expect(n).toBe(2);
  });

  it('mídia expirada (404) NÃO é repetida — o erro já é definitivo', async () => {
    let n = 0;
    stubarFetch(async () => {
      n++;
      return { ok: false, status: 404, json: async () => ({ error: { message: 'not found' } }) };
    });

    const r = await urlDaMidia('9876543210');
    expect(r.ok).toBe(false);
    expect(n).toBe(1); // repetir só atrasaria o erro que já se sabe
  });

  it('🔴 ENVIO nunca é repetido — retry aqui entregaria a mensagem duas vezes', async () => {
    let n = 0;
    stubarFetch(async () => { n++; throw erroDeTimeout(); });

    const r = await enviarTextoCloud({ phone: '5511999998888', texto: 'oi' });
    expect(r.ok).toBe(false);
    expect(n).toBe(1);
  });
});
