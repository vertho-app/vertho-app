// Eventos que a Meta ASSINA e o webhook ignorava — chegavam e sumiam.
//
// 🔴 Medido em 16/08/2026 com `GET /{app-id}/subscriptions`: a WABA assina 11
// campos. Três deles caíam em `ignorados` porque o parser só conhecia os de
// status/categoria de template:
//
//   message_template_quality_update → a Meta PAUSA o template cuja qualidade
//     despenca. O sintoma no produto é "ninguém recebeu", sem erro de envio.
//   account_alerts / account_review_update → avisos sobre a conta.
//
// E o de efeito mais amplo, `account_update`, NÃO está assinado: é por ele que
// chega a advertência por classificar marketing como utility. Depois dela,
// UTILITY→MARKETING vira INSTANTÂNEO e a escada termina recategorizando TODOS os
// UTILITY da WABA por 7-30 dias. O parser trata mesmo assim, para que assinar
// seja apertar um botão e não escrever código durante um incidente.
import { describe, it, expect } from 'vitest';
import { interpretarPayload } from '@/lib/whatsapp/cloud-webhook';

const envelope = (field: string, value: any) => ({
  entry: [{ id: '1401800048505109', changes: [{ field, value }] }],
});

describe('qualidade de template', () => {
  it('🔴 deixa de cair em `ignorados` e vira evento com o score novo', () => {
    const r = interpretarPayload(envelope('message_template_quality_update', {
      message_template_id: 123,
      message_template_name: 'conteudo_semana',
      message_template_language: 'pt_BR',
      previous_quality_score: 'GREEN',
      new_quality_score: 'RED',
    }));
    expect(r.ignorados).toBe(0);
    expect(r.templates).toHaveLength(1);
    expect(r.templates[0].tipoEvento).toBe('quality_update');
    expect(r.templates[0].templateNome).toBe('conteudo_semana');
    // `quality_update` não traz `event`: o que aconteceu é o score novo.
    expect(r.templates[0].evento).toBe('RED');
  });

  it('não se confunde com mudança de status', () => {
    const r = interpretarPayload(envelope('message_template_status_update', {
      message_template_name: 'trilha_concluida', event: 'APPROVED',
    }));
    expect(r.templates[0].tipoEvento).toBe('status_update');
    expect(r.templates[0].evento).toBe('APPROVED');
  });
});

describe('advertência e punição na conta', () => {
  it('🔴 advertência é capturada — e ela NÃO traz restriction_info', () => {
    // A doc é explícita: `restriction_info` é omitido em advertência e em
    // recuperação. Lista vazia aqui é informação, não lacuna.
    const r = interpretarPayload(envelope('account_update', {
      event: 'ACCOUNT_RESTRICTION',
      violation_info: { violation_type: 'UTILITY_TEMPLATE_ABUSE' },
    }));
    expect(r.ignorados).toBe(0);
    expect(r.avisosConta).toHaveLength(1);
    expect(r.avisosConta[0].violacao).toBe('UTILITY_TEMPLATE_ABUSE');
    expect(r.avisosConta[0].restricoes).toEqual([]);
  });

  it('🔴 punição ATIVA traz o tipo de restrição', () => {
    const r = interpretarPayload(envelope('account_update', {
      event: 'ACCOUNT_RESTRICTION',
      violation_info: { violation_type: 'UTILITY_TEMPLATE_ABUSE' },
      restriction_info: [
        { restriction_type: 'RESTRICTED_UTILITY_TEMPLATES', expiration: '1786845982' },
      ],
    }));
    expect(r.avisosConta[0].restricoes).toEqual(['RESTRICTED_UTILITY_TEMPLATES']);
  });

  it('`account_alerts` (já assinado) também é capturado, com a descrição', () => {
    const r = interpretarPayload(envelope('account_alerts', {
      alert_severity: 'WARNING',
      alert_type: 'TEMPLATE_CATEGORY',
      alert_description: 'Sua conta foi advertida.',
    }));
    expect(r.avisosConta).toHaveLength(1);
    expect(r.avisosConta[0].descricao).toBe('Sua conta foi advertida.');
  });

  it('🔴 aviso de conta NÃO é descartado por não ter nome de template', () => {
    // Era essa a armadilha: o ramo de template descarta `!nome` em `ignorados`.
    // Se `account_*` caísse lá, a advertência sumiria exatamente como antes.
    const r = interpretarPayload(envelope('account_update', { event: 'ACCOUNT_RESTRICTION' }));
    expect(r.ignorados).toBe(0);
    expect(r.avisosConta).toHaveLength(1);
    expect(r.templates).toEqual([]);
  });
});

describe('o que continua sendo ignorado', () => {
  it('campo desconhecido ainda conta como ignorado — não vira aviso falso', () => {
    const r = interpretarPayload(envelope('phone_number_name_update', { display_name: 'x' }));
    expect(r.avisosConta).toEqual([]);
    expect(r.templates).toEqual([]);
    expect(r.ignorados).toBe(1);
  });
});
