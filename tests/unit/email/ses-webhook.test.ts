import { describe, expect, it } from 'vitest';
import { interpretarEventoSes, camposDoEventoSes } from '@/lib/email/ses-eventos';
import { urlDaAws, stringCanonica, verifySesWebhook } from '@/lib/email/sns-assinatura';

/**
 * Telemetria de entrega do e-mail.
 *
 * `Medido: 08/09/2026` — 1.255 e-mails em 30 dias, **zero** com registro de
 * entrega ou bounce: o Resend não devolvia id de mensagem e não havia webhook.
 * "Saiu" era tudo o que se sabia, e endereço errado sumia sem rastro (a pessoa
 * fica meses parecendo desengajada sem nunca ter recebido nada).
 *
 * As duas metades: o envio guarda o `MessageId` e o webhook carimba a linha
 * pelo mesmo id — o par que o WhatsApp já tem.
 */

const EVENTO_ENTREGA = {
  eventType: 'Delivery',
  mail: { messageId: 'msg-1', timestamp: '2026-09-08T11:00:00.000Z' },
  delivery: { timestamp: '2026-09-08T11:00:05.000Z' },
};

const EVENTO_BOUNCE = {
  eventType: 'Bounce',
  mail: { messageId: 'msg-2', timestamp: '2026-09-08T11:00:00.000Z' },
  bounce: {
    timestamp: '2026-09-08T11:00:07.000Z',
    bounceType: 'Permanent',
    bounceSubType: 'General',
    bouncedRecipients: [{ diagnosticCode: 'smtp; 550 5.1.1 user unknown' }],
  },
};

describe('eventos de entrega do SES', () => {
  it('lê a entrega e carimba o horário do provedor', () => {
    const e = interpretarEventoSes(EVENTO_ENTREGA)!;
    expect(e.messageId).toBe('msg-1');
    expect(camposDoEventoSes(e)).toMatchObject({
      provider_status: 'Delivery',
      delivered_at: '2026-09-08T11:00:05.000Z',
    });
  });

  it('🔴 bounce vira FALHA com o motivo legível, e é o ganho principal', () => {
    const e = interpretarEventoSes(EVENTO_BOUNCE)!;
    const campos = camposDoEventoSes(e);
    expect(campos.failed_at).toBe('2026-09-08T11:00:07.000Z');
    expect(String(campos.error)).toContain('Permanent');
    expect(String(campos.error)).toContain('550 5.1.1');
    // e NÃO marca entregue: o e-mail voltou
    expect(campos.delivered_at).toBeUndefined();
  });

  it('🔴 o aceite (`status`) NUNCA é tocado por evento de entrega', () => {
    // aceite e entrega são eixos diferentes; fundi-los foi o que fez
    // "155 enviados" virar 50 entregues no WhatsApp
    for (const bruto of [EVENTO_ENTREGA, EVENTO_BOUNCE]) {
      const campos = camposDoEventoSes(interpretarEventoSes(bruto)!);
      expect(campos).not.toHaveProperty('status');
    }
  });

  it('reclamação não é falha de entrega: chegou, e a pessoa marcou como spam', () => {
    const e = interpretarEventoSes({
      eventType: 'Complaint',
      mail: { messageId: 'msg-3' },
      complaint: { timestamp: '2026-09-08T12:00:00.000Z', complaintFeedbackType: 'abuse' },
    })!;
    const campos = camposDoEventoSes(e);
    expect(campos.provider_status).toBe('Complaint');
    expect(campos.failed_at).toBeUndefined();
    expect(campos.error).toBe('abuse');
  });

  it('abertura implica entrega — a ordem dos eventos não é garantida', () => {
    const e = interpretarEventoSes({
      eventType: 'Open', mail: { messageId: 'msg-4' }, open: { timestamp: '2026-09-08T13:00:00.000Z' },
    })!;
    const campos = camposDoEventoSes(e);
    expect(campos.opened_at).toBe('2026-09-08T13:00:00.000Z');
    expect(campos.delivered_at).toBe('2026-09-08T13:00:00.000Z');
  });

  it('aceita o formato antigo (`notificationType`), não só o event publishing', () => {
    // a escolha da origem no console da AWS não pode decidir se a métrica existe
    const e = interpretarEventoSes({ notificationType: 'Delivery', mail: { messageId: 'msg-5' }, delivery: {} });
    expect(e?.tipo).toBe('Delivery');
  });

  it('sem `mail.messageId` não há o que carimbar — devolve null em vez de adivinhar', () => {
    expect(interpretarEventoSes({ eventType: 'Delivery', mail: {} })).toBeNull();
    expect(interpretarEventoSes({ mail: { messageId: 'x' } })).toBeNull();
    expect(interpretarEventoSes('não é json')).toBeNull();
    expect(interpretarEventoSes(null)).toBeNull();
  });

  it('lê o `Message` como string, que é como o SNS entrega', () => {
    const e = interpretarEventoSes(JSON.stringify(EVENTO_ENTREGA));
    expect(e?.messageId).toBe('msg-1');
  });
});

describe('autenticação da mensagem SNS', () => {
  it('🔴 só aceita certificado servido pela AWS', () => {
    expect(urlDaAws('https://sns.sa-east-1.amazonaws.com/SimpleNotificationService-abc.pem')).toBe(true);
    // o elo que impede o atacante de servir o próprio certificado
    expect(urlDaAws('https://sns.sa-east-1.amazonaws.com.evil.com/x.pem')).toBe(false);
    expect(urlDaAws('http://sns.sa-east-1.amazonaws.com/x.pem')).toBe(false);
    expect(urlDaAws('https://evil.com/x.pem')).toBe(false);
    expect(urlDaAws('não é url')).toBe(false);
  });

  it('a string canônica segue os campos e a ordem do tipo', () => {
    const s = stringCanonica({
      Type: 'Notification', Message: 'm', MessageId: 'id', Timestamp: 't', TopicArn: 'arn', Signature: 'x',
    });
    // `Subject` ausente fica FORA (não entra vazio), e `Signature` não faz parte
    expect(s).toBe('Message\nm\nMessageId\nid\nTimestamp\nt\nTopicArn\narn\nType\nNotification\n');
  });

  it('🔴 recusa quando o TopicArn não é o esperado, mesmo com tudo o mais válido', async () => {
    const r = await verifySesWebhook(
      { Type: 'Notification', TopicArn: 'arn:aws:sns:sa-east-1:1:OUTRO', SigningCertURL: 'https://sns.sa-east-1.amazonaws.com/c.pem' },
      { topicArnEsperado: 'arn:aws:sns:sa-east-1:1:MEU' },
    );
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/TopicArn/);
  });

  it('🔴 sem TopicArn configurado o webhook fica MUDO, não permissivo', async () => {
    const r = await verifySesWebhook({ Type: 'Notification', TopicArn: 'qualquer' }, { topicArnEsperado: '' });
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/ausente/);
  });

  it('recusa certificado fora da AWS antes de baixar qualquer coisa', async () => {
    let baixou = false;
    const r = await verifySesWebhook(
      { Type: 'Notification', TopicArn: 'arn', SigningCertURL: 'https://evil.com/c.pem' },
      { topicArnEsperado: 'arn', buscar: (async () => { baixou = true; return new Response('x'); }) as any },
    );
    expect(r.ok).toBe(false);
    expect(baixou).toBe(false);
  });
});
