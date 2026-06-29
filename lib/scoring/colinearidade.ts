/**
 * Mede a colinearidade Mapeamento(contínuo) × DISC de UM gabarito contra uma
 * população de colaboradores. Registrada no spec no momento da criação (IA2) —
 * mesmo sem uso imediato — para acumular a base que torna o peso de Mapeamento
 * ADAPTATIVO por cargo trivial de ligar depois (colinearidade alta → peso menor).
 *
 * Por quê: o Mapeamento é 100% derivado do DISC, mas o GRAU de redundância varia
 * por cargo — cargos de arquétipo "afiado" (ex.: Diretor Geral, polos fortemente
 * D/liderança) deram ~0,70 vs ~0,51-0,62 nos comerciais. Guardar o número na
 * criação evita reconstrução cara depois.
 *
 * Amostra real-only (exclui simulados) e ≥10; abaixo disso retorna null (ruído).
 */
import { buildRoleSpec, BLOCK } from './role-spec';
import { buildCandidateProfile } from './candidate';
import { scoreCandidate } from './engine';

const N_MINIMO = 10;

function pearson(a: number[], b: number[]): number {
  const n = a.length;
  const ma = a.reduce((x, y) => x + y, 0) / n;
  const mb = b.reduce((x, y) => x + y, 0) / n;
  let cov = 0, va = 0, vb = 0;
  for (let i = 0; i < n; i++) { cov += (a[i] - ma) * (b[i] - mb); va += (a[i] - ma) ** 2; vb += (b[i] - mb) ** 2; }
  return cov / Math.sqrt(va * vb || 1);
}

export interface MetricaColinearidade { map_disc: number | null; n: number; medido_em: string }

/** Pearson(Map contínuo × DISC) do gabarito (spec v2) sobre `colabs`. null se n<10. */
export function medirColinearidadeMapDisc(
  gabarito: any, cargoNome: string, colabs: any[], ehLideranca?: boolean, agoraISO?: string,
): MetricaColinearidade {
  const medido_em = agoraISO || new Date().toISOString();
  const spec = buildRoleSpec(gabarito, cargoNome, { ehLideranca, specVersion: 2 });
  if (!spec) return { map_disc: null, n: 0, medido_em };
  const mapc: number[] = [], disc: number[] = [];
  for (const col of colabs) {
    const r = scoreCandidate(spec, buildCandidateProfile(col, gabarito, 2));
    const m = r.blocks.find((b) => b.block === BLOCK.MAP)?.score;
    const d = r.blocks.find((b) => b.block === BLOCK.DISC)?.score;
    if (m == null || d == null) continue;
    mapc.push(m); disc.push(d);
  }
  if (mapc.length < N_MINIMO) return { map_disc: null, n: mapc.length, medido_em };
  return { map_disc: Math.round(pearson(mapc, disc) * 1000) / 1000, n: mapc.length, medido_em };
}
