/**
 * Os rótulos que as bibliotecas de relatório gravam no lugar de um cargo ou de uma
 * área vazios. Viram DADO (chave de agrupamento, nome de recorte) e chegam ao PDF
 * como texto: para o papel sair no idioma de quem lê, o PDF os reconhece por
 * IGUALDADE com estas constantes (`semDadoNoPdf`) e escreve o rótulo do idioma.
 *
 * A tela continua mostrando o texto em pt-BR, como sempre; este arquivo só dá um
 * nome único ao valor que antes era um literal repetido em quatro lugares.
 */
export const CARGO_NAO_INFORMADO = 'Cargo não informado';
export const AREA_NAO_INFORMADA = 'Sem área';

/** Traduz o rótulo de "sem dado" para o idioma do papel; qualquer outro valor (nome de cargo, de área) passa como veio. */
export function semDadoNoPdf(
  valor: string | null | undefined,
  t: (chave: string) => string,
): string {
  if (valor === CARGO_NAO_INFORMADO) return t('common.roleNotInformed');
  if (valor === AREA_NAO_INFORMADA) return t('common.areaNotInformed');
  return valor ?? '';
}
