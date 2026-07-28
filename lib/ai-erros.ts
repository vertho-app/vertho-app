/**
 * Classificação de erro de provedor de IA — predicados PUROS.
 *
 * Vivem aqui, e não em `actions/ai-client.ts`, porque aquele arquivo é `'use server'`:
 * todo export dele vira endpoint HTTP e **precisa ser async**. Exportar predicado
 * síncrono lá passa no `tsc` e **quebra no build** (foi o que aconteceu em 28/07).
 *
 * Ver F-E5 do `docs/FMEA-PIPELINE.md`.
 */

/** Texto que denuncia causa de FATURA (não de pico de tráfego). */
const PADRAO_BILLING = /credit balance|insufficient[_ ]quota|quota exceeded|billing|payment method|exceeded your current quota|plan limit|hard limit/i;

/**
 * CAP DE CONTA (billing/quota) — decisão de design do F-E5, tomada em 28/07/2026.
 *
 * Um cap NÃO é erro transitório: repetir não resolve e cair no fallback de provedor
 * seria **gastar em outra conta sem ninguém pedir**, escondendo justamente o problema
 * que precisa de ação humana (recarregar crédito, revisar billing). Então: sem retry,
 * sem fallback, e erro ETIQUETADO — porque antes ele subia como falha genérica de API e
 * quem lia o log não sabia que a causa era a fatura.
 *
 * O 429 fica FORA de propósito: é rate limit e o backoff resolve.
 */
export function isCapDeContaAIError(e: any): boolean {
  const s = e?.status ?? e?.statusCode;
  const m = String(e?.message || e || '');
  return (s === 400 || s === 402 || s === 403) && PADRAO_BILLING.test(m);
}

/**
 * 429 cuja causa é a fatura, não pico — ainda vale retry, mas o log não pode chamar de
 * "sobrecarga". Caso real (28/07): a Voyage devolveu 429 com "You have not yet added your
 * payment method… reduced rate limits of 3 RPM" — limite PERMANENTE por falta de pagamento,
 * indistinguível de pico no classificador antigo.
 */
export function isRateLimitPorBilling(e: any): boolean {
  const s = e?.status ?? e?.statusCode;
  return s === 429 && PADRAO_BILLING.test(String(e?.message || e || ''));
}
