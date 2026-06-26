/**
 * Adaptador: colaborador (colunas DISC/comp/lid) + gabarito → CandidateProfile.
 *
 * Produz EXATAMENTE as keys que lib/scoring/role-spec emite, para o profile casar
 * com o RoleSpec no motor:
 *   - comp_*  → score 0-100 da competência (band).
 *   - D|I|S|C → {d,i,s,c}_natural (band).
 *   - 'Lideranca' → fit 0..1 por distância vetorial colab × ideal (scalar).
 *   - map_<i> → 1/0: polo do colab (derivado do DISC) bate com o polo do cargo (binary).
 *
 * `colab` precisa trazer ao menos: d/i/s/c_natural, lid_*, comp_*.
 */
import {
  COMP_LABEL, LIDERANCA, destaquesBipolares, type DiscMedia,
} from '@/lib/perfil-organizacional/aggregate';
import type { CandidateProfile } from './engine';
import { LID_KEY, PARES_BIPOLARES, TELA3_KEY } from './role-spec';

const num = (v: any) => Number(v) || 0;
const norm = (s: any) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const LID_KEYS = Object.keys(LIDERANCA);

/** Fit 0..1 do estilo de liderança: 1 − Σ|dif|/200 (perfis normalizados p/ soma 100). */
export function liderancaFit(colab: any, gabarito: any): number {
  const idealRaw = LID_KEYS.map((k) => num(gabarito?.tela3?.[TELA3_KEY[k]]));
  const realRaw = LID_KEYS.map((k) => num(colab?.[k]));
  const idealSum = idealRaw.reduce((s, v) => s + v, 0);
  const realSum = realRaw.reduce((s, v) => s + v, 0);
  if (idealSum <= 0 || realSum <= 0) return 0;
  const ideal = idealRaw.map((v) => (v / idealSum) * 100);
  const real = realRaw.map((v) => (v / realSum) * 100);
  const difTotal = ideal.reduce((s, v, i) => s + Math.abs(v - real[i]), 0);
  return Math.max(0, 1 - difTotal / 200); // Σ|dif| ∈ [0,200] → fit ∈ [0,1]
}

export function buildCandidateProfile(colab: any, gabarito: any): CandidateProfile {
  const profile: CandidateProfile = {};

  // Competências (comp_*)
  for (const c of COMP_LABEL) profile[c.key] = num(colab[c.key]);

  // DISC (D/I/S/C)
  const m: DiscMedia = { d: num(colab.d_natural), i: num(colab.i_natural), s: num(colab.s_natural), c: num(colab.c_natural) };
  profile.D = Math.round(m.d); profile.I = Math.round(m.i); profile.S = Math.round(m.s); profile.C = Math.round(m.c);

  // Liderança (scalar 0..1)
  profile[LID_KEY] = liderancaFit(colab, gabarito);

  // Mapeamento (map_<i> 1/0) — mesmo índice/ordem do role-spec.
  const polos = destaquesBipolares(m);
  const caracs: any[] = gabarito?.tela1?.caracteristicas || (Array.isArray(gabarito?.tela1) ? gabarito.tela1 : []);
  caracs.forEach((c: any, i: number) => {
    const polo = norm(c.polo_escolhido ?? c.polo ?? c);
    const parIdx = PARES_BIPOLARES.findIndex((p) => norm(p.esquerda) === polo || norm(p.direita) === polo);
    if (parIdx < 0) return; // não mapeável → role-spec também não cria o trait
    const par = polos[parIdx];
    const colabNoPolo = norm(par.esquerda) === polo ? par.ladoEsquerdo : !par.ladoEsquerdo;
    profile[`map_${i}`] = colabNoPolo ? 1 : 0;
  });

  return profile;
}

/** Colunas mínimas que o profile consome (p/ montar SELECTs). */
export function candidateColumns(): string[] {
  return ['d_natural', 'i_natural', 's_natural', 'c_natural', ...LID_KEYS, ...COMP_LABEL.map((c) => c.key)];
}
