import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  assessmentCompetencyWasAnswered,
  findAssessmentAnswer,
  normalizeAssessmentCompetency,
} from '@/lib/assessment/completion';

describe('conclusão da avaliação por competência', () => {
  it('prioriza o UUID atual quando ele coincide', () => {
    const answer = { competencia_id: 'id-atual', competencia_nome: 'Nome legado' };
    expect(findAssessmentAnswer({ id: 'id-atual', nome: 'Nome atual' }, [answer])).toBe(answer);
  });

  it('mantém concluída uma resposta quando o catálogo troca o UUID mas preserva o nome', () => {
    const answers = [{
      competencia_id: 'uuid-antigo',
      competencia_nome: 'Comunicação e Apresentação de Valor',
    }];
    expect(assessmentCompetencyWasAnswered({
      id: 'uuid-novo',
      nome: 'comunicacao e apresentacao de valor',
    }, answers)).toBe(true);
  });

  it('não confunde competências diferentes', () => {
    expect(assessmentCompetencyWasAnswered(
      { id: 'uuid-novo', nome: 'Negociação e Fechamento' },
      [{ competencia_id: 'uuid-antigo', competencia_nome: 'Relacionamento e Pós-venda' }],
    )).toBe(false);
  });

  it('normaliza acentos, espaços e caixa sem apagar o conteúdo', () => {
    expect(normalizeAssessmentCompetency('  Resiliência E Constância  ')).toBe('resiliencia e constancia');
  });

  // A rota legada `/api/assessment` foi aposentada em 03/10/2026 (R-81): a action
  // do dashboard é o único caminho que serve e grava o cenário A.
  it('a action do dashboard aplica a regra', () => {
    const action = readFileSync('app/dashboard/assessment/assessment-actions.ts', 'utf8');
    expect(action).toContain('assessmentCompetencyWasAnswered');
  });
});
