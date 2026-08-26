import { describe, it, expect } from 'vitest';
import { aggregateDna } from '@/lib/dna-organizacional/aggregate';

/**
 * "Profissionais referência" agregados e ANÔNIMOS (opção escolhida em 20/07/2026).
 *
 * O Retrato de Competências imprime "Nenhum profissional é identificado" no
 * próprio corpo, então o reconhecimento de quem já está em N3/N4 é por
 * CONTAGEM + cargo + competência. Este teste existe para que uma refatoração
 * futura não transforme isso numa lista nominal sem alguém perceber.
 */

// Mock encadeável mínimo do supabase-js (padrão de tests/unit/piloto/).
function makeSb(assessments: any[], colaboradores: any[]) {
  return {
    from(table: string) {
      const rows = table === 'descriptor_assessments' ? assessments : colaboradores;
      const chain: any = {
        select: () => chain,
        eq: () => Promise.resolve({ data: rows, error: null }),
      };
      return chain;
    },
  } as any;
}

const COLABS = [
  { id: 'c1', email: 'ana@escola.br', cargo: 'Gestão Escolar' },
  { id: 'c2', email: 'bruno@escola.br', cargo: 'Gestão Escolar' },
  { id: 'c3', email: 'carla@escola.br', cargo: 'Coordenação' },
];

// c1 e c2 chegam a N3 em Planejamento; c3 fica em N1.
const ASSESS = [
  { colaborador_id: 'c1', competencia: 'Planejamento e Organização', descritor: 'Gestão de riscos', nota: 3.7, nivel: 'avancado', assessment_date: '2026-07-01' },
  { colaborador_id: 'c1', competencia: 'Planejamento e Organização', descritor: 'Organização do plano', nota: 3.5, nivel: 'avancado', assessment_date: '2026-07-01' },
  { colaborador_id: 'c2', competencia: 'Planejamento e Organização', descritor: 'Gestão de riscos', nota: 3.0, nivel: 'proficiente', assessment_date: '2026-07-01' },
  { colaborador_id: 'c3', competencia: 'Autocuidado', descritor: 'Busca de apoio', nota: 1.0, nivel: 'inicial', assessment_date: '2026-07-01' },
];

describe('referencias anônimas do DNA', () => {
  it('conta PESSOAS distintas por (cargo × competência), não avaliações', async () => {
    const dna = await aggregateDna(makeSb(ASSESS, COLABS), 'emp-1');
    const ref = (dna.referencias || []).find(
      (r) => r.cargo === 'Gestão Escolar' && r.competencia === 'Planejamento e Organização',
    );
    // c1 tem DUAS avaliações em N3 e c2 tem uma → 2 pessoas, não 3 avaliações.
    expect(ref?.pessoas).toBe(2);
  });

  it('não expõe nenhum identificador de pessoa', async () => {
    const dna = await aggregateDna(makeSb(ASSESS, COLABS), 'emp-1');
    const serial = JSON.stringify(dna.referencias || []);
    for (const id of ['c1', 'c2', 'c3', 'ana@escola.br', 'bruno@escola.br', 'carla@escola.br']) {
      expect(serial).not.toContain(id);
    }
  });

  it('quem está abaixo de N3 não vira referência', async () => {
    const dna = await aggregateDna(makeSb(ASSESS, COLABS), 'emp-1');
    expect((dna.referencias || []).some((r) => r.cargo === 'Coordenação')).toBe(false);
  });

  it('sem ninguém em N3/N4 a lista fica vazia (nada a inventar)', async () => {
    const soN1 = [{ ...ASSESS[3] }];
    const dna = await aggregateDna(makeSb(soN1, COLABS), 'emp-1');
    expect(dna.referencias || []).toHaveLength(0);
  });

  it('exclui a conta de RH do numerador e do denominador do diagnóstico', async () => {
    const rh = { id: 'rh1', email: 'rh@escola.br', cargo: 'RH', role: 'rh' };
    const avaliacaoRh = {
      colaborador_id: 'rh1', competencia: 'Gestão de Pessoas', descritor: 'Acompanhamento',
      nota: 4, nivel: 'avancado', assessment_date: '2026-07-01',
    };
    const dna = await aggregateDna(makeSb([...ASSESS, avaliacaoRh], [...COLABS, rh]), 'emp-1');
    expect(dna.totalColaboradores).toBe(3);
    expect(dna.avaliados).toBe(3);
    expect(dna.competencias.some((competencia) => competencia.nome === 'Gestão de Pessoas')).toBe(false);
  });
});
