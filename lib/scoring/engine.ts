/**
 * Vertho — Motor de Scoring determinístico (fonte ÚNICA de verdade).
 *
 * Princípio: este módulo NÃO decide nada e NÃO conhece DISC/competências. Recebe
 *   (1) o Perfil Ideal do Cargo (RoleSpec) — artefato emitido pela IA ao definir o
 *       cargo (faixas, direção, pesos de bloco, knockouts, SEM); para gabaritos
 *       legados, os adaptadores (lib/scoring/role-spec) inferem os campos faltantes;
 *   (2) o perfil derivado do candidato (CandidateProfile) — já transformado pelos
 *       adaptadores (lib/scoring/candidate).
 * Devolve sub-scores por traço/bloco, Beta, bandas de cor, knockouts, borderline e
 * recomendação. Toda a inteligência de domínio vive nos adaptadores e na IA.
 *
 * Consumido por: relatório de Adequação ao Cargo (PDF) e Fit v2 (/admin/fit).
 */

// ─────────────────────────────────────────────────────────────────────────────
// Tipos — contrato que a IA (ou o adaptador de legado) preenche por cargo
// ─────────────────────────────────────────────────────────────────────────────

export type Direction = 'floor' | 'target' | 'ceiling';
// floor    = quanto mais, melhor (até saturar). Penaliza só ABAIXO.   ex: Comando 60–100
// target   = o centro é o ideal (goldilocks). Penaliza dos DOIS lados. ex: Planejamento 40–80
// ceiling  = manter baixo/moderado. Penaliza só ACIMA.                 ex: Detalhismo 20–60

export type BlockName = string; // 'Mapeamento' | 'Competencia' | 'Lideranca' | 'DISC' | ...

/** Traço contínuo 0–100 avaliado contra uma faixa Min–Max (Competência, DISC). */
export interface BandTrait {
  key: string;
  block: BlockName;
  kind: 'band';
  lo: number;
  hi: number;
  direction?: Direction; // a IA emite; se omitir, é inferido da posição da faixa
  weight?: number;       // peso dentro do bloco (default 1)
  peakedness?: number;   // só p/ 'target'. queda do centro à borda. default 0.15 → borda ~0.85
  tLo?: number;          // tolerância p/ baixo: distância até aderência 0. default 20
  tHi?: number;          // tolerância p/ cima.                              default 20
  label?: string;        // rótulo legível p/ relatório (default = key)
}

/** Traço de match de conjunto: tem/não-tem (Mapeamento). */
export interface BinaryTrait {
  key: string;
  block: BlockName;
  kind: 'binary';
  weight?: number;       // default 1
  label?: string;
}

/** Traço cujo fit (0..1) já vem pré-computado pelo adaptador (Liderança contínua). */
export interface ScalarTrait {
  key: string;
  block: BlockName;
  kind: 'scalar';
  weight?: number;       // default 1
  label?: string;
}

export type TraitSpec = BandTrait | BinaryTrait | ScalarTrait;

export interface KnockoutRule {
  scope: 'block' | 'trait';
  key: string;           // nome do bloco ou key do traço
  min: number;           // aderência mínima exigida (0..1)
  label?: string;        // motivo legível p/ o relatório
}

/** Artefato gerado pela IA ao definir o cargo (ou montado do gabarito legado). */
export interface RoleSpec {
  cargo: string;
  specVersion?: number;  // versão da spec de scoring que rege este cargo (default 1)
  scaleMin?: number;     // default 0
  scaleMax?: number;     // default 100
  sem?: number;          // erro-padrão de medida do instrumento. default 5
  // Régua de cor versionada (emitida pelo adaptador conforme specVersion). Ausente
  // → defaults legados (BAND_HIGH/BAND_MID). Versionar aqui CONGELA o histórico:
  // um gabarito v<4 segue a régua antiga mesmo após recalibrarmos a nova.
  bandHigh?: number;     // corte verde   (default BAND_HIGH = 0,85)
  bandMid?: number;      // corte amarelo (default BAND_MID = 0,60)
  tol?: number;          // tolerância de rampa default dos band traits (metadata; o consumo é via tLo/tHi por traço)
  driverThreshold?: number; // v4: fit abaixo do qual um band trait (driver) rebaixa um VERDE p/ "com ressalvas". 0/ausente = desligado (legado)
  traits: TraitSpec[];
  blockWeights: Record<BlockName, number>; // soma ~1 (renormalizada se faltar bloco)
  knockouts?: KnockoutRule[];
}

/** Perfil do candidato: number p/ band (0–100), boolean/0-1 p/ binary, 0..1 p/ scalar. */
export type CandidateProfile = Record<string, number | boolean>;

// ─────────────────────────────────────────────────────────────────────────────
// Saída
// ─────────────────────────────────────────────────────────────────────────────

export type ColorBand = 'verde' | 'amarelo' | 'vermelho';
export type Recommendation =
  | 'recomendado'
  | 'recomendado_com_ressalvas'
  | 'nao_recomendado';

// Status de 4 estados — separa "abaixo do corte" (desenvolvível) de "bloqueado"
// (gate por knockout, assinado por humano). São mensagens OPOSTAS e não devem
// compartilhar selo: abaixo_do_corte puxa p/ desenvolver; bloqueado é gate.
export type Status =
  | 'recomendado'
  | 'recomendado_com_ressalvas'
  | 'abaixo_do_corte'
  | 'bloqueado';

export interface TraitScore {
  key: string;
  label: string;
  block: BlockName;
  raw: number | boolean;
  fit: number;       // 0..1
}

export interface BlockScore {
  block: BlockName;
  score: number;     // 0..1
  pct: number;       // 0..100 (p/ exibição)
  band: ColorBand;
  weight: number;    // peso do bloco no Beta (já renormalizado)
}

export interface KnockoutResult {
  rule: KnockoutRule;
  measured: number;  // aderência apurada
  passed: boolean;
}

export interface ScoringResult {
  cargo: string;
  traits: TraitScore[];
  blocks: BlockScore[];
  beta: number;      // 0..1
  betaPct: number;   // 0..100 (1 casa)
  betaBand: ColorBand;
  knockouts: KnockoutResult[];
  knockoutFailed: boolean;
  borderline: boolean;
  semDeltaPct: number;   // ±X em pontos de Beta sob perturbação ±SEM (meia-largura)
  recommendation: Recommendation;
  status: Status;
}

// ─────────────────────────────────────────────────────────────────────────────
// Defaults (dials calibráveis)
// ─────────────────────────────────────────────────────────────────────────────

const DEF = {
  scaleMin: 0,
  scaleMax: 100,
  sem: 5,
  peakedness: 0.15, // borda da faixa ~0.85 de aderência
  tol: 20,          // tolerância de rampa fora da faixa
  inExp: 2,         // topo levemente achatado (robusto a ruído)
  outExp: 2,        // queda convexa: suave perto da borda, íngreme longe
};

// Bandas de cor — RE-ANCORADAS p/ o motor contínuo (26/06).
// Os cortes antigos (0,75/0,50) eram do motor BINÁRIO. Com crédito parcial, a
// distribuição sobe ~10-13pp e o verde para de discriminar (no ACME, verde@75
// saltou de 33→81 de 100). Calibrado contra 100 colabs reais × 3 gabaritos: o
// corte que REPRODUZ a seletividade binária ("3 de 4 checks") é ~0,85 (verde) e
// ~0,60 (amarelo). Rank preservado (Spearman 0,89-0,96) → só o rótulo precisava
// subir. 0,85 também ALINHA com o Fit v2 (classificacao.js: Excelente ≥ 85).
const BAND_HIGH = 0.85; // verde  ≥ 85%
const BAND_MID = 0.60;  // amarelo 60–84%; vermelho < 60%

export function colorBand(score: number): ColorBand {
  if (score >= BAND_HIGH) return 'verde';
  if (score >= BAND_MID) return 'amarelo';
  return 'vermelho';
}

// ─────────────────────────────────────────────────────────────────────────────
// Direção: a IA emite; isto é só o fallback se ela omitir
// ─────────────────────────────────────────────────────────────────────────────

export function inferDirection(
  lo: number,
  hi: number,
  min = DEF.scaleMin,
  max = DEF.scaleMax,
): Direction {
  const span = max - min;
  const touchesTop = hi >= max - 1;
  const touchesBottom = lo <= min + 1;
  // Faixa encostada no teto e não no piso → quanto mais melhor.
  if (touchesTop && !touchesBottom) return 'floor';
  // Faixa na METADE INFERIOR da escala (centro abaixo do meio) → manter baixo.
  const centro = (lo + hi) / 2;
  if (touchesBottom && centro <= min + span * 0.45) return 'ceiling';
  return 'target';
}

// ─────────────────────────────────────────────────────────────────────────────
// Função de aderência por traço — o núcleo psicométrico
// ─────────────────────────────────────────────────────────────────────────────

export function traitFit(x: number, t: BandTrait, scaleMin = DEF.scaleMin, scaleMax = DEF.scaleMax): number {
  const dir = t.direction ?? inferDirection(t.lo, t.hi, scaleMin, scaleMax);
  const peak = t.peakedness ?? DEF.peakedness;
  const tLo = t.tLo ?? DEF.tol;
  const tHi = t.tHi ?? DEF.tol;
  const edgeFit = dir === 'target' ? 1 - peak : 1;

  // Dentro da faixa
  if (x >= t.lo && x <= t.hi) {
    if (dir !== 'target') return 1; // floor/ceiling: platô pleno na faixa
    const c = (t.lo + t.hi) / 2;
    const h = (t.hi - t.lo) / 2 || 1;
    const rel = Math.abs(x - c) / h;            // 0 no centro, 1 na borda
    return 1 - peak * Math.pow(rel, DEF.inExp); // pico no centro, queda suave
  }

  // Abaixo da faixa
  if (x < t.lo) {
    if (dir === 'ceiling') return 1;            // ficar baixo é aceitável
    const d = (t.lo - x) / tLo;
    return Math.max(0, edgeFit * (1 - Math.pow(Math.min(d, 1), DEF.outExp)));
  }

  // Acima da faixa (x > hi)
  if (dir === 'floor') return 1;                // ter mais é aceitável (satura)
  const d = (x - t.hi) / tHi;
  return Math.max(0, edgeFit * (1 - Math.pow(Math.min(d, 1), DEF.outExp)));
}

function binaryFit(v: number | boolean): number {
  return v === true || v === 1 ? 1 : 0;
}

function scalarFit(v: number | boolean): number {
  return clamp(Number(v) || 0, 0, 1);
}

function fitOf(t: TraitSpec, profile: CandidateProfile, sMin: number, sMax: number): number {
  const raw = profile[t.key];
  if (t.kind === 'binary') return binaryFit(raw as number | boolean);
  if (t.kind === 'scalar') return scalarFit(raw as number | boolean);
  return traitFit(Number(raw), t, sMin, sMax);
}

// ─────────────────────────────────────────────────────────────────────────────
// Roll-up: bloco → Beta
// ─────────────────────────────────────────────────────────────────────────────

function blockScores(
  spec: RoleSpec,
  fitFn: (t: TraitSpec) => number,
): { block: BlockName; score: number; weight: number }[] {
  const byBlock = new Map<BlockName, { wf: number; w: number }>();
  for (const t of spec.traits) {
    const w = t.weight ?? 1;
    const f = fitFn(t);
    const acc = byBlock.get(t.block) ?? { wf: 0, w: 0 };
    acc.wf += w * f;
    acc.w += w;
    byBlock.set(t.block, acc);
  }
  return [...byBlock.entries()].map(([block, { wf, w }]) => ({
    block,
    score: w > 0 ? wf / w : 0,
    weight: spec.blockWeights[block] ?? 0,
  }));
}

function betaFrom(blocks: { score: number; weight: number }[]): number {
  const wsum = blocks.reduce((s, b) => s + b.weight, 0) || 1;
  return blocks.reduce((s, b) => s + b.weight * b.score, 0) / wsum;
}

// ─────────────────────────────────────────────────────────────────────────────
// Knockouts e borderline
// ─────────────────────────────────────────────────────────────────────────────

function evalKnockouts(
  spec: RoleSpec,
  blocks: { block: BlockName; score: number }[],
  traitFits: Map<string, number>,
): KnockoutResult[] {
  return (spec.knockouts ?? []).map((rule) => {
    // Eliminatória sobre bloco/traço AUSENTE (ex.: liderança em cargo não-líder,
    // ou key que não casa com nenhum traço) é N/A → PASSA. Nunca auto-reprova:
    // do contrário um knockout inaplicável zera todo mundo.
    let measured: number;
    let aplica: boolean;
    if (rule.scope === 'block') {
      const b = blocks.find((x) => x.block === rule.key);
      aplica = !!b;
      measured = b ? b.score : 1;
    } else {
      aplica = traitFits.has(rule.key);
      measured = aplica ? traitFits.get(rule.key)! : 1;
    }
    return { rule, measured, passed: !aplica || measured >= rule.min };
  });
}

/** Borderline: a banda do Beta vira se perturbarmos cada traço por ±SEM? */
/** Beta sob perturbação ±SEM de cada traço (lo = pessimista, hi = otimista). */
function semSwing(spec: RoleSpec, profile: CandidateProfile): { lo: number; hi: number } {
  const sMin = spec.scaleMin ?? DEF.scaleMin;
  const sMax = spec.scaleMax ?? DEF.scaleMax;
  const sem = spec.sem ?? DEF.sem;

  const shifted = (sign: -1 | 1): number => {
    const fitFn = (t: TraitSpec): number => {
      if (t.kind === 'binary') return binaryFit(profile[t.key] as number | boolean);
      if (t.kind === 'scalar') return scalarFit(profile[t.key] as number | boolean);
      const x = Number(profile[t.key]);
      const a = traitFit(clamp(x - sem, sMin, sMax), t, sMin, sMax);
      const b = traitFit(clamp(x + sem, sMin, sMax), t, sMin, sMax);
      return sign < 0 ? Math.min(a, b) : Math.max(a, b); // pessimista / otimista
    };
    return betaFrom(blockScores(spec, fitFn));
  };
  return { lo: shifted(-1), hi: shifted(1) };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// ─────────────────────────────────────────────────────────────────────────────
// API principal
// ─────────────────────────────────────────────────────────────────────────────

export function scoreCandidate(spec: RoleSpec, profile: CandidateProfile): ScoringResult {
  const sMin = spec.scaleMin ?? DEF.scaleMin;
  const sMax = spec.scaleMax ?? DEF.scaleMax;
  // Régua de cor desta spec (versionada → histórico congelado). Fallback = legado.
  const bHigh = spec.bandHigh ?? BAND_HIGH;
  const bMid = spec.bandMid ?? BAND_MID;
  const band = (s: number): ColorBand => (s >= bHigh ? 'verde' : s >= bMid ? 'amarelo' : 'vermelho');

  const traitFits = new Map<string, number>();
  const traits: TraitScore[] = spec.traits.map((t) => {
    const fit = fitOf(t, profile, sMin, sMax);
    traitFits.set(t.key, fit);
    return { key: t.key, label: t.label || t.key, block: t.block, raw: profile[t.key], fit };
  });

  const rawBlocks = blockScores(spec, (t) => traitFits.get(t.key)!);
  // Renormaliza os pesos de bloco pelos blocos PRESENTES (cargo não-líder etc.).
  const wsum = rawBlocks.reduce((s, b) => s + b.weight, 0) || 1;
  const blocks: BlockScore[] = rawBlocks.map((b) => ({
    block: b.block,
    score: b.score,
    pct: Math.round(b.score * 100),
    band: band(b.score),
    weight: Math.round((b.weight / wsum) * 1000) / 1000,
  }));

  const beta = betaFrom(rawBlocks);
  const betaBand = band(beta);

  // GATE DESACOPLADO DA RÉGUA DE SCORE. O knockout é avaliado numa tolerância de
  // REFERÊNCIA fixa (DEF.tol = régua legada), NÃO na rampa de score da spec. Motivo
  // (lição do v4): o gate é binário sobre o mín%, mas o valor medido é o FIT, e o fit
  // é desenhado pela rampa — alargar a tolerância levanta o fit de quem está abaixo do
  // piso e AFROUXA o corte eliminatório sem ninguém pedir (é o guardião
  // knockout_acoplado_piso, na alavanca da tolerância em vez do piso). Avaliar o gate
  // em DEF.tol pina o corte onde o psicólogo o calibrou; a rampa larga (v4) dá
  // gradiente só ao SCORE. Em specs v<4 (régua tol=20) os dois fits coincidem → no-op.
  const gateFit = (t: TraitSpec): number => {
    if (t.kind === 'binary') return binaryFit(profile[t.key] as number | boolean);
    if (t.kind === 'scalar') return scalarFit(profile[t.key] as number | boolean);
    return traitFit(Number(profile[t.key]), { ...t, tLo: DEF.tol, tHi: DEF.tol }, sMin, sMax);
  };
  const gateTraitFits = new Map<string, number>();
  for (const t of spec.traits) gateTraitFits.set(t.key, gateFit(t));
  const gateBlocks = blockScores(spec, (t) => gateTraitFits.get(t.key)!);
  const knockouts = evalKnockouts(spec, gateBlocks, gateTraitFits);
  const knockoutFailed = knockouts.some((k) => !k.passed);
  const swing = semSwing(spec, profile);
  const borderline = band(swing.lo) !== betaBand || band(swing.hi) !== betaBand || band(swing.lo) !== band(swing.hi);
  const semDeltaPct = Math.round(((swing.hi - swing.lo) / 2) * 1000) / 10; // ± em pontos de Beta

  let recommendation: Recommendation;
  if (knockoutFailed) recommendation = 'nao_recomendado';
  else if (betaBand === 'verde') recommendation = 'recomendado';
  else if (betaBand === 'amarelo') recommendation = 'recomendado_com_ressalvas';
  else recommendation = 'nao_recomendado';

  // Status de 4 estados (desambigua o 'nao_recomendado' em bloqueado vs abaixo_do_corte).
  let status: Status;
  if (knockoutFailed) status = 'bloqueado';
  else if (betaBand === 'verde') status = 'recomendado';
  else if (betaBand === 'amarelo') status = 'recomendado_com_ressalvas';
  else status = 'abaixo_do_corte';

  // STATUS DRIVER-AWARE (v4). Um VERDE (Beta na banda alta) com um DRIVER em déficit
  // moderado+ (band trait — competência/DISC — com fit abaixo do limiar) NÃO é
  // "recomendado limpo": o Beta, sendo média ponderada, MASCARA o furo local (ex.:
  // Maria Aparecida, Beta 90 e Dominância 35%). Rebaixa p/ "com ressalvas" → entra no
  // plano e o selo passa a casar com a narrativa (que já citava o gap) e o plano (que
  // antes o abandonava). Só o verde precisa: amarelo já é ressalva, bloqueado é gate.
  // O limiar vem da spec (driverThreshold, v4=0,65 ⇒ crítico/moderado rebaixa, leve
  // não). Domain-agnostic: 'band' já exclui Mapeamento (binary/scalar) e Liderança (scalar).
  const driverTh = spec.driverThreshold ?? 0;
  if (driverTh > 0 && status === 'recomendado') {
    const driverDeficit = spec.traits.some((t) => t.kind === 'band' && (traitFits.get(t.key) ?? 1) < driverTh);
    if (driverDeficit) { status = 'recomendado_com_ressalvas'; recommendation = 'recomendado_com_ressalvas'; }
  }

  return {
    cargo: spec.cargo,
    traits,
    blocks,
    beta,
    betaPct: Math.round(beta * 1000) / 10, // 1 casa, ex: 77.3
    betaBand,
    knockouts,
    knockoutFailed,
    borderline,
    semDeltaPct,
    recommendation,
    status,
  };
}

// ── Rótulos legíveis ─────────────────────────────────────────────────────────
export const RECOMMENDATION_LABEL: Record<Recommendation, string> = {
  recomendado: 'Recomendado',
  recomendado_com_ressalvas: 'Recomendado com ressalvas',
  nao_recomendado: 'Não recomendado',
};

export const STATUS_LABEL: Record<Status, string> = {
  recomendado: 'Recomendado',
  recomendado_com_ressalvas: 'Recomendado com ressalvas',
  abaixo_do_corte: 'Abaixo do corte',
  bloqueado: 'Bloqueado',
};
