/**
 * Teto de INÍCIOS de treino por hora no simulador de vendas (V-8, 27/09/2026)
 * e o código que o 429 carrega. Vive fora de `lib/rate-limit.ts` porque a tela
 * também lê os dois (para traduzir a mensagem, R-110 de 03/10/2026), e importar
 * o limitador num componente de cliente levaria o Redis e o `next/server` para
 * o navegador.
 */
export const INICIOS_POR_HORA_VENDAS = 6;
export const CODIGO_LIMITE_INICIOS_VENDAS = 'inicios_por_hora';
