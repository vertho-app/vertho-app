import type { DemoRoster, DemoRosterCargo } from '@/lib/demo/rosters/types';

/**
 * Cargo que SÓ LIDERA: existe para adequação e gestão de equipe, não para
 * jornada. Não faz mapeamento, não responde situação, não ganha trilha nem PDI
 * individual; tem DISC e entra no ranking (o fit lê as colunas comportamentais).
 *
 * 🔴 A RÉGUA É UMA SÓ, E VALE EM TODOS OS PONTOS DO SEED. Até 16/09/2026 ela só
 * existia em `seedCargos`, que lê o fixture. O Gerente Comercial não passa por
 * lá: ele é CONSTRUÍDO (`insertDemoExtraRoles`), que gravava o Top 5 cheio sem
 * olhar a lista. Declarar o cargo em `cargosSemAssessment` não mudava nada no
 * banco, e o teste que cruza a lista com a degustação ficava verde do mesmo
 * jeito, porque compara código com código.
 */
export function cargoSemAssessment(
  roster: Pick<DemoRoster, 'cargosSemAssessment'>,
  cargo: string | null | undefined,
): boolean {
  const alvo = String(cargo ?? '').trim().toLocaleLowerCase('pt-BR');
  if (!alvo) return false;
  return (roster.cargosSemAssessment ?? []).some((nome) => nome.trim().toLocaleLowerCase('pt-BR') === alvo);
}

/**
 * Os campos de JORNADA de um cargo construído. As competências, os cenários, o
 * top 10 e o gabarito continuam sendo gravados para quem só lidera: o que some é
 * o Top 5 (a tela lê Top 5 vazio como "cargo sem competências para avaliar") e,
 * com ele, o foco.
 */
export function jornadaDoCargoConstruido(
  roster: Pick<DemoRoster, 'cargosSemAssessment'>,
  cargo: Pick<DemoRosterCargo, 'nome' | 'competencias' | 'competencias_foco'>,
): { top5_workshop: string[]; competencia_foco: string | null; competencias_foco: string[] } {
  if (cargoSemAssessment(roster, cargo.nome)) {
    return { top5_workshop: [], competencia_foco: null, competencias_foco: [] };
  }
  return {
    top5_workshop: cargo.competencias.map(([nome]) => nome),
    competencia_foco: cargo.competencias_foco[0] ?? null,
    competencias_foco: [...cargo.competencias_foco],
  };
}
