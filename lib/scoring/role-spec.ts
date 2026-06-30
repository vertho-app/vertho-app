/**
 * Adaptador: gabarito (perfil ideal do cargo, telas 1-4) → RoleSpec do motor.
 *
 * - Competência (tela2) e DISC (tela4) viram BAND traits, com `direction`
 *   (floor/target/ceiling) emitida pela IA quando presente, ou INFERIDA da
 *   posição da faixa para gabaritos legados.
 * - Liderança (tela3) vira UM trait SCALAR contínuo (o fit é calculado no
 *   adaptador do candidato por distância vetorial — ver lib/scoring/candidate).
 * - Mapeamento (tela1) vira BINARY traits (polo bate / não bate).
 * - Pesos de bloco e knockouts vêm da IA quando presentes; senão, defaults.
 *
 * O esquema de KEYS é determinístico e compartilhado com lib/scoring/candidate
 * (comp_* / D|I|S|C / 'Lideranca' / map_<i>) para o profile casar com o spec.
 */
import {
  COMP_LABEL, LIDERANCA, destaquesBipolares, type DiscMedia,
} from '@/lib/perfil-organizacional/aggregate';
import type { RoleSpec, TraitSpec, Direction, KnockoutRule, BlockName } from './engine';
import { poloReconhecivel } from './mapeamento-polos';

export const BLOCK = { MAP: 'Mapeamento', COMP: 'Competencia', LID: 'Lideranca', DISC: 'DISC' } as const;
export const LID_KEY = 'Lideranca';
/**
 * Versão atual da spec de scoring.
 *  v2 (27/06): Mapeamento contínuo + peso rebaixado (cap 0,20).
 *  v3        : revisões clínicas por-gabarito (direção/teto; editadas no JSON, sem lógica nova).
 *  v4 (29/06): RÉGUA re-ancorada — rampa 20→30 + cortes 0,85/0,60 → 0,865/0,754.
 *              Motivo medido (e-se da tolerância de ramp): o motor contínuo é uma
 *              TRANSLAÇÃO de +~1,5 (Spearman 0,988, sem distorção de forma), então a
 *              rampa curta achatava o "moderadamente fora" e os cortes herdados inflavam
 *              o verde. Preservar significado = preservar proporção aqui (convergem).
 *              Versionado p/ CONGELAR histórico: gabaritos v<4 mantêm a régua antiga.
 */
export const LATEST_SPEC_VERSION = 4;
/** Teto de peso do bloco Mapeamento na v2 (é lente derivada do DISC; surplus vai p/ Competência). */
const MAP_WEIGHT_CAP_V2 = 0.20;

/** Régua de cor + rampa por versão da spec. v<4 = legado (motor binário re-ancorado em 26/06). */
function reguaDe(specVersion: number): { tol: number; bandHigh: number; bandMid: number } {
  return specVersion >= 4
    ? { tol: 30, bandHigh: 0.865, bandMid: 0.754 } // 0,754 = quantil amarelo MEDIDO (não 0,755 redondo → +0 vermelho)
    : { tol: 20, bandHigh: 0.85, bandMid: 0.60 };
}

const norm = (s: any) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const num = (v: any) => Number(v) || 0;
const FATOR_NOME: Record<'D' | 'I' | 'S' | 'C', string> = { D: 'Dominância', I: 'Influência', S: 'Estabilidade', C: 'Conformidade' };
const LID_KEYS = Object.keys(LIDERANCA); // lid_executivo, lid_motivador, lid_metodico, lid_sistematico
// tela3 usa "executor"; coluna é lid_executivo — mapa explícito.
export const TELA3_KEY: Record<string, string> = { lid_executivo: 'executor', lid_motivador: 'motivador', lid_metodico: 'metodico', lid_sistematico: 'sistematico' };

/** Rótulos constantes dos pares bipolares (independem do DISC do colab). */
export const PARES_BIPOLARES = destaquesBipolares({ d: 0, i: 0, s: 0, c: 0 } as DiscMedia)
  .map((p) => ({ esquerda: p.esquerda, direita: p.direita }));

/** "Alto (41-60)" / "Muito alto (61-80)" → {lo, hi}. Sem parse → faixa ampla. */
export function parseFaixa(s: any): { lo: number; hi: number } {
  const m = String(s || '').match(/\(?\s*(\d{1,3})\s*[-–a]\s*(\d{1,3})\s*\)?/);
  if (m) return { lo: Number(m[1]), hi: Number(m[2]) };
  return { lo: 0, hi: 100 };
}
/** Faixa-alvo de um item = [min do limite inferior, max do limite superior]. */
export function faixaDe(minStr: any, maxStr: any): { min: number; max: number } {
  const lo = parseFaixa(minStr).lo;
  const hi = parseFaixa(maxStr).hi;
  return { min: Math.min(lo, hi), max: Math.max(lo, hi) };
}

/** Normaliza direção emitida pela IA (PT ou EN) → Direction | undefined. */
function normDir(v: any): Direction | undefined {
  const s = norm(v);
  if (!s) return undefined;
  if (s.startsWith('floor') || s.startsWith('piso') || s.includes('quanto mais')) return 'floor';
  if (s.startsWith('ceil') || s.startsWith('teto') || s.includes('manter baixo') || s.includes('moderad')) return 'ceiling';
  if (s.startsWith('target') || s.startsWith('alvo') || s.startsWith('centro') || s.startsWith('ideal')) return 'target';
  return undefined;
}

const PRIORIDADE_W: Record<string, number> = { alta: 2, media: 1.3, baixa: 0.8 };
const INTENSIDADE_W: Record<string, number> = { forte: 2, intensa: 2, moderada: 1, media: 1, leve: 0.6, sutil: 0.6 };

const DEFAULT_BLOCK_WEIGHTS_LIDER: Record<BlockName, number> = { Competencia: 0.30, Lideranca: 0.25, DISC: 0.25, Mapeamento: 0.20 };
const DEFAULT_BLOCK_WEIGHTS_NAO_LIDER: Record<BlockName, number> = { Competencia: 0.42, DISC: 0.32, Mapeamento: 0.26 };

/** Mapa nome de competência (normalizado) → coluna comp_*. */
const COMP_KEY_DE = new Map(COMP_LABEL.map((c) => [norm(c.nome), c.key]));

export interface BuildRoleSpecOpts {
  /** false → cargo não-líder: dropa o bloco de Liderança e redistribui pesos. */
  ehLideranca?: boolean;
  /** força uma spec_version (override do gabarito.spec_version). */
  specVersion?: number;
}

export function buildRoleSpec(gabarito: any, cargoNome: string, opts: BuildRoleSpecOpts = {}): RoleSpec | null {
  const g = typeof gabarito === 'string' ? safeParse(gabarito) : gabarito;
  if (!g?.tela4) return null;

  // spec_version rege Mapeamento (binário v1 vs contínuo v2) e o teto de peso.
  const specVersion = Math.max(1, Number(opts.specVersion ?? g.spec_version ?? 1) || 1);
  const mapKind: 'binary' | 'scalar' = specVersion >= 2 ? 'scalar' : 'binary';

  const traits: TraitSpec[] = [];

  // ── Competência (tela2) → band traits ──────────────────────────────────────
  const subcomps: any[] = g.tela2?.subcompetencias || (Array.isArray(g.tela2) ? g.tela2 : []);
  for (const c of subcomps) {
    const key = COMP_KEY_DE.get(norm(c.nome));
    if (!key) continue; // nome fora da lista oficial → ignora
    const { min, max } = faixaDe(c.faixa_min, c.faixa_max);
    traits.push({
      key, block: BLOCK.COMP, kind: 'band', lo: min, hi: max,
      direction: normDir(c.direcao ?? c.direction),
      weight: PRIORIDADE_W[norm(c.prioridade)] ?? 1,
      label: c.nome,
    });
  }

  // ── DISC (tela4) → band traits ─────────────────────────────────────────────
  for (const f of ['D', 'I', 'S', 'C'] as const) {
    const fx = g.tela4?.[f];
    if (!fx) continue;
    const { min, max } = faixaDe(fx.min, fx.max);
    traits.push({
      key: f, block: BLOCK.DISC, kind: 'band', lo: min, hi: max,
      direction: normDir(fx.direcao ?? fx.direction),
      label: `${f} — ${FATOR_NOME[f]}`,
    });
  }

  // ── Liderança (tela3) → 1 scalar trait (fit calculado no candidato) ────────
  const idealLidTotal = LID_KEYS.reduce((s, k) => s + num(g.tela3?.[TELA3_KEY[k]]), 0);
  const ehLider = opts.ehLideranca !== false && idealLidTotal > 0;
  if (ehLider) {
    traits.push({ key: LID_KEY, block: BLOCK.LID, kind: 'scalar', label: 'Estilo de liderança' });
  }

  // ── Mapeamento (tela1) → binary traits (só polos reconhecíveis) ────────────
  const caracs: any[] = g.tela1?.caracteristicas || (Array.isArray(g.tela1) ? g.tela1 : []);
  caracs.forEach((c: any, i: number) => {
    const polo = c.polo_escolhido ?? c.polo ?? c;
    if (!poloReconhecivel(polo)) return; // polo não mapeável → não entra (não penaliza)
    traits.push({
      key: `map_${i}`, block: BLOCK.MAP, kind: mapKind, // v1 binary / v2 scalar (contínuo)
      weight: INTENSIDADE_W[norm(c.intensidade)] ?? 1,
      label: c.polo_escolhido ?? c.polo ?? '',
    } as TraitSpec);
  });

  // ── Pesos de bloco ─────────────────────────────────────────────────────────
  let blockWeights: Record<BlockName, number>;
  if (g.pesos_blocos && typeof g.pesos_blocos === 'object') {
    const p = g.pesos_blocos;
    blockWeights = {
      Competencia: num(p.competencia ?? p.competencias),
      Lideranca: num(p.lideranca),
      DISC: num(p.disc),
      Mapeamento: num(p.mapeamento),
    };
    if (!ehLider) blockWeights.Lideranca = 0;
  } else {
    blockWeights = ehLider ? { ...DEFAULT_BLOCK_WEIGHTS_LIDER } : { ...DEFAULT_BLOCK_WEIGHTS_NAO_LIDER };
  }

  // v2: Mapeamento é lente derivada do DISC → teto de 0,20; surplus vai p/ Competência
  // (bloco de instrumento independente). Vale tanto p/ pesos da IA quanto defaults.
  if (specVersion >= 2 && num(blockWeights.Mapeamento) > MAP_WEIGHT_CAP_V2) {
    const surplus = num(blockWeights.Mapeamento) - MAP_WEIGHT_CAP_V2;
    blockWeights.Mapeamento = MAP_WEIGHT_CAP_V2;
    blockWeights.Competencia = num(blockWeights.Competencia) + surplus;
  }

  // ── Knockouts (IA quando presente) ─────────────────────────────────────────
  // A IA emite trait-scoped com o NOME da competência ("Persistência") ou letra
  // DISC; o motor usa keys comp_*/D|I|S|C. Resolve e DESCARTA o que não casa com
  // um traço/bloco existente (ex.: liderança em cargo não-líder) — senão a
  // eliminatória zeraria todo mundo.
  const traitKeySet = new Set(traits.map((t) => t.key));
  const presentBlocks = new Set(traits.map((t) => t.block));
  const resolveKO = (scope: string, key: any): string => {
    if (scope === 'trait') {
      const byComp = COMP_KEY_DE.get(norm(key));
      if (byComp) return byComp;
      const up = String(key || '').trim().toUpperCase();
      if (['D', 'I', 'S', 'C'].includes(up)) return up;
      return String(key || '');
    }
    return normBlockKey(key);
  };
  const knockouts: KnockoutRule[] = Array.isArray(g.knockouts)
    ? g.knockouts.map((k: any) => {
        const scope: 'block' | 'trait' = norm(k.scope) === 'trait' ? 'trait' : 'block';
        return { scope, key: resolveKO(scope, k.key), min: Math.max(0, Math.min(1, num(k.min))), label: k.label || undefined };
      }).filter((k: KnockoutRule) => k.min > 0 && (k.scope === 'trait' ? traitKeySet.has(k.key) : presentBlocks.has(k.key)))
    : [];

  // ── Régua versionada (rampa + cortes) ──────────────────────────────────────
  // v4: alarga a rampa default 20→30 em todo band trait SEM override explícito —
  // restaura gradiente do "moderadamente fora" sem tocar no gate (gate é binário
  // sobre o mín%, não escorrega com a tolerância do floor — provado no e-se).
  const regua = reguaDe(specVersion);
  if (regua.tol !== 20) {
    for (const t of traits) {
      if (t.kind === 'band') {
        if (t.tLo == null) t.tLo = regua.tol;
        if (t.tHi == null) t.tHi = regua.tol;
      }
    }
  }

  return {
    cargo: cargoNome,
    specVersion,
    sem: num(g.sem) || undefined,
    bandHigh: regua.bandHigh,
    bandMid: regua.bandMid,
    tol: regua.tol,
    traits,
    blockWeights,
    knockouts,
  };
}

/** Normaliza chave de bloco vinda da IA p/ os nomes canônicos do motor. */
function normBlockKey(k: any): string {
  const s = norm(k);
  if (s.startsWith('compet')) return BLOCK.COMP;
  if (s.startsWith('lider')) return BLOCK.LID;
  if (s === 'disc') return BLOCK.DISC;
  if (s.startsWith('mapea')) return BLOCK.MAP;
  return k; // trait key (comp_*, D, etc.)
}

function safeParse(s: string): any { try { return JSON.parse(s); } catch { return null; } }
