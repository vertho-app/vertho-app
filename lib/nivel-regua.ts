/**
 * Régua oficial NOTA → NÍVEL do modelo de competências (definida pelo dono do
 * produto em 12/08/2026):
 *
 *   N1: 1,00 – 1,99 · N2: 2,00 – 2,99 · N3: 3,00 – 3,50 · N4: acima de 3,50
 *
 * Não é arredondamento e **não é `Math.floor` puro**. Os três primeiros degraus
 * seguem o "só conta quando CONSOLIDA" (média 1,9 é N1, não N2 — arredondar
 * promove meio degrau); o N4 é que abre em 3,5, e não em 4,0. Com floor puro o
 * N4 exigiria 4,00 cravado em TODOS os descritores: um nível praticamente
 * inalcançável, e a régua do produto não é essa.
 *
 * POR QUE ISTO EXISTE NUM LUGAR SÓ (medido em 12/08/2026): a conversão estava
 * reimplementada em NOVE pontos independentes — IA4, reavaliação, chat ao vivo,
 * blueprint, relatório individual, DNA, CONARH e duas telas de admin —, todos
 * com `Math.floor` e nenhum com o corte de 3,5. O efeito era visível no produto:
 * em 42 de 288 descritores das avaliações de Macaé o nível gravado pelo código
 * divergia do nível escrito pela IA na MESMA avaliação, e o auditor da 2ª IA
 * classificava isso como "consolidação contraditória" — erro grave, teto de 60
 * pontos. Régua duplicada não diverge só no código: ela vaza para o documento
 * que a pessoa recebe.
 *
 * Guard: `tests/unit/security/nivel-regua-guard.test.ts`.
 */

export type Nivel = 1 | 2 | 3 | 4;

/** Limite superior (inclusive) do N3 — acima disto é N4. */
export const TETO_N3 = 3.5;

/**
 * Converte a nota decimal (1,00–4,00) no nível da régua. Nota fora da faixa é
 * grampeada; nota ausente/inválida vira N1 (o lado conservador — nunca promove
 * alguém por dado faltando).
 */
export function nivelDaNota(nota: number | null | undefined): Nivel {
  const n = Number(nota);
  if (!Number.isFinite(n)) return 1;
  const clamped = Math.max(1, Math.min(4, n));
  if (clamped > TETO_N3) return 4;
  return Math.floor(clamped) as Nivel;
}

/** Rótulo curto ("N2") — para não formatar à mão em cada tela. */
export function rotuloNivel(nota: number | null | undefined): string {
  return `N${nivelDaNota(nota)}`;
}
