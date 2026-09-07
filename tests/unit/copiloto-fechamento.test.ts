import { describe, expect, it } from 'vitest';
import {
  normalizarDataDeAcao,
  normalizarFechamento,
  normalizarFollowUp,
  normalizarSugestaoCrm,
  temSugestao,
} from '@/lib/copiloto/fechamento';

const HOJE = new Date('2026-09-07T15:00:00Z');

describe('estágio proposto pela conversa', () => {
  it('propõe o avanço quando a conversa sustenta', () => {
    const s = normalizarSugestaoCrm(
      { estagio: 'negociacao', estagio_motivo: 'Discutiram preço e prazo.' },
      'proposta_enviada', HOJE,
    );
    expect(s.stage).toBe('negociacao');
    expect(s.stageReason).toContain('preço');
  });

  it('nunca carimba receita: ganho, perdido e expirado não saem de uma reunião', () => {
    for (const estagio of ['fechado_ganho', 'fechado_perdido', 'sem_avanco_expirado']) {
      expect(normalizarSugestaoCrm({ estagio }, 'negociacao', HOJE).stage).toBeNull();
    }
  });

  it('nem os que dependem de ato administrativo', () => {
    expect(normalizarSugestaoCrm({ estagio: 'contrato_enviado' }, 'negociacao', HOJE).stage).toBeNull();
    expect(normalizarSugestaoCrm({ estagio: 'aguardando_aceite_vertho' }, 'negociacao', HOJE).stage).toBeNull();
  });

  it('não anda para trás nem repete o estágio atual', () => {
    expect(normalizarSugestaoCrm({ estagio: 'contato_iniciado' }, 'proposta_enviada', HOJE).stage).toBeNull();
    expect(normalizarSugestaoCrm({ estagio: 'proposta_enviada' }, 'proposta_enviada', HOJE).stage).toBeNull();
  });

  it('estágio inventado não passa', () => {
    expect(normalizarSugestaoCrm({ estagio: 'quase_fechando' }, 'contato_iniciado', HOJE).stage).toBeNull();
  });

  it('sem oportunidade ligada, ainda propõe (o vendedor escolhe onde aplicar)', () => {
    expect(normalizarSugestaoCrm({ estagio: 'negociacao' }, null, HOJE).stage).toBe('negociacao');
  });

  it('o motivo só existe quando o estágio existe', () => {
    const s = normalizarSugestaoCrm({ estagio: 'fechado_ganho', estagio_motivo: 'ele disse sim' }, 'negociacao', HOJE);
    expect(s.stageReason).toBe('');
  });
});

describe('data da próxima ação', () => {
  it('aceita data futura próxima', () => {
    expect(normalizarDataDeAcao('2026-09-11', HOJE)).toBe('2026-09-11');
    expect(normalizarDataDeAcao('2026-09-07', HOJE)).toBe('2026-09-07');
  });

  it('recusa data passada: o alerta de ação vencida nasceria disparado', () => {
    expect(normalizarDataDeAcao('2026-09-06', HOJE)).toBeNull();
    expect(normalizarDataDeAcao('2025-01-10', HOJE)).toBeNull();
  });

  it('recusa data absurda no futuro (erro de ano do modelo)', () => {
    expect(normalizarDataDeAcao('2027-09-11', HOJE)).toBeNull();
  });

  it('recusa o que não é data ISO curta', () => {
    expect(normalizarDataDeAcao('sexta-feira', HOJE)).toBeNull();
    expect(normalizarDataDeAcao('11/09/2026', HOJE)).toBeNull();
    expect(normalizarDataDeAcao(null, HOJE)).toBeNull();
  });
});

describe('follow-up e fechamento', () => {
  it('lê a minuta dos dois canais', () => {
    const f = normalizarFollowUp({
      whatsapp: 'Oi Maria, obrigado pela conversa.',
      email: { assunto: 'Piloto de 3 cargos', corpo: 'Conforme combinamos...' },
    });
    expect(f.whatsapp).toContain('Maria');
    expect(f.email.subject).toBe('Piloto de 3 cargos');
    expect(f.email.body).toContain('combinamos');
  });

  it('resposta vazia não vira minuta inventada', () => {
    const f = normalizarFollowUp(null);
    expect(f).toEqual({ whatsapp: '', email: { subject: '', body: '' } });
  });

  it('quando nada é proposto, a tela sabe que não há o que decidir', () => {
    const vazio = normalizarFechamento({}, 'negociacao', HOJE);
    expect(temSugestao(vazio)).toBe(false);
  });

  it('uma próxima ação já é motivo para mostrar o bloco', () => {
    const f = normalizarFechamento({ crm: { proxima_acao: 'Enviar recorte do piloto' } }, 'negociacao', HOJE);
    expect(temSugestao(f)).toBe(true);
    expect(f.crm.nextAction).toBe('Enviar recorte do piloto');
  });
});
