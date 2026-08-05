// Contrato do serviço central de WhatsApp (lib/whatsapp/index.ts).
//
// Testa a LÓGICA DE FAILOVER, não os provedores: ambos os adapters são
// stubados. O que está sob teste é o que é nosso — ordenação, cache de saúde,
// cooldown, skip por capability e o contrato never-throw. Nenhuma chamada de
// rede: se este arquivo bater na Z-API ou na WaSender, está errado.
//
// Invariantes (cada `it` abaixo prova uma):
//   1. Ordem = primário (WHATSAPP_PRIMARY, default zapi) e depois os demais.
//   2. Só provedores `configured()` entram na fila.
//   3. Provedor sem a capability da mensagem é pulado SEM health nem send.
//   4. Provedor insalubre é pulado; o próximo entrega.
//   5. Falha de envio em provedor saudável → cooldown de 60s (markDown).
//   6. Saúde OK é cacheada por 30s (não re-checa a cada mensagem do lote).
//   7. `sendWhatsapp` NUNCA lança — devolve { ok:false, attempts, reason }.
//   8. Telefone é normalizado para E.164 BR antes de despachar.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WaMessage, WaProvider, WaCapabilities } from '@/lib/whatsapp/types';

const ALL: WaCapabilities = { text: true, link: true, document: true, audio: true };

/** Stub controlável de provedor — o dublê que substitui zapi/wasender. */
function makeStub(id: 'zapi' | 'wasender') {
  return {
    id,
    label: id,
    capabilities: { ...ALL } as WaCapabilities,
    configured: true,
    health: { ok: true, reason: undefined as string | undefined },
    send: { ok: true, status: 200, reason: undefined as string | undefined },
    calls: { configured: 0, health: 0, send: [] as WaMessage[] },
  };
}

const mocks = vi.hoisted(() => ({
  zapi: null as any,
  wasender: null as any,
}));

/** Constrói o WaProvider real a partir do stub, contando as chamadas. */
function asProvider(stub: () => any): WaProvider {
  return {
    get id() { return stub().id; },
    get label() { return stub().label; },
    get capabilities() { return stub().capabilities; },
    configured() { stub().calls.configured++; return stub().configured; },
    async health() { stub().calls.health++; return { ...stub().health }; },
    async send(msg: WaMessage) { stub().calls.send.push(msg); return { ...stub().send }; },
  };
}

vi.mock('@/lib/whatsapp/providers/zapi', () => ({
  zapiProvider: asProvider(() => mocks.zapi),
}));
vi.mock('@/lib/whatsapp/providers/wasender', () => ({
  wasenderProvider: asProvider(() => mocks.wasender),
}));

// Telemetria de entrega (mig 198) fica fora deste arquivo: aqui o assunto é
// failover. O contrato do log tem arquivo próprio (whatsapp-delivery-log.test.ts).
vi.mock('@/lib/notifications/delivery-log', () => ({
  registrarEntrega: vi.fn(async () => 'stub-delivery-id'),
}));

const { sendWhatsapp, whatsappHealth, assertWhatsappAvailable, resetWhatsappHealthCache } =
  await import('@/lib/whatsapp');

const PHONE = '(11) 99999-9999';
const E164 = '5511999999999';
const text = (phone = PHONE): WaMessage => ({ kind: 'text', phone, text: 'oi' });

describe('sendWhatsapp — failover multi-provedor', () => {
  beforeEach(() => {
    mocks.zapi = makeStub('zapi');
    mocks.wasender = makeStub('wasender');
    delete process.env.WHATSAPP_PRIMARY;
    resetWhatsappHealthCache();
    vi.useFakeTimers();
    // Rede é proibida neste arquivo: qualquer fetch estoura o teste.
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('fetch real proibido no teste de failover'); }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  // ── 1. ordenação ──────────────────────────────────────────────────────────
  it('tenta o primário primeiro (default zapi) e não toca no backup quando entrega', async () => {
    const r = await sendWhatsapp(text());

    expect(r.ok).toBe(true);
    expect(r.provider).toBe('zapi');
    expect(r.attempts).toEqual([{ provider: 'zapi', ok: true, status: 200, reason: undefined }]);
    expect(mocks.wasender.calls.send).toHaveLength(0);
    expect(mocks.wasender.calls.health).toBe(0);
  });

  it('respeita WHATSAPP_PRIMARY=wasender invertendo a ordem', async () => {
    process.env.WHATSAPP_PRIMARY = 'wasender';

    const r = await sendWhatsapp(text());

    expect(r.provider).toBe('wasender');
    expect(mocks.zapi.calls.send).toHaveLength(0);
  });

  it('cai no default zapi quando WHATSAPP_PRIMARY é um id desconhecido', async () => {
    process.env.WHATSAPP_PRIMARY = 'telepatia';

    const r = await sendWhatsapp(text());

    expect(r.provider).toBe('zapi');
  });

  // ── 2. só configurados ────────────────────────────────────────────────────
  it('pula provedor não configurado sem registrar tentativa', async () => {
    mocks.zapi.configured = false;

    const r = await sendWhatsapp(text());

    expect(r.ok).toBe(true);
    expect(r.provider).toBe('wasender');
    expect(r.attempts.map((a) => a.provider)).toEqual(['wasender']);
    expect(mocks.zapi.calls.health).toBe(0);
  });

  it('devolve ok:false quando nenhum provedor está configurado', async () => {
    mocks.zapi.configured = false;
    mocks.wasender.configured = false;

    const r = await sendWhatsapp(text());

    expect(r).toEqual({ ok: false, attempts: [], reason: 'nenhum provedor de WhatsApp configurado' });
  });

  // ── 3. capability ─────────────────────────────────────────────────────────
  it('pula provedor sem a capability da mensagem — sem health, sem send', async () => {
    mocks.zapi.capabilities.audio = false;

    const r = await sendWhatsapp({ kind: 'audio', phone: PHONE, url: 'https://x/a.mp3' });

    expect(r.ok).toBe(true);
    expect(r.provider).toBe('wasender');
    expect(r.attempts[0]).toEqual({ provider: 'zapi', ok: false, reason: 'não suporta audio' });
    expect(mocks.zapi.calls.health).toBe(0);
    expect(mocks.zapi.calls.send).toHaveLength(0);
  });

  // ── 4. saúde ──────────────────────────────────────────────────────────────
  it('faz failover quando o primário está insalubre', async () => {
    mocks.zapi.health = { ok: false, reason: 'desconectada' };

    const r = await sendWhatsapp(text());

    expect(r.ok).toBe(true);
    expect(r.provider).toBe('wasender');
    expect(r.attempts[0]).toEqual({ provider: 'zapi', ok: false, reason: 'saúde: desconectada' });
    expect(mocks.zapi.calls.send).toHaveLength(0); // insalubre não recebe send
  });

  it('faz failover quando o primário está saudável mas o envio falha', async () => {
    mocks.zapi.send = { ok: false, status: 500, reason: 'Z-API HTTP 500' };

    const r = await sendWhatsapp(text());

    expect(r.ok).toBe(true);
    expect(r.provider).toBe('wasender');
    expect(r.attempts[0]).toEqual({ provider: 'zapi', ok: false, status: 500, reason: 'Z-API HTTP 500' });
    expect(mocks.zapi.calls.send).toHaveLength(1);
  });

  // ── 5. cooldown (60s) ─────────────────────────────────────────────────────
  it('põe em cooldown de 60s o provedor que falhou, e o reabilita depois', async () => {
    mocks.zapi.send = { ok: false, status: 500, reason: 'boom' };
    await sendWhatsapp(text()); // 1ª msg: tenta zapi, falha, markDown

    expect(mocks.zapi.calls.send).toHaveLength(1);

    // 2ª msg dentro do cooldown: zapi é pulado SEM re-checar saúde nem enviar.
    vi.advanceTimersByTime(59_000);
    const r2 = await sendWhatsapp(text());

    expect(r2.provider).toBe('wasender');
    expect(mocks.zapi.calls.send).toHaveLength(1); // não tentou de novo
    expect(mocks.zapi.calls.health).toBe(1);       // não re-checou
    expect(r2.attempts[0].reason).toBe('saúde: boom');

    // Passado o cooldown, volta a ser considerado (e agora entrega).
    vi.advanceTimersByTime(2_000);
    mocks.zapi.send = { ok: true, status: 200, reason: undefined };
    const r3 = await sendWhatsapp(text());

    expect(r3.provider).toBe('zapi');
    expect(mocks.zapi.calls.health).toBe(2); // re-checou após expirar
  });

  // ── 6. cache de saúde OK (30s) ────────────────────────────────────────────
  it('cacheia saúde OK por 30s — não re-checa a cada mensagem do lote', async () => {
    await sendWhatsapp(text());
    await sendWhatsapp(text());
    vi.advanceTimersByTime(29_000);
    await sendWhatsapp(text());

    expect(mocks.zapi.calls.health).toBe(1);
    expect(mocks.zapi.calls.send).toHaveLength(3);

    vi.advanceTimersByTime(2_000); // 31s → expirou
    await sendWhatsapp(text());

    expect(mocks.zapi.calls.health).toBe(2);
  });

  it('cooldown de saúde é mais longo que o TTL de saúde OK (60s vs 30s)', async () => {
    // Um provedor insalubre não pode voltar à fila aos 31s só porque o TTL de
    // "ok" expirou — a entrada negativa vale 60s. Regressão do `cached.ok ? ...`.
    mocks.zapi.health = { ok: false, reason: 'desconectada' };
    await sendWhatsapp(text());
    expect(mocks.zapi.calls.health).toBe(1);

    vi.advanceTimersByTime(45_000); // > TTL(30s), < cooldown(60s)
    await sendWhatsapp(text());

    expect(mocks.zapi.calls.health).toBe(1); // ainda em cooldown, não re-checou
  });

  // ── 7. never-throw ────────────────────────────────────────────────────────
  it('não lança quando todos falham — devolve ok:false com a trilha completa', async () => {
    mocks.zapi.health = { ok: false, reason: 'desconectada' };
    mocks.wasender.send = { ok: false, status: 401, reason: 'WaSender HTTP 401' };

    const r = await sendWhatsapp(text());

    expect(r.ok).toBe(false);
    expect(r.provider).toBeUndefined();
    expect(r.attempts).toHaveLength(2);
    expect(r.reason).toBe('zapi: saúde: desconectada | wasender: WaSender HTTP 401');
  });

  it('não lança quando um provedor explode — o erro vira falha, não exceção', async () => {
    mocks.zapi.health = { ok: false, reason: 'desconectada' };
    mocks.wasender.send = { ok: false, reason: 'WaSender rede: ECONNRESET' };

    await expect(sendWhatsapp(text())).resolves.toMatchObject({ ok: false });
  });

  // ── 8. normalização de telefone ───────────────────────────────────────────
  it('normaliza o telefone para E.164 BR antes de despachar', async () => {
    await sendWhatsapp(text('(11) 99999-9999'));

    expect(mocks.zapi.calls.send[0].phone).toBe(E164);
  });

  it('rejeita telefone inválido antes de tocar em qualquer provedor', async () => {
    const r = await sendWhatsapp(text('abc'));

    expect(r.ok).toBe(false);
    expect(r.attempts).toEqual([]);
    expect(r.reason).toContain('telefone inválido');
    expect(mocks.zapi.calls.health).toBe(0);
    expect(mocks.zapi.calls.send).toHaveLength(0);
  });
});

describe('whatsappHealth / assertWhatsappAvailable', () => {
  beforeEach(() => {
    mocks.zapi = makeStub('zapi');
    mocks.wasender = makeStub('wasender');
    delete process.env.WHATSAPP_PRIMARY;
    resetWhatsappHealthCache();
  });

  it('reporta os dois provedores, marcando o primário', async () => {
    const h = await whatsappHealth();

    expect(h.map((x) => x.provider)).toEqual(['zapi', 'wasender']);
    expect(h.find((x) => x.provider === 'zapi')!.primary).toBe(true);
    expect(h.find((x) => x.provider === 'wasender')!.primary).toBe(false);
  });

  it('não chama health() de provedor não configurado', async () => {
    mocks.zapi.configured = false;

    const h = await whatsappHealth();

    expect(mocks.zapi.calls.health).toBe(0);
    expect(h[0]).toMatchObject({ provider: 'zapi', configured: false, ok: false, reason: 'não configurado' });
  });

  it('assertWhatsappAvailable lança quando nenhum provedor está configurado', async () => {
    mocks.zapi.configured = false;
    mocks.wasender.configured = false;

    await expect(assertWhatsappAvailable()).rejects.toThrow('Nenhum provedor de WhatsApp configurado');
  });

  it('assertWhatsappAvailable lança com o detalhe de cada provedor caído', async () => {
    mocks.zapi.health = { ok: false, reason: 'desconectada' };
    mocks.wasender.health = { ok: false, reason: 'status=disconnected' };

    await expect(assertWhatsappAvailable()).rejects.toThrow(
      'WhatsApp indisponível (zapi: desconectada; wasender: status=disconnected)',
    );
  });

  it('assertWhatsappAvailable passa se ao menos um provedor está saudável', async () => {
    mocks.zapi.health = { ok: false, reason: 'desconectada' };

    await expect(assertWhatsappAvailable()).resolves.toBeUndefined();
  });
});
