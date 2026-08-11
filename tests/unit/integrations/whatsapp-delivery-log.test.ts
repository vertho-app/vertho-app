// Contrato da telemetria de entrega no serviço central de WhatsApp (mig 198).
//
// O que está sob teste é o INSTRUMENTO DE MEDIÇÃO, não o envio. Ele importa
// porque a decisão de negócio (push substitui parte do WhatsApp?) vai ser tomada
// em cima dos números que ele produz — instrumento errado produz decisão errada
// com cara de dado.
//
// Invariantes (uma por `it`):
//   1. Envio com sucesso grava UMA linha: canal, status, provider e o motivo do meta
//      (que a telemetria grava na coluna `kind` — a tradução vive em lib/whatsapp).
//   2. Chamada SEM meta ainda grava, com kind nulo — a lacuna de instrumentação
//      é contável (`kind IS NULL`), nunca ausência silenciosa.
//   3. Falha de envio grava status 'falha' com o motivo.
//   4. Telefone inválido (curto-circuito antes de qualquer provedor) TAMBÉM grava.
//   5. 🔴 Telemetria explodindo NÃO altera o resultado do envio nem faz
//      `sendWhatsapp` lançar. O envio é o produto; a medição é acessória.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WaMessage, WaProvider, WaCapabilities } from '@/lib/whatsapp/types';

const ALL: WaCapabilities = { text: true, link: true, document: true, audio: true };

const mocks = vi.hoisted(() => ({
  zapi: null as any,
  registrar: null as any,
}));

function makeStub() {
  return {
    configured: true,
    health: { ok: true } as { ok: boolean; reason?: string },
    send: { ok: true, status: 200 } as { ok: boolean; status?: number; reason?: string },
  };
}

const provider = (id: 'zapi' | 'wasender'): WaProvider => ({
  id,
  label: id,
  capabilities: { ...ALL },
  configured() { return id === 'zapi' ? mocks.zapi.configured : false; },
  async health() { return { ...mocks.zapi.health }; },
  async send(_msg: WaMessage) { return { ...mocks.zapi.send }; },
});

vi.mock('@/lib/whatsapp/providers/zapi', () => ({ zapiProvider: provider('zapi') }));
vi.mock('@/lib/whatsapp/providers/wasender', () => ({ wasenderProvider: provider('wasender') }));
vi.mock('@/lib/notifications/delivery-log', () => ({
  registrarEntrega: (...args: unknown[]) => mocks.registrar(...args),
}));

const { sendWhatsapp, resetWhatsappHealthCache } = await import('@/lib/whatsapp');

const PHONE = '(11) 99999-9999';
const msg = (phone = PHONE): WaMessage => ({ kind: 'text', phone, text: 'oi' });

describe('sendWhatsapp — telemetria de entrega (mig 198)', () => {
  beforeEach(() => {
    mocks.zapi = makeStub();
    mocks.registrar = vi.fn(async () => 'delivery-id');
    delete process.env.WHATSAPP_PRIMARY;
    resetWhatsappHealthCache();
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('fetch real proibido'); }));
  });

  afterEach(() => vi.unstubAllGlobals());

  // ── 1 ──────────────────────────────────────────────────────────────────────
  it('grava uma linha com canal, status, provider e o motivo do meta', async () => {
    const r = await sendWhatsapp(msg(), {
      motivo: 'pilula',
      empresaId: 'emp-1',
      colaboradorId: 'colab-1',
      dedupeKey: 'pilula:colab-1:semana3',
    });

    expect(r.ok).toBe(true);
    expect(mocks.registrar).toHaveBeenCalledTimes(1);
    expect(mocks.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        canal: 'whatsapp',
        status: 'sucesso',
        provider: 'zapi',
        kind: 'pilula',
        empresaId: 'emp-1',
        colaboradorId: 'colab-1',
        dedupeKey: 'pilula:colab-1:semana3',
        error: null,
      })
    );
  });

  // ── 2 ──────────────────────────────────────────────────────────────────────
  it('call site NÃO instrumentado ainda grava, com kind nulo (lacuna contável)', async () => {
    const r = await sendWhatsapp(msg());

    expect(r.ok).toBe(true);
    expect(mocks.registrar).toHaveBeenCalledTimes(1);
    expect(mocks.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ canal: 'whatsapp', status: 'sucesso', kind: null, colaboradorId: null })
    );
  });

  // ── 3 ──────────────────────────────────────────────────────────────────────
  it('falha de envio grava status falha com o motivo', async () => {
    mocks.zapi.send = { ok: false, status: 500, reason: 'instância desconectada' };

    const r = await sendWhatsapp(msg(), { motivo: 'otp' });

    expect(r.ok).toBe(false);
    expect(mocks.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ canal: 'whatsapp', status: 'falha', kind: 'otp' })
    );
    const arg = mocks.registrar.mock.calls[0][0];
    expect(arg.error).toContain('instância desconectada');
  });

  // ── 4 ──────────────────────────────────────────────────────────────────────
  it('telefone inválido também grava — curto-circuito não pode sumir da conta', async () => {
    const r = await sendWhatsapp(msg('abc'), { motivo: 'otp' });

    expect(r.ok).toBe(false);
    expect(mocks.registrar).toHaveBeenCalledTimes(1);
    const arg = mocks.registrar.mock.calls[0][0];
    expect(arg.status).toBe('falha');
    expect(arg.provider).toBeNull();
    expect(arg.error).toContain('telefone inválido');
  });

  // ── 5 ── a que mais importa ────────────────────────────────────────────────
  it('telemetria explodindo NÃO afeta o envio nem faz sendWhatsapp lançar', async () => {
    mocks.registrar = vi.fn(async () => { throw new Error('supabase fora do ar'); });

    const r = await sendWhatsapp(msg(), { motivo: 'pilula' });

    expect(r.ok).toBe(true);
    expect(r.provider).toBe('zapi');
    expect(r.attempts).toHaveLength(1);
  });

  it('telemetria explodindo também não mascara uma falha real de envio', async () => {
    mocks.zapi.send = { ok: false, status: 500, reason: 'boom' };
    mocks.registrar = vi.fn(async () => { throw new Error('supabase fora do ar'); });

    const r = await sendWhatsapp(msg(), { motivo: 'pilula' });

    expect(r.ok).toBe(false);
    expect(r.reason).toContain('boom');
  });
});
