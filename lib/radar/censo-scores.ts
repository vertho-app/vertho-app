/**
 * Scores agregados 0-100 a partir dos indicadores IN_* do Censo Escolar.
 * Cada score é a média dos IN_ do grupo (cada IN_ = 0/1) × 100.
 *
 * Critério: indicadores que melhor representam a dimensão SEM redundância.
 * IN_ ausente ou null não conta na média (denominador menor).
 */

export const SCORE_GROUPS = {
  basica: [
    'IN_AGUA_POTAVEL',
    'IN_AGUA_REDE_PUBLICA',
    'IN_ENERGIA_REDE_PUBLICA',
    'IN_ESGOTO_REDE_PUBLICA',
    'IN_BANHEIRO',
    'IN_BANHEIRO_DENTRO_PREDIO',
    'IN_LIXO_DESTINO_REDE_LIMPEZA_URBANA',
    'IN_ALMOXARIFADO',
  ],
  pedagogica: [
    'IN_BIBLIOTECA',
    'IN_BIBLIOTECA_SALA_LEITURA',
    'IN_LABORATORIO_INFORMATICA',
    'IN_LABORATORIO_CIENCIAS',
    'IN_AUDITORIO',
    'IN_AREA_VERDE',
    'IN_PARQUE_INFANTIL',
    'IN_PATIO_COBERTO',
    'IN_QUADRA_ESPORTES',
    'IN_QUADRA_ESPORTES_COBERTA',
    'IN_REFEITORIO',
  ],
  acessibilidade: [
    'IN_ACESSIBILIDADE_RAMPAS',
    'IN_ACESSIBILIDADE_CORRIMAO',
    'IN_ACESSIBILIDADE_ELEVADOR',
    'IN_ACESSIBILIDADE_PISOS_TATEIS',
    'IN_ACESSIBILIDADE_VAO_LIVRE',
    'IN_ACESSIBILIDADE_BARRAS_BANHEIRO',
    'IN_ACESSIBILIDADE_BANHEIRO',
    'IN_ACESSIBILIDADE_SINAL_SONORO',
    'IN_ACESSIBILIDADE_SINAL_TATIL',
    'IN_ACESSIBILIDADE_SINAL_VISUAL',
  ],
  conectividade: [
    'IN_INTERNET',
    'IN_INTERNET_APRENDIZAGEM',
    'IN_INTERNET_ALUNOS',
    'IN_INTERNET_ADMINISTRATIVO',
    'IN_BANDA_LARGA',
  ],
} as const;

export type ScoreKey = keyof typeof SCORE_GROUPS;

export function calcularScores(indicadores: Record<string, any>): Record<ScoreKey, number | null> {
  const out: Record<ScoreKey, number | null> = {
    basica: null, pedagogica: null, acessibilidade: null, conectividade: null,
  };
  for (const [key, cols] of Object.entries(SCORE_GROUPS) as [ScoreKey, readonly string[]][]) {
    let sum = 0;
    let count = 0;
    for (const col of cols) {
      const v = indicadores[col];
      if (v == null || v === '') continue;
      const n = Number(v);
      if (!Number.isFinite(n)) continue;
      // IN_* tipicamente é 0/1; aceita também strings "Sim"/"Não"
      sum += n > 0 ? 1 : 0;
      count++;
    }
    out[key] = count > 0 ? Math.round((sum / count) * 100 * 100) / 100 : null;
  }
  return out;
}

export const SCORE_LABELS: Record<ScoreKey, string> = {
  basica: 'Infra Básica',
  pedagogica: 'Infra Pedagógica',
  acessibilidade: 'Acessibilidade',
  conectividade: 'Conectividade',
};

export const SCORE_DESCRIPTIONS: Record<ScoreKey, string> = {
  basica: 'Água potável, energia, esgoto, banheiros, destino do lixo',
  pedagogica: 'Biblioteca, laboratórios, quadra, área verde, refeitório',
  acessibilidade: 'Rampas, corrimão, sinais sonoros/táteis/visuais, banheiros adaptados',
  conectividade: 'Internet, banda larga, internet pra alunos e aprendizagem',
};
