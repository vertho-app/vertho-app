// Trava de fila do provedor antes de um disparo em lote
// (lib/whatsapp::assertFilaDoProvedorLimpa / assertWhatsappAvailable).
//
// Por que existe: em 11/08/2026, 13 mensagens ficaram presas na fila INTERNA da
// Z-API — aceitas com HTTP 200 (e contadas como "sucesso"), nunca entregues, e
// prontas para descarregar em rajada assim que a instância reconectasse. Um
// provedor `connected=true` com fila residual é justamente o estado perigoso.
//
// Invariantes:
//   1. Fila acima do teto bloqueia o lote, com o número no erro.
//   2. Fila dentro do teto libera.
//   3. `null` (= "não sei") NUNCA bloqueia — instabilidade da API do provedor
//      não pode virar indisponibilidade do canal.
//   4. Provedor sem suporte a fila não bloqueia.
//   5. A fila de provedor INSALUBRE é ignorada (quem entrega é o saudável).
//   6. Sem o parâmetro, o comportamento antigo é preservado (não consulta fila).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WaMessage, WaProvider, WaCapabilities } from '@/lib/whatsapp/types';

const ALL: WaCapabilities = { text: true, link: true, document: true, audio: true };

function makeStub(id: 'zapi' | 'wasender', comFila: boolean) {
  return {
    id,
    label: id,
    capabilities: { ...ALL } as WaCapabilities,
    configured: true,
    health: { ok: true, reason: undefined as string | undefined },
    fila: comFila ? (0 as number | null) : undefined,
    calls: { fila: 0 },
  };
}

const mocks = vi.hoisted(() => ({ zapi: null as any, wasender: null as any }));

function asProvider(stub: () => any): WaProvider {
  const base: WaProvider = {
    get id() { return stub().id; },
    get label() { return stub().label; },
    get capabilities() { return stub().capabilities; },
    configured() { return stub().configured; },
    async health() { return { ...stub().health }; },
    async send(_msg: WaMessage) { return { ok: true, status: 200 }; },
  };
  // pendingQueue é OPCIONAL no contrato: só existe se o stub declarar fila.
  Object.defineProperty(base, 'pendingQueue', {
    get() {
      if (stub().fila === undefined) return undefined;
      return async () => { stub().calls.fila++; return stub().fila; };
    },
  });
  return base;
}

vi.mock('@/lib/whatsapp/providers/zapi', () => ({ zapiProvider: asProvider(() => mocks.zapi) }));
vi.mock('@/lib/whatsapp/providers/wasender', () => ({ wasenderProvider: asProvider(() => mocks.wasender) }));
vi.mock('@/lib/notifications/delivery-log', () => ({ registrarEntrega: vi.fn(async () => 'stub') }));

const { assertWhatsappAvailable, assertFilaDoProvedorLimpa, whatsappHealth, resetWhatsappHealthCache } =
  await import('@/lib/whatsapp');

describe('trava de fila antes do lote', () => {
  beforeEach(() => {
    mocks.zapi = makeStub('zapi', true);
    mocks.wasender = makeStub('wasender', false);
    delete process.env.WHATSAPP_PRIMARY;
    resetWhatsappHealthCache();
  });

  it('bloqueia quando a fila está acima do teto, dizendo quantas são', async () => {
    mocks.zapi.fila = 13;

    await expect(assertWhatsappAvailable({ maxFilaPendente: 0 })).rejects.toThrow(/13 mensagem/);
    await expect(assertWhatsappAvailable({ maxFilaPendente: 0 })).rejects.toThrow(/rajada/);
  });

  it('libera quando a fila está dentro do teto', async () => {
    mocks.zapi.fila = 3;

    await expect(assertWhatsappAvailable({ maxFilaPendente: 5 })).resolves.toBeUndefined();
  });

  it('libera com fila vazia', async () => {
    mocks.zapi.fila = 0;

    await expect(assertWhatsappAvailable({ maxFilaPendente: 0 })).resolves.toBeUndefined();
  });

  it('null ("não sei") NÃO bloqueia — erro do provedor não trava o canal', async () => {
    mocks.zapi.fila = null;

    await expect(assertWhatsappAvailable({ maxFilaPendente: 0 })).resolves.toBeUndefined();
  });

  it('provedor sem suporte a fila não bloqueia', async () => {
    mocks.zapi = makeStub('zapi', false); // sem pendingQueue

    await expect(assertWhatsappAvailable({ maxFilaPendente: 0 })).resolves.toBeUndefined();
  });

  it('ignora a fila de provedor INSALUBRE — quem entrega é o saudável', async () => {
    mocks.zapi.health = { ok: false, reason: 'desconectada' };
    mocks.zapi.fila = 99;
    mocks.wasender.health = { ok: true };

    await expect(assertWhatsappAvailable({ maxFilaPendente: 0 })).resolves.toBeUndefined();
    expect(mocks.zapi.calls.fila).toBe(0); // nem consultou
  });

  it('sem o parâmetro, não consulta fila (comportamento anterior preservado)', async () => {
    mocks.zapi.fila = 99;

    await expect(assertWhatsappAvailable()).resolves.toBeUndefined();
    expect(mocks.zapi.calls.fila).toBe(0);
  });

  it('assertFilaDoProvedorLimpa é usável sozinha (call-site do admin)', async () => {
    mocks.zapi.fila = 7;

    await expect(assertFilaDoProvedorLimpa(0)).rejects.toThrow(/7 mensagem/);
    await expect(assertFilaDoProvedorLimpa(10)).resolves.toBeUndefined();
  });

  it('whatsappHealth só consulta a fila quando pedido', async () => {
    mocks.zapi.fila = 4;

    const semFila = await whatsappHealth();
    expect(semFila[0].filaPendente).toBeUndefined();
    expect(mocks.zapi.calls.fila).toBe(0);

    const comFila = await whatsappHealth({ incluirFila: true });
    expect(comFila.find((h) => h.provider === 'zapi')!.filaPendente).toBe(4);
  });
});
