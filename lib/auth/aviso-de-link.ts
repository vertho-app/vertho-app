/**
 * Que aviso a tela de login mostra quando uma porta de link devolve `?error=`.
 *
 * Puro e sem dependência de servidor: a tela é `'use client'`.
 *
 * R-103 (04/10/2026): o lead da degustação cuja experiência expirou caía no login
 * com "Peça um novo abaixo: ele chega no seu WhatsApp ou e-mail". Ele não tem como:
 * a conta dele é técnica e aleatória, e o link novo só quem o convidou emite. Os
 * dois códigos abaixo só saem das portas da DEGUSTAÇÃO (`/auth/degustacao` e o
 * `/auth/callback` de convidado vencido), então a mensagem própria não afeta
 * nenhum usuário comum.
 */

/** Códigos que só as portas da degustação emitem (convite vencido ou inválido). */
export const CODIGOS_DE_CONVITE_DA_DEGUSTACAO = ['convite-expirado', 'convite-invalido'] as const;

export type ChaveDoAvisoDeLink = 'linkErrors.unavailable' | 'linkErrors.guestExpired' | 'linkErrors.expired';

export function chaveDoAvisoDeLink(codigo: string): ChaveDoAvisoDeLink {
  if (codigo === 'indisponivel' || codigo === 'apresentacao-indisponivel') return 'linkErrors.unavailable';
  if ((CODIGOS_DE_CONVITE_DA_DEGUSTACAO as readonly string[]).includes(codigo)) return 'linkErrors.guestExpired';
  return 'linkErrors.expired';
}
