import { describe, it, expect } from 'vitest';
import { calcularScore, classificarHelper, type ScoreInput } from '@/lib/radarempresas/score';

// Helper: input base "neutro" — sobrescreve campos por teste
function baseInput(over: Partial<ScoreInput> = {}): ScoreInput {
  return {
    porte_empresa: '03',
    capital_social: 100_000,
    is_matriz: true,
    company_age_years: 10,
    has_email: true,
    has_phone: true,
    qtd_estabelecimentos_grupo: 1,
    segmento_key: 'educacao_privada',
    people_intensity_score: 90,
    leadership_complexity_score: 80,
    onboarding_need_score: 85,
    standardization_need_score: 80,
    commercial_fit_score: 85,
    is_priority_cnae: true,
    ...over,
  };
}

describe('calcularScore — estrutura', () => {
  it('retorna sub-scores 0-100 e total ponderado 40/30/30', () => {
    const r = calcularScore(baseInput());
    for (const s of [r.score_total, r.score_dor_pessoas, r.score_capacidade_compra, r.score_fit_vertho]) {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
    }
    const recomposto =
      0.40 * r.score_dor_pessoas + 0.30 * r.score_capacidade_compra + 0.30 * r.score_fit_vertho;
    expect(Math.abs(r.score_total - recomposto)).toBeLessThan(0.6); // arredondamento
  });

  it('versão é v4; contexto setorial null quando sem CAGED', () => {
    const r = calcularScore(baseInput());
    expect(r.score_contexto_setorial).toBeNull();
    expect(r.scoring_version).toBe('v5');
  });

  it('explanation tem 4 blocos auditáveis (inclui actionability)', () => {
    const r = calcularScore(baseInput());
    expect(r.explanation.dor_pessoas.length).toBeGreaterThan(0);
    expect(r.explanation.capacidade_compra.length).toBeGreaterThan(0);
    expect(r.explanation.fit_vertho.length).toBe(4);
    expect(r.explanation.actionability.length).toBe(4);
    expect(r.explanation.pesos).toEqual({ dor: 0.40, capacidade: 0.30, fit: 0.30 });
  });

  it('v4: actionability é campo separado, não entra no score_total', () => {
    const comContato = calcularScore(baseInput({ has_email: true, has_phone: true, has_fantasia: true }));
    const semContato = calcularScore(baseInput({ has_email: false, has_phone: false, has_fantasia: false }));
    // contato NÃO afeta dor nem capacidade (saiu do score_total)
    expect(comContato.score_dor_pessoas).toBe(semContato.score_dor_pessoas);
    expect(comContato.score_capacidade_compra).toBe(semContato.score_capacidade_compra);
    // mas afeta acionabilidade
    expect(comContato.commercial_actionability).toBeGreaterThan(semContato.commercial_actionability);
  });

  it('v4: score_confidence baixa quando CNAE sem segmento', () => {
    expect(calcularScore(baseInput({ segmento_mapeado: false })).score_confidence).toBe('baixa');
    expect(calcularScore(baseInput({ segmento_mapeado: true, contexto_confianca: 'alta' })).score_confidence).toBe('alta');
    expect(calcularScore(baseInput({ segmento_mapeado: true, contexto_confianca: 'baixa' })).score_confidence).toBe('media');
  });

  it('v5 híbrido: aderente genérico nunca atinge confidence alta', () => {
    const curado = calcularScore(baseInput({ segmento_mapeado: true, aderencia_tipo: 'curado', contexto_confianca: 'alta' }));
    const generico = calcularScore(baseInput({ segmento_mapeado: true, aderencia_tipo: 'generico', contexto_confianca: 'alta' }));
    expect(curado.score_confidence).toBe('alta');
    expect(generico.score_confidence).toBe('media'); // teto
    // genérico continua elegível (segmento_mapeado=true)
    expect(generico.score_total).toBeGreaterThan(0);
  });

  it('v4: setor com porte RAIS alto não penaliza ME (low_team=false)', () => {
    const semRais = calcularScore(baseInput({ porte_empresa: '01', capital_social: 0 }));
    const setorComEquipe = calcularScore(baseInput({ porte_empresa: '01', capital_social: 0, rais_tam_medio_setor: 30 }));
    expect(semRais.low_team_probability).toBe(true);
    expect(setorComEquipe.low_team_probability).toBe(false);
    expect(setorComEquipe.score_capacidade_compra).toBeGreaterThan(semRais.score_capacidade_compra);
  });
});

describe('calcularScore — comportamento das regras', () => {
  it('empresa forte (educação, EPP, multiunidade) → abordar_agora', () => {
    const r = calcularScore(baseInput({ qtd_estabelecimentos_grupo: 12, porte_empresa: '05', capital_social: 2_000_000 }));
    expect(r.score_total).toBeGreaterThanOrEqual(80);
    expect(r.classificacao).toBe('abordar_agora');
  });

  it('low_team_probability (porte ME + capital irrisório) é penalizado', () => {
    const comMei = calcularScore(baseInput({ porte_empresa: '01', capital_social: 0 }));
    const semMei = calcularScore(baseInput({ porte_empresa: '03', capital_social: 100_000 }));
    expect(comMei.score_capacidade_compra).toBeLessThan(semMei.score_capacidade_compra);
    expect(comMei.low_team_probability).toBe(true);
    const tinha = comMei.explanation.capacidade_compra.some(p => p.parcela === 'low_team_probability');
    expect(tinha).toBe(true);
  });

  it('multiunidade aumenta o sub-score de dor', () => {
    const solo = calcularScore(baseInput({ qtd_estabelecimentos_grupo: 1 }));
    const rede = calcularScore(baseInput({ qtd_estabelecimentos_grupo: 15 }));
    expect(rede.score_dor_pessoas).toBeGreaterThan(solo.score_dor_pessoas);
  });

  it('segmento de baixa intensidade de pessoas → score menor', () => {
    const alta = calcularScore(baseInput({ people_intensity_score: 90 }));
    const baixa = calcularScore(baseInput({ people_intensity_score: 20, standardization_need_score: 20 }));
    expect(baixa.score_dor_pessoas).toBeLessThan(alta.score_dor_pessoas);
  });

  it('contexto CAGED ausente: contexto_setorial null', () => {
    const semCtx = calcularScore(baseInput());
    expect(semCtx.score_contexto_setorial).toBeNull();
    expect(semCtx.scoring_version).toBe('v5');
  });

  it('contexto CAGED alto aumenta dor e preenche score_contexto_setorial', () => {
    const sem = calcularScore(baseInput({ caged_contexto_score: null }));
    const alto = calcularScore(baseInput({ caged_contexto_score: 100 }));
    expect(alto.score_contexto_setorial).toBe(100);
    expect(alto.score_dor_pessoas).toBeGreaterThanOrEqual(sem.score_dor_pessoas);
    const tem = alto.explanation.dor_pessoas.some(p => p.parcela === 'contexto_rotatividade');
    expect(tem).toBe(true);
  });

  it('classificação respeita as faixas', () => {
    expect(classificarHelper(85)).toBe('abordar_agora');
    expect(classificarHelper(70)).toBe('boa');
    expect(classificarHelper(45)).toBe('nutrir');
    expect(classificarHelper(20)).toBe('baixa');
  });
});
