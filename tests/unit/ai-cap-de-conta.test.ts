import { describe, it, expect } from 'vitest';
import { isCapDeContaAIError, isRateLimitPorBilling } from '@/lib/ai-erros';

/**
 * F-E5 — decisão de 28/07/2026: cap de conta (billing/quota) NÃO cai no fallback de
 * provedor. Repetir não resolve, e trocar de provedor automaticamente gastaria em outra
 * conta sem ninguém pedir, escondendo a causa que precisa de ação humana. O que muda é
 * a ETIQUETA: antes o cap subia como falha genérica de API e o log não dizia "fatura".
 *
 * O 429 fica de fora do cap de propósito — é rate limit e o backoff resolve. Mas quando
 * o 429 tem texto de billing (caso real da Voyage em 28/07: "You have not yet added your
 * payment method… 3 RPM"), o log precisa dizer billing, não "sobrecarga".
 */
const erro = (status: number, message: string) => Object.assign(new Error(message), { status });

describe('F-E5 · cap de conta vs rate limit', () => {
  it('403 com "credit balance" é CAP', () => {
    expect(isCapDeContaAIError(erro(403, 'Your credit balance is too low to access the API'))).toBe(true);
  });

  it('400 com insufficient_quota é CAP', () => {
    expect(isCapDeContaAIError(erro(400, 'insufficient_quota: You exceeded your current quota'))).toBe(true);
  });

  it('402 com billing é CAP', () => {
    expect(isCapDeContaAIError(erro(402, 'billing required'))).toBe(true);
  });

  it('429 NÃO é cap (o backoff resolve) — mas é sinalizado como billing quando é a fatura', () => {
    const voyage = erro(429, 'You have not yet added your payment method and will have reduced rate limits of 3 RPM');
    expect(isCapDeContaAIError(voyage)).toBe(false);       // não bloqueia o retry
    expect(isRateLimitPorBilling(voyage)).toBe(true);      // mas aparece como billing no log
  });

  it('429 de pico NÃO é billing', () => {
    const pico = erro(429, 'rate_limit_error: too many requests');
    expect(isCapDeContaAIError(pico)).toBe(false);
    expect(isRateLimitPorBilling(pico)).toBe(false);
  });

  it('529/503 (sobrecarga do provedor) não é cap', () => {
    expect(isCapDeContaAIError(erro(529, 'overloaded_error'))).toBe(false);
    expect(isCapDeContaAIError(erro(503, 'temporarily unavailable'))).toBe(false);
  });

  it('erro de billing SEM status de cap não é cap (evita falso positivo por texto solto)', () => {
    // Ex.: 500 do provedor cuja mensagem por acaso menciona billing.
    expect(isCapDeContaAIError(erro(500, 'internal error in billing service'))).toBe(false);
  });

  it('400 comum (prompt inválido) não é cap', () => {
    expect(isCapDeContaAIError(erro(400, 'invalid_request_error: max_tokens too large'))).toBe(false);
  });
});
