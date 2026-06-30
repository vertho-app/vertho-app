/**
 * Materialidade da recuperação de um traço saturado — SIMULAÇÃO ROTULADA (what-if).
 *
 * ⚠️ ÚNICA peça da calibração que TOCA O MOTOR. NÃO é engine-free e NÃO descreve o
 * resultado entregue — é um e-se: "SE o sinal saturado deste traço fosse recuperado
 * (ombro do trapézio empurrado pra cima, fazendo o gradiente viver onde a população
 * está), quantos candidatos cruzariam fronteira de COR?". Por isso vive SEPARADA do
 * diagnóstico engine-free (lib/calibracao/diagnostico) — o número que devolve é
 * HIPOTÉTICO, marcado `simulacao: true`. Não confundir com o resultado entregue.
 *
 * Duas lições embutidas (aprendidas a duras penas nesta calibração):
 *  - Mede em betaBand (COR), NÃO em status: status carrega o knockout e contamina.
 *  - SEGURA o gate no baseline: subir o ombro de um traço COM knockout move o gate
 *    (knockout_acoplado_piso); a materialidade quer o efeito do SCORE, não do gate.
 *    Por isso só conta cruzamentos entre os NÃO-bloqueados-no-baseline.
 */
import { buildRoleSpec } from '@/lib/scoring/role-spec';
import { buildCandidateProfile } from '@/lib/scoring/candidate';
import { scoreCandidate } from '@/lib/scoring/engine';

function percentil(vals: number[], p: number): number {
  if (!vals.length) return 0;
  const s = [...vals].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))];
}

export interface MaterialidadeResultado {
  traco: string;
  ombroBase: number | null;
  ombroRecuperado: number;
  percentilOmbro: number;
  naoBloqueados: number;
  cruzam: number;                 // quantos não-bloqueados mudam de banda de cor
  detalhe: { de: string; para: string; n: number }[];
  simulacao: true;                // SEMPRE true — é what-if, não resultado entregue
}

/**
 * Recupera UM traço (sobe o ombro pro percentil `percentilOmbro` dos brutos da população —
 * default p75: o quartil de cima satura, o resto ganha gradiente) e mede cruzamentos de cor.
 */
export function simularMaterialidade(
  gabarito: any,
  cargoNome: string,
  ehLideranca: boolean,
  colabs: any[],
  tracoKey: string,
  opts: { percentilOmbro?: number } = {},
): MaterialidadeResultado | null {
  const spec0 = buildRoleSpec(gabarito, cargoNome, { ehLideranca });
  if (!spec0) return null;
  const t = spec0.traits.find((x) => x.key === tracoKey) as any;
  if (!t || t.kind !== 'band') return null;

  const profiles = colabs.map((c) => buildCandidateProfile(c, gabarito));
  const r0 = profiles.map((p) => scoreCandidate(spec0, p));

  const brutos = profiles.map((p) => Number(p[tracoKey]) || 0);
  const pOmbro = opts.percentilOmbro ?? 0.75;
  const ombro = Math.round(percentil(brutos, pOmbro));

  const specR = { ...spec0, traits: spec0.traits.map((x) => (x.key === tracoKey ? { ...x, lo: ombro } : { ...x })) };
  const rR = profiles.map((p) => scoreCandidate(specR, p));

  const det = new Map<string, number>();
  let cruzam = 0, naoBloq = 0;
  for (let i = 0; i < r0.length; i++) {
    if (r0[i].knockoutFailed) continue;      // gate segurado no baseline
    naoBloq++;
    if (r0[i].betaBand !== rR[i].betaBand) {  // cruzamento em COR (betaBand), não status
      cruzam++;
      const k = `${r0[i].betaBand}→${rR[i].betaBand}`;
      det.set(k, (det.get(k) || 0) + 1);
    }
  }
  return {
    traco: t.label || tracoKey,
    ombroBase: t.lo ?? null,
    ombroRecuperado: ombro,
    percentilOmbro: pOmbro,
    naoBloqueados: naoBloq,
    cruzam,
    detalhe: [...det.entries()].map(([k, n]) => { const [de, para] = k.split('→'); return { de, para, n }; }),
    simulacao: true,
  };
}
