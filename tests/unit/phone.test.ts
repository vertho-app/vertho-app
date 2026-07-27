import { describe, it, expect } from 'vitest';
import { normalizePhone, validateWhatsApp, metadataSaudavel } from '@/lib/phone';

/**
 * A metadata do libphonenumber é carregada EXPLICITAMENTE (não pelo subpath `/max`)
 * porque, sob o interop do tsx, ela chegava como `{ default: … }`, o parse lançava e
 * o catch devolvia `null` — todo telefone virava "inválido" em SILÊNCIO. Custou um
 * script de reenvio quebrado e, em 27/07, 36 falsos positivos no health-check, que
 * mandaria corrigir cadastros corretos.
 *
 * Este bloco é o canário: se a metadata voltar a chegar torta, ele falha antes que
 * alguém confie num "telefone inválido" que não é.
 */
describe('metadata do libphonenumber (canário do interop)', () => {
  it('carrega de verdade — countries.BR presente', () => {
    expect(metadataSaudavel()).toBe(true);
  });

  it('distingue DDI errado de número válido (caso real: 597=Suriname vs 55=BR)', () => {
    // Um dígito trocado no cadastro tirou uma pessoa do WhatsApp por 2 semanas.
    expect(normalizePhone('5574988079827')).toBe('5574988079827'); // BR, DDD 74
    expect(normalizePhone('5974988079827')).toBeNull();            // DDI 597
  });
});

describe('normalizePhone', () => {
  it('mantém tudo que o formato BR-only já aceitava (sem regressão)', () => {
    expect(normalizePhone('(11) 91234-5678')).toBe('5511912345678');
    expect(normalizePhone('11912345678')).toBe('5511912345678');
    expect(normalizePhone('+55 11 91234-5678')).toBe('5511912345678');
    expect(normalizePhone('5511912345678')).toBe('5511912345678');
    expect(normalizePhone('005511912345678')).toBe('5511912345678');
    expect(normalizePhone('011912345678')).toBe('5511912345678');
    expect(normalizePhone('1133334444')).toBe('551133334444'); // fixo BR
  });

  it('aceita E.164 internacional, com e sem "+"', () => {
    expect(normalizePhone('+351926360862')).toBe('351926360862'); // PT móvel
    expect(normalizePhone('351926360862')).toBe('351926360862');
    expect(normalizePhone('+351 926 360 862')).toBe('351926360862');
    expect(normalizePhone('00351926360862')).toBe('351926360862');
    expect(normalizePhone('+34 612 345 678')).toBe('34612345678'); // ES móvel
  });

  it('NÃO transforma número estrangeiro em brasileiro', () => {
    // O bug do formato antigo: 11 dígitos → prefixava 55 cegamente, e um celular
    // dos EUA virava "5512025550143" — um BR inexistente que passava validado.
    expect(normalizePhone('+12025550143')).toBe('12025550143');
    expect(normalizePhone('12025550143')).not.toBe('5512025550143');
  });

  it('rejeita o que não existe no plano de numeração', () => {
    expect(normalizePhone('5511912345')).toBeNull();  // curto demais p/ BR
    expect(normalizePhone('123')).toBeNull();
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone('abc')).toBeNull();
    expect(normalizePhone('99999999999999999999')).toBeNull();
  });
});

describe('validateWhatsApp', () => {
  it('aceita celular BR e devolve E.164 sem "+"', () => {
    const r = validateWhatsApp('11912345678');
    expect(r.valid).toBe(true);
    expect(r.valid && r.e164).toBe('5511912345678');
  });

  it('aceita celular português (o caso que motivou a mudança)', () => {
    const r = validateWhatsApp('+351926360862');
    expect(r.valid).toBe(true);
    expect(r.valid && r.e164).toBe('351926360862');
  });

  it('aceita número cujo país não separa fixo de móvel', () => {
    expect(validateWhatsApp('+12025550143').valid).toBe(true); // US: FIXED_LINE_OR_MOBILE
  });

  it('rejeita fixo quando o país permite distinguir', () => {
    const r = validateWhatsApp('+351212345678'); // PT fixo
    expect(r.valid).toBe(false);
    expect(r.valid === false && r.error).toMatch(/celular/i);
  });

  it('rejeita vazio e inválido com mensagem própria', () => {
    const vazio = validateWhatsApp('');
    expect(vazio.valid).toBe(false);
    expect(vazio.valid === false && vazio.error).toMatch(/obrigatório/i);

    const invalido = validateWhatsApp('5511812345678'); // BR sem o 9 do móvel
    expect(invalido.valid).toBe(false);
    expect(invalido.valid === false && invalido.error).toMatch(/inválido/i);
  });
});
