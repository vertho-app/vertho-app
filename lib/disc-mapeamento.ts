/**
 * Régua do mapeamento comportamental — FONTE ÚNICA.
 *
 * Estas três funções definem como um resultado DISC vira as colunas do
 * colaborador. Elas nasceram dentro da tela do mapeamento
 * (`app/dashboard/perfil-comportamental/mapeamento/page.tsx`) e ficaram
 * inalcançáveis para o resto do app — que é como o `simulador-disc` acabou com
 * uma régua PRÓPRIA e divergente em tudo: soma do DISC (100 × 200), liderança
 * (`0,7·D + 0,3·C` × `D/2`), competências (ruído aleatório × regressão) e até o
 * perfil dominante (só a letra maior × o combo de todas ≥ 50). Tenants
 * populados pelo simulador nasceram fora da régua do produto — medido em
 * 24/08/2026: `projetomacae` (13 pessoas) e `acme` (4).
 *
 * As competências ficam em `lib/disc-competencias.ts`
 * (`computeDiscCompetenciesNatural`), que já era compartilhado.
 *
 * Quem consome: a tela do mapeamento, `mapeamento-actions` (que RECALCULA as
 * competências no servidor em vez de confiar no cliente) e `lib/disc-simulador`.
 */

export type DiscScores = { D: number; I: number; S: number; C: number };

/** Alvo de normalização do DISC natural. Não é 100: os quatro fatores somam 200. */
export const DISC_SOMA_ALVO = 200;

/**
 * Normaliza os quatro fatores para somar exatamente `target` (200 por padrão).
 * O ajuste final vai para o fator dominante — comportamento herdado do GAS,
 * preservado para que os perfis antigos continuem reproduzíveis.
 */
export function normalizarDisc(
  scores: DiscScores,
  target: number = DISC_SOMA_ALVO,
): DiscScores {
  const total = scores.D + scores.I + scores.S + scores.C;
  if (total === 0) {
    const q = Math.round(target / 4);
    return { D: q, I: q, S: q, C: q };
  }
  const factor = target / total;
  const result: DiscScores = {
    D: Math.round(scores.D * factor),
    I: Math.round(scores.I * factor),
    S: Math.round(scores.S * factor),
    C: Math.round(scores.C * factor),
  };
  const sum = result.D + result.I + result.S + result.C;
  if (sum !== target) {
    const dominant = (Object.keys(result) as (keyof DiscScores)[])
      .sort((a, b) => result[b] - result[a])[0];
    result[dominant] += target - sum;
  }
  return result;
}

/**
 * Estilos de liderança = metade do fator DISC correspondente. Como o DISC soma
 * 200, a liderança soma 100 e cada estilo vive em 0-50 — a barra da tela do
 * perfil usa régua 0-100 para todos os blocos, então o de liderança aparece
 * menor por ser metade mesmo.
 */
export function computeLeadership(disc: DiscScores) {
  return {
    Executivo: Math.round((disc.D / 2) * 10) / 10,
    Motivador: Math.round((disc.I / 2) * 10) / 10,
    Metódico: Math.round((disc.S / 2) * 10) / 10,
    Sistemático: Math.round((disc.C / 2) * 10) / 10,
  };
}

/**
 * Perfil dominante: TODAS as letras com valor ≥ 50, da maior para a menor
 * (ex.: "CS", "ID"), com a maior isolada como fallback. O combo só existe
 * porque a soma é 200 — numa escala que somasse 100, dois fatores acima de 50
 * seriam quase impossíveis e o perfil sairia sempre com uma letra só.
 */
export function deriveProfile(disc: DiscScores): string {
  const sorted = Object.entries(disc).sort((a, b) => (b[1] as number) - (a[1] as number));
  const acima = sorted.filter(([, v]) => (v as number) >= 50).map(([k]) => k).join('');
  return acima || sorted[0][0];
}
