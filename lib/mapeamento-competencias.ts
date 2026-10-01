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

export type ProgressoMapeamento = { feitas: number; total: number };

/**
 * Quantas das competências do Top 5 do cargo cada pessoa já teve avaliadas.
 *
 * É a régua de `colaboradoresComMapeamentoCompleto` aberta em degraus: o
 * "completo" abaixo deriva DAQUI (`feitas === total`), então o parcial e o
 * completo nunca divergem. `total` é o tamanho do Top 5 do cargo (nem todo
 * cargo tem 5) e vem 0 quando o cargo não tem Top 5 definido, caso em que a
 * pessoa não tem como se mapear e não deve contar como "0 de 5".
 */
export function progressoMapeamentoPorPessoa(
  colaboradores: ColaboradorMapeamento[],
  cargos: CargoMapeamento[],
  assessments: AssessmentMapeamento[],
): Map<string, ProgressoMapeamento> {
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

  const progresso = new Map<string, ProgressoMapeamento>();
  for (const colaborador of colaboradores || []) {
    const esperado = top5PorCargo.get(chaveMapeamento(colaborador.cargo));
    if (!esperado?.size) {
      progresso.set(colaborador.id, { feitas: 0, total: 0 });
      continue;
    }
    const avaliadas = avaliadasPorPessoa.get(colaborador.id);
    const feitas = avaliadas ? [...esperado].filter((c) => avaliadas.has(c)).length : 0;
    progresso.set(colaborador.id, { feitas, total: esperado.size });
  }
  return progresso;
}

/** Agrupa o progresso em "N pessoas com X de Y", incluindo quem está em 0. */
export function distribuicaoMapeamento(
  progresso: Map<string, ProgressoMapeamento>,
): Array<ProgressoMapeamento & { pessoas: number }> {
  const grupos = new Map<string, ProgressoMapeamento & { pessoas: number }>();
  for (const { feitas, total } of progresso.values()) {
    const chave = `${feitas}/${total}`;
    const g = grupos.get(chave) || { feitas, total, pessoas: 0 };
    g.pessoas++;
    grupos.set(chave, g);
  }
  return [...grupos.values()].sort((a, b) => b.total - a.total || a.feitas - b.feitas);
}

export function colaboradoresComMapeamentoCompleto(
  colaboradores: ColaboradorMapeamento[],
  cargos: CargoMapeamento[],
  assessments: AssessmentMapeamento[],
): Set<string> {
  const completos = new Set<string>();
  for (const [id, { feitas, total }] of progressoMapeamentoPorPessoa(colaboradores, cargos, assessments)) {
    if (total > 0 && feitas === total) completos.add(id);
  }
  return completos;
}
