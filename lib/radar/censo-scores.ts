/**
 * Scores agregados 0-100 a partir dos indicadores IN_* do Censo Escolar.
 *
 * Estrutura: cada dimensão é uma lista de **famílias de campo**.
 * Uma família agrupa variáveis Censo redundantes/relacionadas (ex.: água
 * potável + água da rede pública). A família vale 1 se QUALQUER campo dela
 * estiver marcado, evitando dupla contagem e o falso negativo de escolas
 * que só preencheram uma das variantes.
 *
 * Cada família entra como UM item no denominador. Família com todos os
 * campos ausentes/null não conta no cálculo.
 */

export type Familia = readonly string[];

export const SCORE_GROUPS: Record<string, readonly Familia[]> = {
  basica: [
    ['IN_AGUA_POTAVEL', 'IN_AGUA_REDE_PUBLICA'],
    ['IN_ENERGIA_REDE_PUBLICA'],
    ['IN_ESGOTO_REDE_PUBLICA'],
    ['IN_BANHEIRO', 'IN_BANHEIRO_DENTRO_PREDIO'],
    ['IN_LIXO_DESTINO_REDE_LIMPEZA_URBANA'],
    ['IN_ALMOXARIFADO'],
  ],
  pedagogica: [
    ['IN_BIBLIOTECA', 'IN_BIBLIOTECA_SALA_LEITURA', 'IN_SALA_LEITURA'],
    ['IN_LABORATORIO_INFORMATICA'],
    ['IN_LABORATORIO_CIENCIAS'],
    ['IN_AUDITORIO'],
    ['IN_AREA_VERDE'],
    ['IN_PARQUE_INFANTIL'],
    ['IN_QUADRA_ESPORTES', 'IN_QUADRA_ESPORTES_COBERTA', 'IN_PATIO_COBERTO'],
    ['IN_REFEITORIO', 'IN_COZINHA'],
  ],
  acessibilidade: [
    ['IN_ACESSIBILIDADE_RAMPAS'],
    ['IN_ACESSIBILIDADE_CORRIMAO'],
    ['IN_ACESSIBILIDADE_ELEVADOR'],
    ['IN_ACESSIBILIDADE_PISOS_TATEIS'],
    ['IN_ACESSIBILIDADE_VAO_LIVRE'],
    ['IN_ACESSIBILIDADE_BARRAS_BANHEIRO'],
    ['IN_ACESSIBILIDADE_BANHEIRO', 'IN_BANHEIRO_PNE'],
    ['IN_ACESSIBILIDADE_SINAL_SONORO'],
    ['IN_ACESSIBILIDADE_SINAL_TATIL'],
    ['IN_ACESSIBILIDADE_SINAL_VISUAL'],
  ],
  conectividade: [
    ['IN_INTERNET'],
    ['IN_INTERNET_APRENDIZAGEM', 'IN_INTERNET_ALUNOS'],
    ['IN_INTERNET_ADMINISTRATIVO'],
    ['IN_BANDA_LARGA'],
  ],
} as const;

export type ScoreKey = keyof typeof SCORE_GROUPS;

/**
 * Para cada família: retorna 1 se qualquer campo > 0, 0 se todos = 0,
 * null se nenhum campo da família foi medido. Score final = média
 * das famílias com valor.
 */
export function calcularScores(indicadores: Record<string, any>): Record<ScoreKey, number | null> {
  const out: Record<string, number | null> = {};
  for (const [key, familias] of Object.entries(SCORE_GROUPS)) {
    let sum = 0;
    let count = 0;
    for (const familia of familias) {
      let medido = false;
      let temAlgum = false;
      for (const col of familia) {
        const v = indicadores[col];
        if (v == null || v === '') continue;
        const n = Number(v);
        if (!Number.isFinite(n)) continue;
        medido = true;
        if (n > 0) { temAlgum = true; break; }
      }
      if (medido) {
        sum += temAlgum ? 1 : 0;
        count++;
      }
    }
    out[key] = count > 0 ? Math.round((sum / count) * 100 * 100) / 100 : null;
  }
  return out as Record<ScoreKey, number | null>;
}

export const SCORE_LABELS: Record<ScoreKey, string> = {
  basica: 'Infra Básica',
  pedagogica: 'Infra Pedagógica',
  acessibilidade: 'Acessibilidade',
  conectividade: 'Conectividade',
};

export const SCORE_DESCRIPTIONS: Record<ScoreKey, string> = {
  basica: 'Água, energia, esgoto, banheiros, destino do lixo',
  pedagogica: 'Biblioteca, laboratórios, quadra ou pátio, refeitório, áreas externas',
  acessibilidade: 'Rampas, corrimão, sinais sonoros/táteis/visuais, banheiros adaptados',
  conectividade: 'Internet, banda larga, internet pedagógica e administrativa',
};
