import { describe, it, expect, beforeEach, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * CONARH 52 — a entrega do T+0 (o recorte prometido no estande).
 *
 * A INVARIANTE QUE ESTE ARQUIVO TRAVA: **`followup_step` segue a ENTREGA, não a
 * tentativa.**
 *
 * Medido em 18/08/2026, dia 1 da feira: o worker marcava `followup_step = 1`
 * ("T+0 executado") mesmo com o WhatsApp e o e-mail falhando. Com
 * `recorte_demonstracao` PENDING na Meta e a Z-API caída desde 11/08, nada saía —
 * e o lead que não recebeu ficava indistinguível de quem recebeu. Os 2 leads de
 * `conarh-2026` estavam em step 1 sem envio comprovado.
 *
 * Sem esses testes, "salvar para enviar depois" volta a ser uma segunda mentira:
 * a fila existiria e o lead sairia dela sem nada ter chegado.
 */

const sb = criarSupabaseMock({
  resolver: (tabela) =>
    tabela === 'diag_leads'
      ? {
          id: 'lead-1',
          scope_id: 'conarh-2026',
          nome: 'Maria Souza',
          telefone: '+5511999999999',
          email: null,
          t0_status: 'pendente',
          t0_tentativas: 0,
          followup_step: 0,
        }
      : null,
});

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));

const enviarPorTemplate = vi.fn();
vi.mock('@/lib/notifications/pilula-template', () => ({
  enviarPorTemplate: (...a: any[]) => enviarPorTemplate(...a),
}));

const sendWhatsapp = vi.fn();
vi.mock('@/lib/whatsapp', () => ({ sendWhatsapp: (...a: any[]) => sendWhatsapp(...a) }));

const resendSend = vi.fn();
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: (...a: any[]) => resendSend(...a) };
  },
}));

const { entregarT0 } = await import('@/lib/conarh/entrega-t0');

/** O update de rastro (t0_*) — sempre existe; o de step só quando entregou. */
const rastro = () => sb.escritas.find((e) => e.op === 'update' && 't0_status' in (e.payload || {}));
const avancoDeStep = () => sb.escritas.find((e) => e.op === 'update' && 'followup_step' in (e.payload || {}));

beforeEach(() => {
  sb.reset();
  enviarPorTemplate.mockReset();
  sendWhatsapp.mockReset();
  resendSend.mockReset();
  delete process.env.RESEND_API_KEY;
});

describe('entregarT0 — o estado segue a entrega', () => {
  it('🔴 NADA chegou: não avança followup_step e carimba o motivo', async () => {
    // O cenário real de 18/08: template PENDING (tentou=false) e legado caído.
    enviarPorTemplate.mockResolvedValue({ tentou: false });
    sendWhatsapp.mockResolvedValue({ ok: false, reason: 'zapi: saúde: desconectada' });

    const r = await entregarT0('lead-1');

    expect(r.tipo).toBe('executado');
    expect((r as any).status).toBe('falhou');
    expect(rastro()!.payload.t0_status).toBe('falhou');
    expect(rastro()!.payload.t0_erro).toContain('desconectada');
    expect(rastro()!.payload.t0_canal).toBeNull();
    // A asserção que importa: o lead NÃO é promovido a "T+0 executado".
    expect(avancoDeStep()).toBeUndefined();
  });

  it('WhatsApp entregou: t0_status=enviado, canal whatsapp e step avança', async () => {
    enviarPorTemplate.mockResolvedValue({ tentou: true, ok: true });

    const r = await entregarT0('lead-1');

    expect((r as any).status).toBe('enviado');
    expect(rastro()!.payload.t0_status).toBe('enviado');
    expect(rastro()!.payload.t0_canal).toBe('whatsapp');
    expect(rastro()!.payload.t0_enviado_em).toBeTruthy();
    expect(avancoDeStep()!.payload.followup_step).toBe(1);
    // Template tentado NÃO cai no legado: dois recortes na mesma conversa é ruído.
    expect(sendWhatsapp).not.toHaveBeenCalled();
  });

  it('template ACEITO e depois falho não vira legado — e conta como não entregue', async () => {
    enviarPorTemplate.mockResolvedValue({ tentou: true, ok: false, reason: '132001 template não existe' });

    const r = await entregarT0('lead-1');

    expect(sendWhatsapp).not.toHaveBeenCalled();
    expect((r as any).status).toBe('falhou');
    expect(avancoDeStep()).toBeUndefined();
  });

  it('só o e-mail chegou: entrega vale, canal é email', async () => {
    sb.reset();
    const mock = criarSupabaseMock({
      resolver: () => ({
        id: 'lead-2', scope_id: 'conarh-2026', nome: 'João', telefone: null,
        email: 'joao@empresa.com', t0_status: 'pendente', t0_tentativas: 0, followup_step: 0,
      }),
    });
    sb.client.from = mock.client.from;
    process.env.RESEND_API_KEY = 're_test';
    resendSend.mockResolvedValue({ data: { id: 'e1' } });

    const r = await entregarT0('lead-2');

    expect((r as any).status).toBe('enviado');
    expect((r as any).canal).toBe('email');
    expect(mock.escritas.find((e) => 'followup_step' in (e.payload || {}))!.payload.followup_step).toBe(1);
  });

  it('já entregue: não reenvia nada e não escreve', async () => {
    const mock = criarSupabaseMock({
      resolver: () => ({
        id: 'lead-3', scope_id: 'conarh-2026', nome: 'Ana', telefone: '+5511988888888',
        email: null, t0_status: 'enviado', t0_canal: 'whatsapp', t0_tentativas: 1, followup_step: 1,
      }),
    });
    sb.client.from = mock.client.from;

    const r = await entregarT0('lead-3');

    expect(r.tipo).toBe('ja_entregue');
    expect(enviarPorTemplate).not.toHaveBeenCalled();
    expect(sendWhatsapp).not.toHaveBeenCalled();
    // `escritas` prova que a idempotência impediu a ESCRITA, não só mudou o
    // retorno — é ela que fecha o duplo disparo (QStash + fallback interno).
    expect(mock.escritas).toHaveLength(0);
  });

  it('forcar: reenvia mesmo o já entregue (o disparo manual de um lead só)', async () => {
    const mock = criarSupabaseMock({
      resolver: () => ({
        id: 'lead-3', scope_id: 'conarh-2026', nome: 'Ana', telefone: '+5511988888888',
        email: null, t0_status: 'enviado', t0_tentativas: 1, followup_step: 1,
      }),
    });
    sb.client.from = mock.client.from;
    enviarPorTemplate.mockResolvedValue({ tentou: true, ok: true });

    const r = await entregarT0('lead-3', { forcar: true });

    expect(r.tipo).toBe('executado');
    expect(enviarPorTemplate).toHaveBeenCalledTimes(1);
  });

  it('lead de outra campanha não vira remetente de WhatsApp', async () => {
    const mock = criarSupabaseMock({
      resolver: () => ({ id: 'lead-x', scope_id: 'radarbett', telefone: '+5511977777777' }),
    });
    sb.client.from = mock.client.from;

    const r = await entregarT0('lead-x');

    expect(r.tipo).toBe('fora_da_campanha');
    expect(enviarPorTemplate).not.toHaveBeenCalled();
    expect(sendWhatsapp).not.toHaveBeenCalled();
    expect(mock.escritas).toHaveLength(0);
  });

  it('conta a tentativa mesmo quando falha — é o que separa "sem canal" de "não tentado"', async () => {
    const mock = criarSupabaseMock({
      resolver: () => ({
        id: 'lead-4', scope_id: 'conarh-2026', nome: 'Rui', telefone: '+5511966666666',
        email: null, t0_status: 'falhou', t0_tentativas: 3, followup_step: 0,
      }),
    });
    sb.client.from = mock.client.from;
    enviarPorTemplate.mockResolvedValue({ tentou: false });
    sendWhatsapp.mockResolvedValue({ ok: false, reason: 'zapi: desconectada' });

    await entregarT0('lead-4');

    const escrita = mock.escritas.find((e) => 't0_tentativas' in (e.payload || {}));
    expect(escrita!.payload.t0_tentativas).toBe(4);
    expect(escrita!.payload.t0_tentado_em).toBeTruthy();
  });
});
