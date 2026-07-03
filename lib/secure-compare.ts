import { createHash, timingSafeEqual } from 'crypto';

/**
 * Comparação de segredos resistente a timing attack. Compara em tempo constante
 * — um `a !== b` de string vaza, pelo tempo, quantos caracteres iniciais batem,
 * o que permite recuperar o segredo byte a byte.
 *
 * Hasheia ambos para SHA-256 (comprimento fixo) antes do timingSafeEqual: evita
 * o throw por buffers de tamanho diferente E não vaza o comprimento do segredo.
 * Retorna false para entradas vazias/nulas.
 */
export function safeSecretEqual(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}
