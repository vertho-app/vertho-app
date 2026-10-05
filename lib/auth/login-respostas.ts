/**
 * O que a tela de login faz com as respostas das portas de link.
 *
 * Puro e sem dependência de servidor: a tela é `'use client'`, e importar daqui
 * o `lib/rate-limit` levaria o cliente do Redis para o navegador.
 *
 * As rotas mandam um `codigo` estável junto com o texto em português. A tela
 * traduz pelo código; o texto fica como reserva para um bundle antigo.
 *
 * R-67 (04/10/2026): TODA falha das portas de login tem código, e a tela nunca
 * mostra o texto que veio da rota. Antes, "Falha ao gerar link: <mensagem do
 * Supabase em inglês>", "Erro: <exceção>" e "Não foi possível enviar o link de
 * acesso (email: ..., whatsapp: ...)" iam crus para a tela, em português ou
 * em inglês de fornecedor, qualquer que fosse o idioma da pessoa. O detalhe fica
 * no log do servidor.
 */

/** Teto de pedidos de link para o mesmo e-mail ou telefone (R-79). */
export const CODIGO_LIMITE_DESTINO = 'limite-destino';

/**
 * Pedido de link por WhatsApp feito no endereço genérico (`app.vertho.ai`) para
 * um número que está em DUAS ou mais organizações: a resposta traz `orgs` e a
 * tela pergunta em qual entrar (R-76).
 *
 * Não é erro, então não tem chave de tradução: quem monta a pergunta é a tela,
 * com os mesmos textos da escolha de organização do e-mail. Até 04/10/2026 este
 * pedido recebia 400 `sem-organizacao`, porque descobrir a organização pelo
 * número exigia ler o cadastro de todas as empresas.
 */
export const CODIGO_ESCOLHER_ORGANIZACAO = 'escolher-organizacao';

/** E-mail ausente ou sem forma de e-mail. */
export const CODIGO_EMAIL_INVALIDO = 'email-invalido';
/** WhatsApp fora do formato (DDD + número). */
export const CODIGO_TELEFONE_INVALIDO = 'telefone-invalido';
/** O link não pôde ser gerado ou nenhum canal o entregou. O motivo vai para o log. */
export const CODIGO_FALHA_NO_ENVIO = 'falha-no-envio';
/** O canal de WhatsApp não está disponível agora. */
export const CODIGO_CANAL_INDISPONIVEL = 'canal-indisponivel';
/** A consulta ao cadastro falhou. */
export const CODIGO_FALHA_AO_VERIFICAR = 'falha-ao-verificar';
/** Teto de pedidos por endereço (IP), o mesmo de todas as portas de acesso. */
export const CODIGO_LIMITE_DE_PEDIDOS = 'limite-de-pedidos';
/** Auto-cadastro indisponível: sem organização, empresa não encontrada ou não habilitado. */
export const CODIGO_CADASTRO_INDISPONIVEL = 'cadastro-indisponivel';
/** O e-mail já tem cadastro na organização. */
export const CODIGO_EMAIL_JA_CADASTRADO = 'email-ja-cadastrado';
/** Falta o nome completo no auto-cadastro. */
export const CODIGO_NOME_OBRIGATORIO = 'nome-obrigatorio';
/** O cadastro não pôde ser criado. */
export const CODIGO_FALHA_NO_CADASTRO = 'falha-no-cadastro';

const CHAVE_POR_CODIGO = {
  [CODIGO_LIMITE_DESTINO]: 'errors.tooManyLinks',
  [CODIGO_EMAIL_INVALIDO]: 'errors.invalidEmail',
  [CODIGO_TELEFONE_INVALIDO]: 'errors.invalidWhatsapp',
  [CODIGO_FALHA_NO_ENVIO]: 'errors.sendLink',
  [CODIGO_CANAL_INDISPONIVEL]: 'errors.whatsappUnavailable',
  [CODIGO_FALHA_AO_VERIFICAR]: 'errors.checkEmail',
  [CODIGO_LIMITE_DE_PEDIDOS]: 'errors.tooManyRequests',
  [CODIGO_CADASTRO_INDISPONIVEL]: 'errors.signupUnavailable',
  [CODIGO_EMAIL_JA_CADASTRADO]: 'errors.emailAlreadyRegistered',
  [CODIGO_NOME_OBRIGATORIO]: 'signup.errors.fullName',
  [CODIGO_FALHA_NO_CADASTRO]: 'errors.signupFailed',
} as const;

export type ChaveDeErroDoPedido = (typeof CHAVE_POR_CODIGO)[keyof typeof CHAVE_POR_CODIGO];

/** Todas as chaves que uma porta de acesso pode pedir à tela (o teste confere que existem nos 4 idiomas). */
export const CHAVES_DE_ERRO_DO_PEDIDO: readonly ChaveDeErroDoPedido[] = Object.values(CHAVE_POR_CODIGO);

/** Chave de tradução (namespace `Login`) para o erro, ou `null` se não há código conhecido. */
export function chaveDoErroDoPedido(resposta: unknown): ChaveDeErroDoPedido | null {
  const codigo = resposta && typeof resposta === 'object' ? (resposta as { codigo?: unknown }).codigo : null;
  if (typeof codigo !== 'string' || !Object.prototype.hasOwnProperty.call(CHAVE_POR_CODIGO, codigo)) return null;
  return CHAVE_POR_CODIGO[codigo as keyof typeof CHAVE_POR_CODIGO];
}

/**
 * A lista de organizações que o pedido por WhatsApp devolveu para a pessoa
 * escolher, ou `null` quando não há o que perguntar.
 *
 * Só vale com o código certo E com 2 ou mais itens bem formados: uma lista de 1
 * não é escolha, e a rota nunca a manda (revelaria onde a pessoa trabalha sem
 * necessidade). A tela não monta botão com item malformado, por isso um item
 * ruim derruba a lista inteira.
 */
export function organizacoesParaEscolher(resposta: unknown): Array<{ slug: string; nome: string }> | null {
  if (!resposta || typeof resposta !== 'object') return null;
  const r = resposta as { codigo?: unknown; orgs?: unknown };
  if (r.codigo !== CODIGO_ESCOLHER_ORGANIZACAO || !Array.isArray(r.orgs) || r.orgs.length < 2) return null;
  const lista: Array<{ slug: string; nome: string }> = [];
  for (const o of r.orgs) {
    const item = o as { slug?: unknown; nome?: unknown } | null;
    if (!item || typeof item.slug !== 'string' || !item.slug || typeof item.nome !== 'string' || !item.nome) return null;
    lista.push({ slug: item.slug, nome: item.nome });
  }
  return lista;
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
