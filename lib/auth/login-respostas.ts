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

/**
 * Pedido de link por WhatsApp feito no endereço genérico (`app.vertho.ai`), que
 * não tem organização (R-76). Depende só do ENDEREÇO, nunca do número: dizer
 * isso não revela se o telefone está cadastrado.
 */
export const CODIGO_SEM_ORGANIZACAO = 'sem-organizacao';

export type ChaveDeErroDoPedido = 'errors.tooManyLinks' | 'errors.whatsappNeedsOrganization';

/** Chave de tradução (namespace `Login`) para o erro, ou `null` se não há código conhecido. */
export function chaveDoErroDoPedido(resposta: unknown): ChaveDeErroDoPedido | null {
  const codigo = resposta && typeof resposta === 'object' ? (resposta as { codigo?: unknown }).codigo : null;
  if (codigo === CODIGO_LIMITE_DESTINO) return 'errors.tooManyLinks';
  if (codigo === CODIGO_SEM_ORGANIZACAO) return 'errors.whatsappNeedsOrganization';
  return null;
}

/**
 * O que a tela pode AFIRMAR depois de um pedido de link aceito (R-76).
 *
 * Até 03/10/2026 ela dizia "Link enviado!" em todo caso, inclusive quando nada
 * saiu: a porta do WhatsApp responde igual para número cadastrado e não
 * cadastrado (anti-enumeração), e no endereço genérico a do e-mail também,
 * porque lá o check-email diz "existe" para qualquer e-mail. A frase afirmava
 * um envio que a tela não tinha como saber.
 *
 * - `enviado`: a tela sabe que o cadastro existe (o check-email respondeu de
 *   verdade no endereço da organização, ou a pessoa escolheu a organização na
 *   lista que veio do cadastro) e a rota só responde sucesso se algum canal saiu.
 * - `se-cadastrado-*`: a resposta é a mesma para quem existe e quem não existe,
 *   então a tela fala no condicional.
 */
export type ConfirmacaoDoEnvio = 'enviado' | 'se-cadastrado-email' | 'se-cadastrado-whatsapp';

export function confirmacaoDoEnvio(canal: 'email' | 'whatsapp', cadastroConfirmado: boolean): ConfirmacaoDoEnvio {
  if (canal === 'whatsapp') return 'se-cadastrado-whatsapp';
  return cadastroConfirmado ? 'enviado' : 'se-cadastrado-email';
}

/**
 * O auto-cadastro deu certo, mas o link saiu? A rota responde `success: true`
 * com `warning` quando o cadastro foi criado e nenhum canal enviou (R-76). A
 * tela mostrava "Link enviado!" mesmo assim.
 */
export function cadastroSemLink(resposta: unknown): boolean {
  if (!resposta || typeof resposta !== 'object') return false;
  const r = resposta as { success?: unknown; warning?: unknown };
  return r.success === true && typeof r.warning === 'string' && r.warning.length > 0;
}
