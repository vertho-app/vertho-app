/**
 * Benchmarks oficiais do ICA por UF e Brasil (rede pública).
 * Fonte: MEC — "Resultados e Metas UFs 2025 v1.xlsx" (divulgação oficial).
 *
 * Aplicar em diag_ica_snapshots quando o CSV/XLSX importado não trouxer
 * as colunas TX_ALFABETIZACAO_UF / TX_ALFABETIZACAO_BR.
 *
 * Estrutura: { UF: { ano: pct } }, Brasil em ICA_BENCH_BRASIL.
 */

export const ICA_BENCH_BRASIL: Record<number, number> = {
  2023: 56,
  2024: 59,
  2025: 66,
};

export const ICA_BENCH_UF: Record<string, Record<number, number | null>> = {
  AC: { 2023: null, 2024: 51, 2025: 68 },
  AL: { 2023: 44, 2024: 49, 2025: 64 },
  AM: { 2023: 52, 2024: 49, 2025: 57 },
  AP: { 2023: 42, 2024: 47, 2025: 60 },
  BA: { 2023: 37, 2024: 36, 2025: 55 },
  CE: { 2023: 85, 2024: 86, 2025: 89 },
  DF: { 2023: 65, 2024: 67, 2025: 73 },
  ES: { 2023: 66, 2024: 64, 2025: 70 },
  GO: { 2023: 56, 2024: 60, 2025: 67 },
  MA: { 2023: 33, 2024: 35, 2025: 51 },
  MG: { 2023: 60, 2024: 72, 2025: 74 },
  MS: { 2023: 64, 2024: 68, 2025: 73 },
  MT: { 2023: 47, 2024: 60, 2025: 70 },
  PA: { 2023: 31, 2024: 28, 2025: 47 },
  PB: { 2023: 41, 2024: 49, 2025: 64 },
  PE: { 2023: 66, 2024: 71, 2025: 76 },
  PI: { 2023: 68, 2024: 70, 2025: 76 },
  PR: { 2023: 74, 2024: 76, 2025: 80 },
  RJ: { 2023: 53, 2024: 55, 2025: 64 },
  RN: { 2023: 37, 2024: 50, 2025: 64 },
  RO: { 2023: 66, 2024: 69, 2025: 75 },
  RR: { 2023: 38, 2024: 39, 2025: 50 },
  RS: { 2023: 51, 2024: 60, 2025: 70 },
  SC: { 2023: 73, 2024: 79, 2025: 83 },
  SE: { 2023: 50, 2024: 51, 2025: 64 },
  SP: { 2023: 52, 2024: 58, 2025: 61 },
  TO: { 2023: 56, 2024: 64, 2025: 71 },
};

export function benchUF(uf: string, ano: number): number | null {
  return ICA_BENCH_UF[uf]?.[ano] ?? null;
}

export function benchBR(ano: number): number | null {
  return ICA_BENCH_BRASIL[ano] ?? null;
}
