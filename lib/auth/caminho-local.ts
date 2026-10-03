/**
 * Destino depois do login: só CAMINHO LOCAL, nunca outro site.
 *
 * R-75 (revisão de 02/10/2026): `next` e `redirect` eram aceitos com
 * `startsWith('/')`, e `//dominio-externo` começa com uma barra. O navegador
 * lê `//x` como URL relativa ao PROTOCOLO, então `new URL('//x', origem)` e
 * `router.replace('//x')` levam a pessoa, recém-autenticada, para fora do
 * Vertho, com a cara de um passo do login. `/\x` é a mesma coisa: o parser de
 * URL trata a barra invertida como barra.
 *
 * A régua tem três partes, e cada uma fecha um caminho que a anterior deixa:
 *  1. começa com UMA barra, seguida de algo que não é barra nem barra invertida;
 *  2. nenhum caractere de controle nem espaço em lugar nenhum: o parser de URL
 *     APAGA tabulação e quebra de linha antes de interpretar, e `/\t/x` vira
 *     `//x` depois de passar pela checagem do item 1;
 *  3. resolvido contra uma origem fictícia, o resultado continua NELA. É a
 *     prova final, para qualquer forma que os dois itens acima não previram.
 *
 * Módulo puro: roda no servidor (`/auth/callback`) e na tela de login.
 */
const ORIGEM_DE_PROVA = 'https://destino.invalid';

export function ehCaminhoLocal(valor: unknown): valor is string {
  if (typeof valor !== 'string') return false;
  if (!/^\/(?![/\\])/.test(valor)) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000- \u007f]/.test(valor)) return false;
  try {
    return new URL(valor, ORIGEM_DE_PROVA).origin === ORIGEM_DE_PROVA;
  } catch {
    return false;
  }
}

/** O caminho pedido, se for local; senão o `padrao` (que é sempre local). */
export function caminhoLocalOu(valor: unknown, padrao = '/dashboard'): string {
  return ehCaminhoLocal(valor) ? valor : padrao;
}
