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

/** Valida um nível já calculado. Ausente, fracionário ou fora de N1–N4 é nulo. */
export function nivelOuNull(value: unknown): Nivel | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 4 ? n as Nivel : null;
}

/**
 * Converte a nota decimal (1,00–4,00) no nível da régua. Nota fora da faixa é
 * grampeada; nota ausente/inválida vira N1 (o lado conservador — nunca promove
 * alguém por dado faltando).
 *
 * ⚠️ O NÍVEL É MUITO MAIS FRÁGIL QUE A NOTA, e isso é medido (09/09/2026): o
 * extrator de conversa emite notas quantizadas, e **34% delas caem exatamente
 * sobre 2,00 ou 3,00** — as duas fronteiras. Com a nota em 2,00, um centésimo
 * para baixo já troca N2 por N1, então repontuar a MESMA conversa mudou o nível
 * de **18 de 57** pares (32%) enquanto a nota variava só 0,09 de desvio-padrão.
 *
 * Consequência prática para quem escreve tela ou PDF: a nota é o número
 * defensável; "N2 → N3" sobre um único descritor é a afirmação mais instável que
 * este produto faz. Preferir o nível da MÉDIA de uma competência (ruído 0,07) a
 * nível de descritor individual. Medição: `docs/CUSTO-QUALIDADE.md` §09/09.
 */
export function nivelDaNota(nota: number | null | undefined): Nivel {
  const n = Number(nota);
  if (!Number.isFinite(n)) return 1;
  const clamped = Math.max(1, Math.min(4, n));
  if (clamped > TETO_N3) return 4;
  return Math.floor(clamped) as Nivel;
}

/** Como o produto escreve o nível: por extenso ("Nível 2") ou na forma curta ("N2"). */
export type FormaDoRotulo = 'longo' | 'curto';

/** A palavra "nível" em cada idioma do produto (a forma curta "N2" é a notação da régua N1 a N4, igual em todos). */
const PALAVRA_NIVEL: Record<string, string> = {
  'pt-BR': 'Nível',
  'pt-PT': 'Nível',
  'es-ES': 'Nivel',
  'en-US': 'Level',
};

/**
 * O ÚNICO jeito de escrever um nível para quem lê (R-53, 04/10/2026).
 *
 * Até aqui o nível saía de três jeitos: "Nível 2" (simuladores, relatório), "N2"
 * (PDI, mapeamento, PDFs do RH e do gestor, DNA) e rótulos que mudavam por público
 * ("Bom" e "Atenção" no PDI, "Gap" e "Meta" no RH). O nível é o ponto de partida da
 * pessoa, não um veredito: o rótulo é só o número.
 *
 * Regra de uso:
 * - `'longo'` ("Nível 2"): texto corrido, cartão, título, legenda, linha de PDF.
 * - `'curto'` ("N2"): só célula de tabela e eixo de gráfico, onde a coluna ou o eixo
 *   já diz "Nível".
 * - Em componente com next-intl, a frase longa vem do catálogo (`levelValue`, "Nível
 *   {n}"); este helper é para o que não tem catálogo (PDF, lib, e-mail). Um teste
 *   confere que os dois escrevem igual nos quatro idiomas.
 *
 * Recebe o NÍVEL (inteiro de 1 a 4), nunca a nota: nota decimal não vira rótulo, e
 * nível ausente ou inválido vira texto vazio (ausência não é N1; quem chama escolhe
 * o que mostrar no lugar).
 */
export function rotuloNivel(
  nivel: unknown,
  opcoes: { forma?: FormaDoRotulo; idioma?: string } = {},
): string {
  const n = nivelOuNull(nivel);
  if (n === null) return '';
  if (opcoes.forma === 'curto') return `N${n}`;
  const palavra = PALAVRA_NIVEL[opcoes.idioma ?? 'pt-BR'] ?? PALAVRA_NIVEL['pt-BR'];
  return `${palavra} ${n}`;
}
