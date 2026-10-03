/**
 * O que a tela de login faz com as respostas das portas de link.
 *
 * Puro e sem dependência de servidor: a tela é `'use client'`, e importar daqui
 * o `lib/rate-limit` levaria o cliente do Redis para o navegador.
 *
 * As rotas mandam um `codigo` estável junto com o texto em português. A tela
 * traduz pelo código; o texto fica como reserva para um bundle antigo.
 */

/** Teto de pedidos de link para o mesmo e-mail ou telefone (R-79). */
export const CODIGO_LIMITE_DESTINO = 'limite-destino';

export type ChaveDeErroDoPedido = 'errors.tooManyLinks';

/** Chave de tradução (namespace `Login`) para o erro, ou `null` se não há código conhecido. */
export function chaveDoErroDoPedido(resposta: unknown): ChaveDeErroDoPedido | null {
  const codigo = resposta && typeof resposta === 'object' ? (resposta as { codigo?: unknown }).codigo : null;
  if (codigo === CODIGO_LIMITE_DESTINO) return 'errors.tooManyLinks';
  return null;
}
