import { nivelDaNota, type Nivel } from '@/lib/nivel-regua';

/**
 * Nível (N1 a N4) de uma nota que veio de um relatório gravado, ou `null` quando a
 * nota NÃO veio. Para TELA e PDF que mostram o nível no lugar da nota (R-109,
 * 04/10/2026: o piloto exibia "2.0/4.0" e "Nota da demonstração").
 *
 * Não é `nivelDaNota` com outro nome: aquela função trata nota ausente como N1, o
 * lado conservador de quem CALCULA e nunca promove ninguém por dado faltando. Quem
 * só EXIBE tem outra pergunta, "há o que mostrar?", e a resposta para nota ausente
 * é não, nunca "Nível 1": um piloto sem avaliação não pode aparecer como N1.
 */
export function nivelDaNotaOuNull(nota: unknown): Nivel | null {
  if (nota == null || nota === '') return null;
  const n = Number(nota);
  return Number.isFinite(n) ? nivelDaNota(n) : null;
}
