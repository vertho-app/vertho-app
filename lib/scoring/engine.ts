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
function isBorderline(spec: RoleSpec, profile: CandidateProfile, betaBand: ColorBand): boolean {
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

  const pessimista = colorBand(shifted(-1));
  const otimista = colorBand(shifted(1));
  return pessimista !== otimista || pessimista !== betaBand || otimista !== betaBand;
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
    band: colorBand(b.score),
    weight: Math.round((b.weight / wsum) * 1000) / 1000,
  }));

  const beta = betaFrom(rawBlocks);
  const betaBand = colorBand(beta);

  const knockouts = evalKnockouts(spec, rawBlocks, traitFits);
  const knockoutFailed = knockouts.some((k) => !k.passed);
  const borderline = isBorderline(spec, profile, betaBand);

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
