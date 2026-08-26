/**
 * Fonte única para decidir se o mapeamento de competências foi concluído.
 *
 * A avaliação do produto percorre o `top5_workshop` do cargo. Ter uma linha em
 * `descriptor_assessments` significa apenas que ao menos uma competência foi
 * avaliada; não significa que a pessoa terminou o Top 5. Gestor, RH e demo
 * precisam usar a mesma régua da tela do colaborador.
 */

export type ColaboradorMapeamento = {
  id: string;
  cargo?: string | null;
};

export type CargoMapeamento = {
  nome?: string | null;
  top5_workshop?: unknown;
};

export type AssessmentMapeamento = {
  colaborador_id?: string | null;
  competencia?: string | null;
};

export const chaveMapeamento = (value: unknown): string =>
  String(value || '').trim().toLocaleLowerCase('pt-BR');

export function colaboradoresComMapeamentoCompleto(
  colaboradores: ColaboradorMapeamento[],
  cargos: CargoMapeamento[],
  assessments: AssessmentMapeamento[],
): Set<string> {
  const top5PorCargo = new Map<string, Set<string>>();
  for (const cargo of cargos || []) {
    const nome = chaveMapeamento(cargo.nome);
    const top5 = Array.isArray(cargo.top5_workshop)
      ? cargo.top5_workshop.map(chaveMapeamento).filter(Boolean)
      : [];
    if (nome && top5.length > 0) top5PorCargo.set(nome, new Set(top5));
  }

  const avaliadasPorPessoa = new Map<string, Set<string>>();
  for (const assessment of assessments || []) {
    const colaboradorId = String(assessment.colaborador_id || '');
    const competencia = chaveMapeamento(assessment.competencia);
    if (!colaboradorId || !competencia) continue;
    if (!avaliadasPorPessoa.has(colaboradorId)) avaliadasPorPessoa.set(colaboradorId, new Set());
    avaliadasPorPessoa.get(colaboradorId)!.add(competencia);
  }

  const completos = new Set<string>();
  for (const colaborador of colaboradores || []) {
    const esperado = top5PorCargo.get(chaveMapeamento(colaborador.cargo));
    const avaliadas = avaliadasPorPessoa.get(colaborador.id);
    if (!esperado?.size || !avaliadas) continue;
    if ([...esperado].every((competencia) => avaliadas.has(competencia))) {
      completos.add(colaborador.id);
    }
  }
  return completos;
}
