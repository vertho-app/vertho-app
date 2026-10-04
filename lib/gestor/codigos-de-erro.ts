/**
 * Os erros das telas e ações do gestor e do RH, por CÓDIGO (R-67, 04/10/2026).
 *
 * Até aqui as actions devolviam `{ error: 'Não autenticado' }` e a tela mostrava o texto: em
 * português para qualquer idioma, e às vezes a mensagem crua do Supabase (em inglês). Agora a
 * action devolve só um `codigo` estável e a tela o traduz no idioma da pessoa, pelo namespace
 * `ManagerErrors`. O detalhe técnico vai para o log do servidor, nunca para a resposta. O desenho
 * é o do login (`lib/auth/login-respostas.ts` + `Login.errors`).
 *
 * Puro e sem dependência de servidor: o `'use client'` importa daqui, e os `'use server'` também.
 * Fora de `'use server'` de propósito: export de arquivo `'use server'` vira endpoint.
 */

/** Sem sessão válida. */
export const CODIGO_NAO_AUTENTICADO = 'nao-autenticado';
/** Papel sem acesso à informação (não é gestor nem RH, ou não é o RH da empresa). */
export const CODIGO_SEM_PERMISSAO = 'sem-permissao';
/** Identificador de pessoa ausente ou com forma inválida. */
export const CODIGO_PESSOA_INVALIDA = 'pessoa-invalida';
/** A pessoa pedida não existe (ou é de outra empresa: a mesma resposta, para não revelar). */
export const CODIGO_PESSOA_NAO_ENCONTRADA = 'pessoa-nao-encontrada';
/** A pessoa existe mas não está no escopo de quem pede. */
export const CODIGO_FORA_DO_ESCOPO = 'fora-do-escopo';
/** O acesso não tem empresa ligada. */
export const CODIGO_SEM_EMPRESA = 'sem-empresa';
/** A pessoa não tem o PDF do mapeamento carregado. */
export const CODIGO_SEM_PDF = 'sem-pdf';
/** A pessoa abre o PRÓPRIO PDF do mapeamento e a empresa ainda não o carregou. */
export const CODIGO_SEM_PDF_PROPRIO = 'sem-pdf-proprio';
/** O link do PDF não pôde ser gerado. */
export const CODIGO_FALHA_NO_PDF = 'falha-no-pdf';
/** A jornada pedida não existe (ou é de outra empresa). */
export const CODIGO_JORNADA_NAO_ENCONTRADA = 'jornada-nao-encontrada';
/** A semana não é de checkpoint no programa desta jornada. */
export const CODIGO_SEMANA_INVALIDA = 'semana-invalida';
/** Avaliação fora do conjunto aceito. */
export const CODIGO_AVALIACAO_INVALIDA = 'avaliacao-invalida';
/** A leitura que alimenta a tela falhou (R-139): não é "vazio", é "tente de novo". */
export const CODIGO_LEITURA_INDISPONIVEL = 'leitura-indisponivel';
/** Outra falha de leitura. O motivo vai para o log. */
export const CODIGO_FALHA_AO_CARREGAR = 'falha-ao-carregar';
/** A gravação falhou. O motivo vai para o log. */
export const CODIGO_FALHA_AO_SALVAR = 'falha-ao-salvar';

const CHAVE_POR_CODIGO = {
  [CODIGO_NAO_AUTENTICADO]: 'notAuthenticated',
  [CODIGO_SEM_PERMISSAO]: 'noPermission',
  [CODIGO_PESSOA_INVALIDA]: 'personInvalid',
  [CODIGO_PESSOA_NAO_ENCONTRADA]: 'personNotFound',
  [CODIGO_FORA_DO_ESCOPO]: 'outOfScope',
  [CODIGO_SEM_EMPRESA]: 'noCompany',
  [CODIGO_SEM_PDF]: 'noPdf',
  [CODIGO_SEM_PDF_PROPRIO]: 'noOwnPdf',
  [CODIGO_FALHA_NO_PDF]: 'pdfFailed',
  [CODIGO_JORNADA_NAO_ENCONTRADA]: 'journeyNotFound',
  [CODIGO_SEMANA_INVALIDA]: 'invalidWeek',
  [CODIGO_AVALIACAO_INVALIDA]: 'invalidEvaluation',
  [CODIGO_LEITURA_INDISPONIVEL]: 'loadFailed',
  [CODIGO_FALHA_AO_CARREGAR]: 'loadFailed',
  [CODIGO_FALHA_AO_SALVAR]: 'saveFailed',
} as const;

export type CodigoErroDoGestor = keyof typeof CHAVE_POR_CODIGO;
export type ChaveDeErroDoGestor = (typeof CHAVE_POR_CODIGO)[CodigoErroDoGestor] | 'generic';

/** Todas as chaves que uma action do gestor pode pedir à tela (o teste confere que existem nos 4 idiomas). */
export const CHAVES_DE_ERRO_DO_GESTOR: readonly ChaveDeErroDoGestor[] = [...new Set([...Object.values(CHAVE_POR_CODIGO), 'generic' as const])];

/** Todos os códigos (o teste confere que cada um tem chave e que a chave existe nos 4 idiomas). */
export const CODIGOS_DE_ERRO_DO_GESTOR = Object.keys(CHAVE_POR_CODIGO) as CodigoErroDoGestor[];

/**
 * Chave (namespace `ManagerErrors`) do erro de uma resposta de action, ou `null` se a resposta não
 * traz código conhecido. Resposta sem código conhecido cai na frase genérica, nunca no texto da
 * action (o texto de um bundle antigo seria em português e, às vezes, detalhe de fornecedor).
 */
export function chaveDoErroDoGestor(resposta: unknown): ChaveDeErroDoGestor | null {
  const codigo = resposta && typeof resposta === 'object' ? (resposta as { codigo?: unknown }).codigo : null;
  if (typeof codigo !== 'string' || !Object.prototype.hasOwnProperty.call(CHAVE_POR_CODIGO, codigo)) return null;
  return CHAVE_POR_CODIGO[codigo as CodigoErroDoGestor];
}

/**
 * O texto do erro no idioma da tela. `t` é o `useTranslations('ManagerErrors')`: uma resposta sem
 * código conhecido vira `generic`.
 */
export function textoDoErroDoGestor(t: (chave: ChaveDeErroDoGestor) => string, resposta: unknown): string {
  return t(chaveDoErroDoGestor(resposta) ?? 'generic');
}
