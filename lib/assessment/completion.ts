export type AssessmentCompetency = {
  id?: string | null;
  nome?: string | null;
};

export type AssessmentAnswerRef = {
  competencia_id?: string | null;
  competencia_nome?: string | null;
};

export function normalizeAssessmentCompetency(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('pt-BR');
}

/**
 * O catálogo pode ser recomposto mantendo o mesmo nome e recebendo outro UUID.
 * Uma resposta continua concluída quando aponta para o ID atual OU para o mesmo
 * nome normalizado. Isso também reconcilia imports legados sem reabrir uma
 * avaliação que a pessoa já terminou.
 */
export function findAssessmentAnswer<T extends AssessmentAnswerRef>(
  competency: AssessmentCompetency,
  answers: T[],
): T | undefined {
  if (competency.id) {
    const byId = answers.find((answer) => answer.competencia_id === competency.id);
    if (byId) return byId;
  }

  const normalizedName = normalizeAssessmentCompetency(competency.nome);
  if (!normalizedName) return undefined;
  return answers.find(
    (answer) => normalizeAssessmentCompetency(answer.competencia_nome) === normalizedName,
  );
}

export function assessmentCompetencyWasAnswered(
  competency: AssessmentCompetency,
  answers: AssessmentAnswerRef[],
): boolean {
  return Boolean(findAssessmentAnswer(competency, answers));
}
