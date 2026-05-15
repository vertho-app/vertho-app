/**
 * Score de Oportunidade Vertho — motor por regras, auditável e versionado.
 *
 * Função PURA: recebe os dados já resolvidos do estabelecimento + segmento,
 * devolve sub-scores + total + classificação + explicação parcela-a-parcela.
 * Sem ML no MVP. A IA escreve narrativa depois, NUNCA o número.
 *
 *   score_total = 0.40·dor_pessoas + 0.30·capacidade_compra + 0.30·fit_vertho
 *
 * O sub-score de contexto setorial (SIDRA) entra na Etapa 4 — no v1 fica
 * fora da fórmula (null), sem alterar os pesos das outras 3 dimensões.
 */

export const SCORING_VERSION = 'v5';

export type Classificacao = 'abordar_agora' | 'boa' | 'nutrir' | 'baixa';

export interface ScoreInput {
  // do estabelecimento/empresa
  porte_empresa: string | null;          // '00'|'01'(ME)|'03'(EPP)|'05'(demais)
  capital_social: number | null;
  is_matriz: boolean;
  company_age_years: number | null;
  has_email: boolean;
  has_phone: boolean;
  qtd_estabelecimentos_grupo: number;    // nº de estab do mesmo cnpj_basico
  // do mapeamento CNAE→segmento (radarempresas_cnae_segmento)
  segmento_key: string | null;
  people_intensity_score: number;        // 0-100
  leadership_complexity_score: number;
  onboarding_need_score: number;
  standardization_need_score: number;
  commercial_fit_score: number;
  is_priority_cnae: boolean;
  has_fantasia?: boolean;
  // Contexto setorial: taxa de ROTATIVIDADE REAL do CNAE no município
  // (mov CAGED 6m ÷ estoque RAIS, suavizada/capada pelo caller),
  // JÁ normalizada 0-100. null = sem dado.
  caged_contexto_score?: number | null;
  // v4: confiança do sinal de contexto (vem do caller — pisos de
  // estoque RAIS / movimentação CAGED). null = sem contexto.
  contexto_confianca?: 'alta' | 'media' | 'baixa' | null;
  // v4: porte médio do CNAE×município na RAIS — refina low_team
  // (setor com equipes grandes não penaliza ME). null = desconhecido.
  rais_tam_medio_setor?: number | null;
  // v4: o CNAE é elegível? (allowlist curada OU fallback genérico).
  // false = excluído (denylist) ou sem match → não-elegível.
  segmento_mapeado?: boolean;
  // v5 (híbrido): 'curado' = match na allowlist (sinal rico, pode ter
  // confidence alta); 'generico' = fallback aderente (pesos medianos,
  // confidence teto 'media'). Ignorado se segmento_mapeado=false.
  aderencia_tipo?: 'curado' | 'generico';
}

export interface ScoreExplanationPart {
  parcela: string;
  valor: number;
  detalhe: string;
}

export interface ScoreResult {
  score_total: number;                   // 0-100
  score_dor_pessoas: number;
  score_capacidade_compra: number;
  score_fit_vertho: number;
  score_contexto_setorial: number | null;
  classificacao: Classificacao;
  scoring_version: string;
  // v4 — fora do score_total: confiança e acionabilidade
  score_confidence: 'alta' | 'media' | 'baixa';
  commercial_actionability: number;        // 0-100 (não entra no total)
  low_team_probability: boolean;
  explanation: {
    dor_pessoas: ScoreExplanationPart[];
    capacidade_compra: ScoreExplanationPart[];
    fit_vertho: ScoreExplanationPart[];
    actionability: ScoreExplanationPart[];
    pesos: { dor: number; capacidade: number; fit: number };
  };
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

// ── Sub-score 1: dor provável de pessoas (peso 40%) ──────────────────────
function calcDorPessoas(i: ScoreInput): { score: number; parts: ScoreExplanationPart[] } {
  const parts: ScoreExplanationPart[] = [];

  const base = 0.55 * i.people_intensity_score;
  parts.push({ parcela: 'people_intensity', valor: round1(base), detalhe: `0.55 × ${i.people_intensity_score} (intensidade de pessoas do segmento)` });

  const padr = 0.20 * i.standardization_need_score;
  parts.push({ parcela: 'standardization_need', valor: round1(padr), detalhe: `0.20 × ${i.standardization_need_score} (necessidade de padronização)` });

  let multi = 0;
  const q = i.qtd_estabelecimentos_grupo;
  if (q >= 10) multi = 25;
  else if (q >= 4) multi = 20;
  else if (q >= 2) multi = 10;
  parts.push({ parcela: 'multiunidade', valor: multi, detalhe: `${q} estabelecimento(s) no grupo → operação distribuída` });

  const prio = i.is_priority_cnae ? 10 : 0;
  parts.push({ parcela: 'cnae_prioritario', valor: prio, detalhe: i.is_priority_cnae ? 'CNAE marcado como prioritário' : 'CNAE não prioritário' });

  // v4: contato saiu daqui (é acionabilidade, não dor).
  // Contexto = taxa de rotatividade real do setor no município (CAGED÷RAIS).
  let ctx = 0;
  if (i.caged_contexto_score != null) {
    ctx = round1(0.20 * i.caged_contexto_score);
    parts.push({ parcela: 'contexto_rotatividade', valor: ctx, detalhe: `0.20 × ${i.caged_contexto_score} (rotatividade real do setor no município — CAGED÷RAIS)` });
  }

  const score = clamp(base + padr + multi + prio + ctx);
  return { score: round1(score), parts };
}

// ── Acionabilidade comercial (v4) — NÃO entra no score_total ─────────────
function calcActionability(i: ScoreInput): { score: number; parts: ScoreExplanationPart[] } {
  const parts: ScoreExplanationPart[] = [];
  const email = i.has_email ? 30 : 0;
  const tel = i.has_phone ? 30 : 0;
  const fant = i.has_fantasia ? 20 : 0;
  const matriz = i.is_matriz ? 20 : 0;
  parts.push({ parcela: 'email', valor: email, detalhe: i.has_email ? 'tem email' : 'sem email' });
  parts.push({ parcela: 'telefone', valor: tel, detalhe: i.has_phone ? 'tem telefone' : 'sem telefone' });
  parts.push({ parcela: 'nome_fantasia', valor: fant, detalhe: i.has_fantasia ? 'tem fantasia' : 'sem fantasia' });
  parts.push({ parcela: 'matriz', valor: matriz, detalhe: i.is_matriz ? 'matriz' : 'filial' });
  return { score: clamp(email + tel + fant + matriz), parts };
}

// ── Confiança do score (v4) ──────────────────────────────────────────────
function resolveConfidence(i: ScoreInput): 'alta' | 'media' | 'baixa' {
  if (i.segmento_mapeado === false) return 'baixa';    // excluído / sem match
  const cc = i.contexto_confianca;
  const base = (cc == null || cc === 'baixa') ? 'media' : cc; // 'alta'|'media'
  // v5: aderente genérico nunca atinge 'alta' — é hipótese mais rasa,
  // o time deve validar. Curado pode chegar a 'alta'.
  if (i.aderencia_tipo === 'generico') return base === 'alta' ? 'media' : base;
  return base;
}

// ── Sub-score 2: capacidade de compra (peso 30%) ─────────────────────────
function calcCapacidade(i: ScoreInput): { score: number; parts: ScoreExplanationPart[]; lowTeam: boolean } {
  const parts: ScoreExplanationPart[] = [];

  // porte: 05=demais (médio/grande) alto, 03=EPP médio, 01/00 baixo
  let porte = 0;
  if (i.porte_empresa === '05') porte = 40;
  else if (i.porte_empresa === '03') porte = 28;
  else if (i.porte_empresa === '01') porte = 12;
  else porte = 8;
  parts.push({ parcela: 'porte', valor: porte, detalhe: `porte_empresa=${i.porte_empresa ?? 'NA'}` });

  // capital social — faixa log (R$). Sem Simples não dá pra isolar MEI fino;
  // capital muito baixo + porte ME aproxima MEI/microempreendedor.
  const cap = i.capital_social ?? 0;
  let capScore = 0;
  if (cap >= 1_000_000) capScore = 30;
  else if (cap >= 200_000) capScore = 24;
  else if (cap >= 50_000) capScore = 18;
  else if (cap >= 10_000) capScore = 10;
  else if (cap >= 1_000) capScore = 5;
  parts.push({ parcela: 'capital_social', valor: capScore, detalhe: `R$ ${cap.toLocaleString('pt-BR')}` });

  const matriz = i.is_matriz ? 10 : 4;
  parts.push({ parcela: 'matriz', valor: matriz, detalhe: i.is_matriz ? 'matriz' : 'filial' });

  // idade: sweet spot 3-25 anos (estruturada, mas ainda desenvolve pessoas)
  const age = i.company_age_years ?? 0;
  let idade = 0;
  if (age >= 3 && age <= 25) idade = 15;
  else if (age > 25) idade = 10;
  else if (age >= 1) idade = 6;
  parts.push({ parcela: 'idade', valor: idade, detalhe: `${age} ano(s) de atividade` });

  // v4: contato saiu daqui (acionabilidade, não capacidade econômica).
  // low_team_probability: porte ME + capital irrisório → provável micro
  // SEM equipe. MAS se o setor (CNAE×município na RAIS) tem porte médio
  // >= 10 vínculos, o setor tem equipes mesmo em ME → NÃO penaliza
  // (escola/clínica/franquia pequena é alvo válido).
  let penalidade = 0;
  let lowTeam = false;
  if ((i.porte_empresa === '01' || i.porte_empresa === '00') && cap < 1_000) {
    const setorTemEquipe = i.rais_tam_medio_setor != null && i.rais_tam_medio_setor >= 10;
    if (!setorTemEquipe) {
      penalidade = -15;
      lowTeam = true;
      parts.push({ parcela: 'low_team_probability', valor: penalidade, detalhe: `porte ME + capital < R$1k${i.rais_tam_medio_setor != null ? ` + setor com porte médio ${i.rais_tam_medio_setor}` : ' (sem dado de porte setorial)'} → provável micro sem equipe` });
    }
  }

  const score = clamp(porte + capScore + matriz + idade + penalidade);
  return { score: round1(score), parts, lowTeam };
}

// ── Sub-score 3: fit Vertho (peso 30%) ───────────────────────────────────
function calcFit(i: ScoreInput): { score: number; parts: ScoreExplanationPart[] } {
  const parts: ScoreExplanationPart[] = [
    { parcela: 'leadership_complexity', valor: i.leadership_complexity_score, detalhe: 'necessidade de liderança intermediária' },
    { parcela: 'onboarding_need', valor: i.onboarding_need_score, detalhe: 'necessidade de onboarding' },
    { parcela: 'standardization_need', valor: i.standardization_need_score, detalhe: 'necessidade de padronização' },
    { parcela: 'commercial_fit', valor: i.commercial_fit_score, detalhe: 'aderência da oferta Vertho' },
  ];
  const score = clamp(
    (i.leadership_complexity_score + i.onboarding_need_score
      + i.standardization_need_score + i.commercial_fit_score) / 4,
  );
  return { score: round1(score), parts };
}

export function classificarHelper(total: number): Classificacao {
  if (total >= 80) return 'abordar_agora';
  if (total >= 60) return 'boa';
  if (total >= 40) return 'nutrir';
  return 'baixa';
}

export const CLASSIFICACAO_LABEL: Record<Classificacao, string> = {
  abordar_agora: 'Abordar agora',
  boa: 'Boa oportunidade',
  nutrir: 'Nutrir',
  baixa: 'Baixa prioridade',
};

export function calcularScore(input: ScoreInput): ScoreResult {
  // Sem segmento mapeado → score mínimo, não classificável como oportunidade
  const PESOS = { dor: 0.40, capacidade: 0.30, fit: 0.30 };

  const dor = calcDorPessoas(input);
  const cap = calcCapacidade(input);
  const fit = calcFit(input);
  const act = calcActionability(input);

  const total = round1(
    PESOS.dor * dor.score + PESOS.capacidade * cap.score + PESOS.fit * fit.score,
  );

  return {
    score_total: total,
    score_dor_pessoas: dor.score,
    score_capacidade_compra: cap.score,
    score_fit_vertho: fit.score,
    score_contexto_setorial: input.caged_contexto_score ?? null,
    classificacao: classificarHelper(total),
    scoring_version: SCORING_VERSION,
    score_confidence: resolveConfidence(input),
    commercial_actionability: act.score,
    low_team_probability: cap.lowTeam,
    explanation: {
      dor_pessoas: dor.parts,
      capacidade_compra: cap.parts,
      fit_vertho: fit.parts,
      actionability: act.parts,
      pesos: PESOS,
    },
  };
}
