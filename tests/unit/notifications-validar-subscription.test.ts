// Forma da subscription antes de gravar (lib/notifications/validar-subscription.ts).
// Sem isto, uma subscription malformada só falharia no ENVIO — longe da causa, e
// o sintoma seria "push não funciona para essa pessoa".
import { describe, expect, it } from 'vitest';
import { validarSubscription } from '@/lib/notifications/validar-subscription';

const valida = {
  endpoint: 'https://web.push.apple.com/abc',
  keys: { p256dh: 'p', auth: 'a' },
};

describe('validarSubscription', () => {
  it('subscription real → ok', () => {
    expect(validarSubscription(valida).ok).toBe(true);
  });

  it('rejeita endpoint não-https', () => {
    expect(validarSubscription({ ...valida, endpoint: 'http://x/y' }).ok).toBe(false);
  });

  it('rejeita esquema exótico (javascript:, data:)', () => {
    expect(validarSubscription({ ...valida, endpoint: 'javascript:alert(1)' }).ok).toBe(false);
    expect(validarSubscription({ ...valida, endpoint: 'data:text/plain,x' }).ok).toBe(false);
  });

  it('rejeita URL inválida', () => {
    expect(validarSubscription({ ...valida, endpoint: 'nao-e-url' }).ok).toBe(false);
  });

  it('rejeita endpoint gigante (JSONB não é depósito)', () => {
    expect(validarSubscription({ ...valida, endpoint: 'https://x/' + 'a'.repeat(3000) }).ok).toBe(false);
  });

  it('rejeita chaves ausentes ou fora de tamanho', () => {
    expect(validarSubscription({ endpoint: valida.endpoint }).ok).toBe(false);
    expect(validarSubscription({ ...valida, keys: { p256dh: 'p', auth: '' } }).ok).toBe(false);
    expect(validarSubscription({ ...valida, keys: { p256dh: 'x'.repeat(300), auth: 'a' } }).ok).toBe(false);
  });

  it('rejeita entrada não-objeto sem lançar', () => {
    for (const v of [null, undefined, 'x', 42, []]) {
      expect(validarSubscription(v).ok).toBe(false);
    }
  });
});
