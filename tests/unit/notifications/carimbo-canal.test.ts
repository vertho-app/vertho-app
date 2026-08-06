import { describe, it, expect } from 'vitest';
import { mesmoDiaUTC, canalPendente, pilulaPendente } from '@/lib/notifications/carimbo-canal';

const HOJE = '2026-07-20';
const ONTEM_TS = '2026-07-19T11:01:00.000Z';
const HOJE_TS = '2026-07-20T11:01:00.000Z';

describe('mesmoDiaUTC', () => {
  it('reconhece carimbo de hoje e rejeita o de ontem', () => {
    expect(mesmoDiaUTC(HOJE_TS, HOJE)).toBe(true);
    expect(mesmoDiaUTC(ONTEM_TS, HOJE)).toBe(false);
  });

  it('trata ausência de carimbo como "não é de hoje"', () => {
    expect(mesmoDiaUTC(null, HOJE)).toBe(false);
    expect(mesmoDiaUTC(undefined, HOJE)).toBe(false);
  });
});

describe('canalPendente', () => {
  it('pende quando o canal é aplicável e não saiu hoje', () => {
    expect(canalPendente(true, null, HOJE)).toBe(true);
    expect(canalPendente(true, ONTEM_TS, HOJE)).toBe(true);
  });

  it('não pende depois de carimbado hoje', () => {
    expect(canalPendente(true, HOJE_TS, HOJE)).toBe(false);
  });

  it('canal inaplicável nunca pende (colab sem telefone não trava a pílula)', () => {
    expect(canalPendente(false, null, HOJE)).toBe(false);
  });
});

describe('pilulaPendente', () => {
  const base = { temTelefone: true, temEmail: true, hojeUTC: HOJE };

  it('REGRESSÃO 20/07/2026: e-mail entregue + WhatsApp falho ainda pende', () => {
    // O bug: o carimbo único `ultima_pilula1_em` já existia (o e-mail saiu) e
    // fechava o gate, impedindo a recuperação exatamente do canal que faltou.
    expect(pilulaPendente({ ...base, carimboWhatsapp: null, carimboEmail: HOJE_TS })).toBe(true);
  });

  it('não pende quando os dois canais saíram hoje', () => {
    expect(pilulaPendente({ ...base, carimboWhatsapp: HOJE_TS, carimboEmail: HOJE_TS })).toBe(false);
  });

  it('pende quando nada saiu (queda total do provedor)', () => {
    expect(pilulaPendente({ ...base, carimboWhatsapp: null, carimboEmail: null })).toBe(true);
  });

  it('só e-mail aplicável: basta o e-mail de hoje para fechar', () => {
    expect(pilulaPendente({
      temTelefone: false, temEmail: true, carimboWhatsapp: null, carimboEmail: HOJE_TS, hojeUTC: HOJE,
    })).toBe(false);
  });

  it('sem telefone e sem e-mail não pende (nada a fazer)', () => {
    expect(pilulaPendente({
      temTelefone: false, temEmail: false, carimboWhatsapp: null, carimboEmail: null, hojeUTC: HOJE,
    })).toBe(false);
  });

  it('carimbo de ontem não conta para hoje (nova semana reabre o ciclo)', () => {
    expect(pilulaPendente({ ...base, carimboWhatsapp: ONTEM_TS, carimboEmail: ONTEM_TS })).toBe(true);
  });
});

// ── PUSH como TERCEIRO canal (mig 202) ──────────────────────────────────────
// Push é canal de primeira classe: se ele falhou e os outros dois saíram, a
// pílula segue pendente e o push é recuperável. Tratá-lo como penduricalho
// reintroduziria, para o canal novo, o bug que este módulo consertou.
describe('pilulaPendente — canal push', () => {
  const base = { temTelefone: true, temEmail: true, hojeUTC: HOJE };

  it('whatsapp e e-mail saíram, push NÃO: ainda pende', () => {
    expect(pilulaPendente({
      ...base, temPush: true,
      carimboWhatsapp: HOJE_TS, carimboEmail: HOJE_TS, carimboPush: null,
    })).toBe(true);
  });

  it('os três saíram hoje: não pende', () => {
    expect(pilulaPendente({
      ...base, temPush: true,
      carimboWhatsapp: HOJE_TS, carimboEmail: HOJE_TS, carimboPush: HOJE_TS,
    })).toBe(false);
  });

  it('quem NÃO tem push não pende por causa dele', () => {
    // Sem esta regra, todo colaborador sem inscrição manteria a pílula
    // eternamente "em aberto" — o mesmo erro de canal inaplicável que o
    // `canalPendente` já evita para telefone/e-mail.
    expect(pilulaPendente({
      ...base, temPush: false,
      carimboWhatsapp: HOJE_TS, carimboEmail: HOJE_TS, carimboPush: null,
    })).toBe(false);
  });

  it('push de ontem não conta para hoje', () => {
    expect(pilulaPendente({
      ...base, temPush: true,
      carimboWhatsapp: HOJE_TS, carimboEmail: HOJE_TS, carimboPush: ONTEM_TS,
    })).toBe(true);
  });

  it('chamada legada (sem os campos de push) continua funcionando', () => {
    // Compatibilidade: os campos são opcionais de propósito — call sites que
    // ainda não conhecem push não podem passar a pender para sempre.
    expect(pilulaPendente({
      ...base, carimboWhatsapp: HOJE_TS, carimboEmail: HOJE_TS,
    })).toBe(false);
  });
});
