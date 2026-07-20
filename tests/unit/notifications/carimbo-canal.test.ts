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
