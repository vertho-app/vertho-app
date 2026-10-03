/**
 * Gravação de tela (Sentry Replay) da degustação versão C.
 *
 * Puro e sem `server-only`: o navegador (que grava) e o painel (que procura a
 * gravação de um lead) precisam derivar a MESMA etiqueta e aplicar a MESMA
 * redação de URL.
 *
 * 🔴 DUAS REGRAS, ambas porque o Sentry é um terceiro:
 *
 * 1. A etiqueta de busca é um HASH do código do convite, nunca o código. O código
 *    do link curto (`/c/<código>`) é credencial do convite: quem o tem abre a
 *    página e cria a sessão do lead. Nome, e-mail e o próprio código ficam fora
 *    das tags. O hash dá a ponte (a mesma etiqueta no início e na sala, e no
 *    cartão do painel) sem entregar a chave.
 *
 * 2. URL de gravação não leva credencial. O ticket da sala (`sala`), o código de
 *    volta (`volta`) e o passe viajam em query ou no caminho `/c/<código>`, e a
 *    gravação registra navegações. A redação cobre o que passa pelo gancho de
 *    gravação (breadcrumbs e spans de navegação); a lista de URLs do resumo da
 *    gravação não passa por ele (limite conhecido, ver `docs/AMBIENTE-DEMO.md`).
 */

/** Prefixo do que entra no hash: separa esta etiqueta de qualquer outro uso do código. */
export const GRAVACAO_PREFIXO_DA_ETIQUETA = 'degustacao:';
/** Hex de 12 caracteres: curto para colar na busca, longo para não colidir entre leads. */
export const GRAVACAO_TAMANHO_DA_ETIQUETA = 12;
/** Nome da tag no Sentry. */
export const GRAVACAO_TAG = 'demo_chave';

export function entradaDaEtiqueta(codigo: string): string {
  return `${GRAVACAO_PREFIXO_DA_ETIQUETA}${codigo}`;
}

/** Parâmetros de query que carregam credencial do convite ou da sala. */
const PARAMETROS_COM_CREDENCIAL = ['sala', 'volta', 'ticket', 'passe'] as const;

/**
 * Troca o valor das credenciais por `x`, em URL absoluta, relativa ou fragmento
 * de texto. Regex sobre o TEXTO de propósito: o gancho recebe string solta
 * (descrição de span, `from`/`to` de navegação), nem sempre uma URL inteira.
 */
export function redigirUrlDaGravacao(texto: string): string {
  const comParametros = new RegExp(`([?&](?:${PARAMETROS_COM_CREDENCIAL.join('|')})=)[^&#\\s]*`, 'gi');
  return String(texto)
    .replace(comParametros, '$1x')
    .replace(/(\/c\/)[A-Za-z0-9_-]{24}(?![A-Za-z0-9_-])/g, '$1x');
}
