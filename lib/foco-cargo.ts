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

/**
 * As DUAS colunas do foco, sempre juntas (R-85, 03/10/2026). Havia dois escritores:
 * `/admin/cargos` gravava as duas, e o seletor do pipeline (`salvarCompetenciaFoco`)
 * gravava só `competencia_foco`. Como `focoDoCargo` prefere o array, PDI e blueprint
 * seguiam o foco ANTIGO enquanto a trilha da Jornada (que lia a coluna simples) seguia
 * o novo: os dois falavam de competências diferentes. Todo escritor passa por aqui.
 */
export function colunasDoFoco(foco: Array<string | null | undefined>): { competencias_foco: string[]; competencia_foco: string | null } {
  const limpa = [...new Set(foco.map((s) => (s || '').toString().trim()).filter(Boolean))].slice(0, MAX_FOCO);
  return { competencias_foco: limpa, competencia_foco: limpa[0] || null };
}

/**
 * Trocar SÓ o foco principal (o seletor único do pipeline) sem perder o 2º definido em
 * `/admin/cargos`: o escolhido vai para a frente e os outros seguem atrás. "Sem foco"
 * limpa o cargo inteiro, que é o que a opção diz.
 */
export function focoComPrincipal(atual: CargoFocoRow | null | undefined, principal: string | null | undefined): string[] {
  const p = (principal || '').toString().trim();
  if (!p) return [];
  return [p, ...focoDoCargo(atual).filter((c) => c !== p)].slice(0, MAX_FOCO);
}
