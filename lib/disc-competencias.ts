export type DiscScores = {
  D: number;
  I: number;
  S: number;
  C: number;
};

/**
 * Modelo usado pelos novos mapeamentos, após a retirada do segundo bloco DISC.
 *
 * Os coeficientes naturais e contextuais da regressão anterior foram colapsados
 * por fator. Isso preserva a escala histórica quando os dois perfis coincidiam,
 * sem reintroduzir um perfil adaptado implícito.
 */
export const DISC_COMPETENCY_MODEL_VERSION = 'disc-natural-v1';

const COMPETENCY_COEFFICIENTS: Record<string, [number, number, number, number, number]> = {
  Ousadia: [.0027, .48532 + .150, .38013 + .126, -.132 + .152, -.193 + .112],
  Comando: [.003, .976 + .151, -.139 + .130, -.151 + .130, -.137 + .137],
  Objetividade: [.003, .547 + .120, -.154 + .182, -.169 + .136, .360 + .145],
  Assertividade: [.003, .418 + .138, -.136 + .141, -.179 + .148, .446 + .122],
  Persuasão: [.003, -.126 + .154, .947 + .144, -.133 + .135, -.142 + .114],
  Extroversão: [.003, -.138 + .120, .965 + .153, -.150 + .138, -.122 + .143],
  Entusiasmo: [.003, -.138 + .130, .984 + .131, -.154 + .138, -.148 + .145],
  Sociabilidade: [.003, -.162 + .120, .467 + .167, .357 + .136, -.108 + .131],
  Empatia: [.003, -.172 + .132, .433 + .143, .404 + .141, -.110 + .138],
  Paciência: [.003, -.153 + .096, -.136 + .178, .981 + .093, -.151 + .174],
  Persistência: [.003, .401 + .177, -.117 + .115, .440 + .171, -.176 + .085],
  Planejamento: [.003, -.116 + .128, -.144 + .138, .404 + .120, .430 + .186],
  Organização: [.003, .176 + .112, -.130 + .140, .222 + .109, .287 + .195],
  Detalhismo: [.003, .345 + .171, -.143 + .121, -.135 + .151, .499 + .124],
  Prudência: [.003, -.171 + .137, -.142 + .133, .399 + .150, .462 + .128],
  Concentração: [.003, .383 + .135, -.142 + .145, -.142 + .142, .449 + .125],
};

export function computeDiscCompetenciesNatural(disc: DiscScores): Record<string, number> {
  const vector = [1, disc.D, disc.I, disc.S, disc.C];
  const result: Record<string, number> = {};

  for (const [name, coefficients] of Object.entries(COMPETENCY_COEFFICIENTS)) {
    const value = coefficients.reduce((sum, coefficient, index) => sum + coefficient * vector[index], 0);
    result[name] = Math.round(Math.max(0, Math.min(100, value)) * 10) / 10;
  }

  return result;
}
