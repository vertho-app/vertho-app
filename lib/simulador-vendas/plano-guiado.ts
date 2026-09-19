/**
 * Plano guiado (18/09/2026): seis perguntas, uma por comportamento de
 * Planejamento comercial (PL1 a PL6 da matriz PACE). Antes era um campo livre,
 * e com a regra de cobertura (nível a partir de 4 comportamentos observados) um
 * plano de duas linhas deixava a competência sem nível sem que a pessoa
 * soubesse o que faltava. O servidor continua recebendo UM texto: as respostas
 * com o título de cada pergunta, que é o que o avaliador cita.
 */
export const PERGUNTAS_PLANO = 6;
/** Mesmo mínimo da regra de cobertura: com menos, Planejamento fica sem nível. */
export const MINIMO_RESPOSTAS_PLANO = 4;
/** 6 x 900 + títulos cabe no limite de 6.000 caracteres do plano. */
export const MAXIMO_POR_RESPOSTA = 900;

const respondida = (texto: string) => texto.trim().length >= 3;

export const respostasValidas = (respostas: readonly string[]) =>
  respostas.filter(respondida).length;

export const respostasVazias = () => Array.from({ length: PERGUNTAS_PLANO }, () => '');

export function comporPlano(respostas: readonly string[], titulos: readonly string[]) {
  return respostas
    .map((texto, i) => ({ titulo: titulos[i], texto: texto.trim().slice(0, MAXIMO_POR_RESPOSTA) }))
    .filter((p) => respondida(p.texto))
    .map((p) => `${p.titulo}\n${p.texto}`)
    .join('\n\n');
}
