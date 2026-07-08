/**
 * Fonte ÚNICA das competências foco de um cargo (Fase 0, item D).
 *
 * PDI (gerarRelatorioIndividual) e trilha (gerarTemporadaRegularDuo) leem daqui
 * — assim o que está no PDI bate com a trilha, independente de qual é gerado
 * primeiro. `competencias_foco` (array, mig 174) é a verdade; `competencia_foco`
 * (single, mig 030) é fallback backward-compat.
 *
 * DUO (padrão) usa 2; single usa 1. Máx. 2 na curadoria por cargo.
 */
export const MAX_FOCO = 2;

export interface CargoFocoRow {
  competencias_foco?: string[] | null;
  competencia_foco?: string | null;
}

/** Competências foco do cargo, em ordem, sem vazios/duplicatas. */
export function focoDoCargo(cargo: CargoFocoRow | null | undefined): string[] {
  if (!cargo) return [];
  const arr = Array.isArray(cargo.competencias_foco)
    ? cargo.competencias_foco.map((s) => (s || '').toString().trim()).filter(Boolean)
    : [];
  const base = arr.length
    ? arr
    : (cargo.competencia_foco ? [cargo.competencia_foco.toString().trim()] : []);
  return [...new Set(base.filter(Boolean))];
}
