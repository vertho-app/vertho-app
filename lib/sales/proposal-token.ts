import crypto from 'node:crypto';

/**
 * Token público do documento da proposta (`/proposta/[token]`).
 *
 * Compartilhado entre o fluxo do RC (`actions/sales/proposal-share.ts`) e o do
 * deal desk (`actions/sales/proposals-admin.ts`) de propósito: são 144 bits de
 * entropia que dão acesso a um documento comercial com preço. Duas cópias dessa
 * linha é exatamente o tipo de coisa que diverge em silêncio — um lado "otimiza"
 * o tamanho, o outro não, e a capacidade da URL cai sem ninguém decidir.
 */
export function novoTokenProposta(): string {
  return crypto.randomBytes(18).toString('base64url');
}
