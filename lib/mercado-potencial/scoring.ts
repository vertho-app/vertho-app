export interface MercadoScoringFilters {
  precoProf?: number;
  precoGestor?: number;
  idadeOnboarding?: number;
}

export type MercadoScoreResult = {
  pct_sem_pos: number;
  pct_jovens: number;
  tam_mensal_mentor_ia: number;
  tam_mensal_onboarding: number;
  fit_pedagogico: number;
  fit_financeiro: number | null;
  score_base: number;
  score_completo: number | null;
  qt_jovens_efetivo: number;
  qt_professores_onboarding: number;
  qt_professores_total: number;
};

const DEFAULTS = { precoProf: 100, precoGestor: 100, idadeOnboarding: 29 };

export function calcularMercadoScores(row: any, filtros: MercadoScoringFilters): MercadoScoreResult {
  const precoProf = filtros.precoProf ?? DEFAULTS.precoProf;
  const precoGestor = filtros.precoGestor ?? DEFAULTS.precoGestor;
  const idadeCorte = filtros.idadeOnboarding ?? DEFAULTS.idadeOnboarding;
  const profs = Number(row.qt_professores || 0);

  const jovens = idadeCorte <= 24
    ? Number(row.qt_docs_0_24 || 0)
    : Number(row.qt_docs_jovens || 0);
  const pos = Number(row.qt_docs_pos || 0);
  const gestores = Number(row.qt_gestores || 0);
  const inse = row.inse_medio != null ? Number(row.inse_medio) : null;

  const pct_sem_pos = profs > 0 ? Math.max(0, 1 - pos / profs) : 0;
  const pct_jovens = profs > 0 ? jovens / profs : 0;

  const tam_mensal_mentor_ia = profs * precoProf + gestores * precoGestor;
  const tam_mensal_onboarding = jovens * precoProf + gestores * precoGestor;
  const fit_pedagogico = Math.min(1, 0.4 + 0.3 * pct_sem_pos + 0.3 * pct_jovens);

  const redeRow = (row.rede || '').toUpperCase();
  let fit_financeiro: number | null = null;
  if (inse != null) {
    const inseNorm = (inse - 1) / 5;
    if (redeRow === 'PRIVADA') {
      fit_financeiro = 0.4 + 0.6 * inseNorm;
    } else if (redeRow === 'MUNICIPAL' || redeRow === 'ESTADUAL' || redeRow === 'FEDERAL') {
      fit_financeiro = 0.5 + 0.4 * (1 - inseNorm);
    } else {
      fit_financeiro = 0.5;
    }
  }

  const score_base = tam_mensal_mentor_ia * fit_pedagogico;
  const score_completo = fit_financeiro != null ? score_base * fit_financeiro : null;

  return {
    pct_sem_pos,
    pct_jovens,
    tam_mensal_mentor_ia,
    tam_mensal_onboarding,
    fit_pedagogico,
    fit_financeiro,
    score_base,
    score_completo,
    qt_jovens_efetivo: jovens,
    qt_professores_onboarding: jovens,
    qt_professores_total: profs,
  };
}
