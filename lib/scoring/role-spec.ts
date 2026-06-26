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

export const BLOCK = { MAP: 'Mapeamento', COMP: 'Competencia', LID: 'Lideranca', DISC: 'DISC' } as const;
export const LID_KEY = 'Lideranca';

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
}

export function buildRoleSpec(gabarito: any, cargoNome: string, opts: BuildRoleSpecOpts = {}): RoleSpec | null {
  const g = typeof gabarito === 'string' ? safeParse(gabarito) : gabarito;
  if (!g?.tela4) return null;

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
    const polo = norm(c.polo_escolhido ?? c.polo ?? c);
    const par = PARES_BIPOLARES.find((p) => norm(p.esquerda) === polo || norm(p.direita) === polo);
    if (!par) return; // polo não mapeável → não entra (não penaliza)
    traits.push({
      key: `map_${i}`, block: BLOCK.MAP, kind: 'binary',
      weight: INTENSIDADE_W[norm(c.intensidade)] ?? 1,
      label: c.polo_escolhido ?? c.polo ?? '',
    });
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

  // ── Knockouts (IA quando presente) ─────────────────────────────────────────
  const knockouts: KnockoutRule[] = Array.isArray(g.knockouts)
    ? g.knockouts.map((k: any) => ({
        scope: norm(k.scope) === 'trait' ? 'trait' : 'block',
        key: normBlockKey(k.key),
        min: Math.max(0, Math.min(1, num(k.min))),
        label: k.label || undefined,
      })).filter((k: KnockoutRule) => k.key && k.min > 0)
    : [];

  return {
    cargo: cargoNome,
    sem: num(g.sem) || undefined,
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
