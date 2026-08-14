/**
 * Contrato do webhook da Cloud API (14/08/2026).
 *
 * O que estes testes protegem:
 *
 *  - **Aceite ≠ entrega.** `delivered`/`read` não podem mexer em `status`, que
 *    significa "o provedor aceitou". Fundir os dois eixos reproduz o relatório
 *    que disse "155 enviados" quando 50 chegaram (11/08).
 *  - **Ordem dos webhooks não é garantida.** Se `read` chegar antes de
 *    `delivered`, a mensagem não pode ficar eternamente "não entregue".
 *  - **Payload estranho não derruba a resposta.** A Meta reentrega enquanto não
 *    recebe 200 e desativa a inscrição se o erro persistir — um evento novo não
 *    pode calar o canal inteiro.
 */
import { describe, it, expect } from 'vitest';
import {
  interpretarPayload,
  camposDoStatus,
  encareceu,
  type StatusEntrega,
} from '@/lib/whatsapp/cloud-webhook';

const AGORA = () => Date.parse('2026-08-14T12:00:00Z');

function envelope(value: unknown) {
  return { object: 'whatsapp_business_account', entry: [{ id: '1', changes: [{ field: 'messages', value }] }] };
}

describe('mensagens recebidas', () => {
  it('extrai texto, remetente e timestamp em segundos', () => {
    const r = interpretarPayload(
      envelope({
        metadata: { phone_number_id: '1256487020887128' },
        messages: [{ id: 'wamid.ABC', from: '5511973882303', type: 'text', timestamp: '1786620000', text: { body: 'oi' } }],
      }),
      AGORA,
    );
    expect(r.mensagens).toHaveLength(1);
    const m = r.mensagens[0]!;
    expect(m.waMessageId).toBe('wamid.ABC');
    expect(m.fromPhone).toBe('5511973882303');
    expect(m.texto).toBe('oi');
    expect(m.toPhoneId).toBe('1256487020887128');
    // Epoch em SEGUNDOS: tratar como ms daria uma data em 1970.
    expect(m.recebidaEm.startsWith('2026-')).toBe(true);
  });

  it('áudio e imagem entram com texto NULL, não como mensagem vazia', () => {
    const r = interpretarPayload(
      envelope({
        metadata: { phone_number_id: 'x' },
        messages: [{ id: 'wamid.AUDIO', from: '5511999998888', type: 'audio', timestamp: '1786620000', audio: { id: 'media-1' } }],
      }),
      AGORA,
    );
    expect(r.mensagens[0]!.texto).toBeNull();
    expect(r.mensagens[0]!.tipo).toBe('audio');
    // O payload cru fica guardado: é a única pista de que houve mídia.
    expect(r.mensagens[0]!.raw).toMatchObject({ audio: { id: 'media-1' } });
  });

  it('lê resposta de botão e de lista', () => {
    const r = interpretarPayload(
      envelope({
        metadata: {},
        messages: [
          { id: 'w1', from: '551', type: 'interactive', timestamp: '1786620000', interactive: { button_reply: { title: 'Sim' } } },
          { id: 'w2', from: '552', type: 'interactive', timestamp: '1786620000', interactive: { list_reply: { title: 'Opção A' } } },
        ],
      }),
      AGORA,
    );
    expect(r.mensagens.map((m) => m.texto)).toEqual(['Sim', 'Opção A']);
  });

  it('mensagem sem id ou sem from é ignorada e CONTADA', () => {
    const r = interpretarPayload(
      envelope({ metadata: {}, messages: [{ type: 'text', text: { body: 'sem id' } }] }),
      AGORA,
    );
    expect(r.mensagens).toHaveLength(0);
    expect(r.ignorados).toBe(1);
  });
});

describe('status de entrega', () => {
  it('separa statuses de mensagens no mesmo payload', () => {
    const r = interpretarPayload(
      envelope({
        metadata: {},
        statuses: [{ id: 'wamid.X', status: 'delivered', timestamp: '1786620000' }],
      }),
      AGORA,
    );
    expect(r.statuses).toHaveLength(1);
    expect(r.mensagens).toHaveLength(0);
    expect(r.statuses[0]!.status).toBe('delivered');
  });

  it('captura o erro quando status é failed', () => {
    const r = interpretarPayload(
      envelope({
        metadata: {},
        statuses: [{ id: 'w', status: 'failed', timestamp: '1786620000', errors: [{ code: 131026, title: 'Message undeliverable' }] }],
      }),
      AGORA,
    );
    expect(r.statuses[0]!.erro).toContain('131026');
    expect(r.statuses[0]!.erro).toContain('Message undeliverable');
  });
});

describe('camposDoStatus — aceite e entrega são eixos diferentes', () => {
  const base = (status: string, erro: string | null = null): StatusEntrega => ({
    waMessageId: 'w', status, timestamp: '2026-08-14T12:00:00.000Z', erro, raw: {},
  });

  it('delivered NÃO mexe em status', () => {
    const c = camposDoStatus(base('delivered'));
    expect(c.delivered_at).toBe('2026-08-14T12:00:00.000Z');
    expect(c).not.toHaveProperty('status');
  });

  it('read popula opened_at E delivered_at — a ordem dos webhooks não é garantida', () => {
    const c = camposDoStatus(base('read'));
    expect(c.opened_at).toBe('2026-08-14T12:00:00.000Z');
    // Sem isto, um `read` que chegue antes do `delivered` deixaria a mensagem
    // marcada como nunca entregue.
    expect(c.delivered_at).toBe('2026-08-14T12:00:00.000Z');
  });

  it('failed marca failed_at e o erro, sem apagar o aceite', () => {
    const c = camposDoStatus(base('failed', 'numero invalido (131026)'));
    expect(c.failed_at).toBe('2026-08-14T12:00:00.000Z');
    expect(c.error).toBe('numero invalido (131026)');
    // `status` continua sendo o aceite: "aceito e depois não chegou" é um estado
    // real e precisa ser representável.
    expect(c).not.toHaveProperty('status');
  });

  it('status desconhecido é guardado cru, sem virar NULL silencioso', () => {
    const c = camposDoStatus(base('warning'));
    expect(c.provider_status).toBe('warning');
    expect(c).not.toHaveProperty('delivered_at');
  });
});

describe('eventos de template — o veredito de categoria que muda depois', () => {
  function envelopeTpl(field: string, value: unknown) {
    return { entry: [{ id: '1401800048505109', changes: [{ field, value }] }] };
  }

  it('lê reclassificação de categoria (o flip que custa 6×)', () => {
    const r = interpretarPayload(
      envelopeTpl('message_template_category_update', {
        message_template_id: 123,
        message_template_name: 'pilula_semanal',
        message_template_language: 'pt_BR',
        previous_category: 'UTILITY',
        new_category: 'MARKETING',
      }),
      AGORA,
    );
    expect(r.templates).toHaveLength(1);
    const t = r.templates[0]!;
    expect(t.tipoEvento).toBe('category_update');
    expect(t.templateNome).toBe('pilula_semanal');
    expect(t.categoriaAnterior).toBe('UTILITY');
    expect(t.categoriaNova).toBe('MARKETING');
    expect(t.wabaId).toBe('1401800048505109');
    // NÃO pode cair no balde de ignorados — era lá que ia parar antes.
    expect(r.ignorados).toBe(0);
  });

  it('lê aprovação e rejeição, com o motivo', () => {
    const ok = interpretarPayload(
      envelopeTpl('message_template_status_update', {
        message_template_name: 'registro_evidencia', event: 'APPROVED', reason: 'NONE',
      }),
      AGORA,
    );
    expect(ok.templates[0]!.evento).toBe('APPROVED');
    // `reason: NONE` é ausência de motivo, não um motivo chamado "NONE".
    expect(ok.templates[0]!.motivo).toBeNull();

    const rej = interpretarPayload(
      envelopeTpl('message_template_status_update', {
        message_template_name: 'link_acesso', event: 'REJECTED', reason: 'INCORRECT_CATEGORY',
      }),
      AGORA,
    );
    expect(rej.templates[0]!.motivo).toBe('INCORRECT_CATEGORY');
  });

  it('aceita `correct_category`, usado quando a Meta reclassifica na aprovação', () => {
    const r = interpretarPayload(
      envelopeTpl('message_template_status_update', {
        message_template_name: 'missao_semana', event: 'APPROVED', correct_category: 'MARKETING',
      }),
      AGORA,
    );
    expect(r.templates[0]!.categoriaNova).toBe('MARKETING');
  });

  it('evento de template sem nome é ignorado e contado', () => {
    const r = interpretarPayload(
      envelopeTpl('message_template_category_update', { new_category: 'MARKETING' }),
      AGORA,
    );
    expect(r.templates).toHaveLength(0);
    expect(r.ignorados).toBe(1);
  });
});

describe('encareceu — só alarme que importa', () => {
  it('UTILITY → MARKETING encarece', () => {
    expect(encareceu('UTILITY', 'MARKETING')).toBe(true);
  });

  it('PENDING/null → MARKETING NÃO encarece — nunca houve preço bom a perder', () => {
    // Sem isto, o dia de submeter vários templates novos encheria o alarme de
    // ruído — justamente quando ele precisa ser lido.
    expect(encareceu(null, 'MARKETING')).toBe(false);
    expect(encareceu('MARKETING', 'MARKETING')).toBe(false);
  });

  it('MARKETING → UTILITY (melhora) não dispara alarme', () => {
    expect(encareceu('MARKETING', 'UTILITY')).toBe(false);
  });
});

describe('robustez — a inscrição do webhook não pode cair', () => {
  it.each([
    ['corpo vazio', {}],
    ['entry não-array', { entry: 'nada' }],
    ['changes ausente', { entry: [{ id: '1' }] }],
    ['value nulo', { entry: [{ changes: [{ value: null }] }] }],
    ['null', null],
    ['string', 'isto não é um evento'],
  ])('%s não lança', (_rotulo, body) => {
    expect(() => interpretarPayload(body as any, AGORA)).not.toThrow();
  });

  it('evento legítimo que não nos interessa é contado, não perdido', () => {
    // Ex.: mudança de qualidade do número — sem messages nem statuses.
    const r = interpretarPayload(
      envelope({ metadata: {}, event: 'PHONE_NUMBER_QUALITY_UPDATE', current_limit: 'TIER_1K' }),
      AGORA,
    );
    expect(r.mensagens).toHaveLength(0);
    expect(r.statuses).toHaveLength(0);
    expect(r.ignorados).toBe(1);
  });

  it('processa vários eventos no mesmo corpo', () => {
    const r = interpretarPayload(
      {
        entry: [
          { changes: [{ value: { metadata: {}, messages: [{ id: 'a', from: '1', type: 'text', timestamp: '1786620000', text: { body: 'x' } }] } }] },
          { changes: [{ value: { metadata: {}, statuses: [{ id: 'b', status: 'read', timestamp: '1786620000' }] } }] },
        ],
      },
      AGORA,
    );
    expect(r.mensagens).toHaveLength(1);
    expect(r.statuses).toHaveLength(1);
  });
});
