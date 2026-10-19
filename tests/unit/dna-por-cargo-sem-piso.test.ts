import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { aggregateDna, recortePorCargoDna } from '@/lib/dna-organizacional/aggregate';

/**
 * DNA Organizacional: recorte por cargo SEM piso (19/10/2026, Amazon Bowling).
 *
 * 14 avaliados em 11 cargos (4 + dez cargos de 1). Com o piso antigo (3) o PDF
 * só trazia o primeiro. O dono escolheu o recorte completo, como no Perfil
 * Organizacional, e o preço é a promessa: o PDF não pode mais se dizer anônimo.
 */

// Mock encadeável mínimo do supabase-js (mesmo molde de dna-referencias-anonimas).
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

const CARGOS_DE_UM = [
  'COORDENADOR DE EVENTOS', 'CAIXA', 'ADMINISTRATIVO - CONTÁBIL', 'GERENTE OPERACIONAL', 'SOCIOGESTOR 1',
  'SOCIOGESTOR 2', 'ADMINISTRATIVO - CAIXA / SISTEMA E RH', 'AUX. DE MANUTENÇÃO DE INFRAESTRUTURA E MECÂNICA',
  'SUP. DE MANUTENÇÃO - INFRA E MECÂNICA', 'SUP. DE MANUTENÇÃO - ELETRÔNICA E INFORMÁTICA',
];

function avaliacao(colaborador_id: string, nivel = 'em_desenvolvimento', nota = 2) {
  return { colaborador_id, competencia: 'Foco na experiência do cliente', descritor: 'Escuta ativa', nota, nivel, assessment_date: '2026-10-01' };
}

describe('DNA Organizacional: recorte por cargo sem piso', () => {
  it('traz TODOS os cargos com avaliação, inclusive os de 1 pessoa (Amazon Bowling, 19/10/2026)', async () => {
    const colabs = [
      ...Array.from({ length: 4 }, (_, i) => ({ id: `s${i}`, email: `s${i}@cliente.com`, cargo: 'SUPERVISÃO DE LOJA E OPERAÇÃO' })),
      ...CARGOS_DE_UM.map((cargo, i) => ({ id: `u${i}`, email: `u${i}@cliente.com`, cargo })),
    ];
    const dna = await aggregateDna(makeSb(colabs.map((c) => avaliacao(c.id)), colabs), 'emp-1');

    expect(dna.avaliados).toBe(14);
    expect(dna.porCargo).toHaveLength(11);
    expect((dna.porCargo || []).reduce((s, g) => s + g.avaliados, 0)).toBe(14); // ninguém some no recorte
    expect(dna.porCargo?.[0]).toMatchObject({ cargo: 'SUPERVISÃO DE LOJA E OPERAÇÃO', avaliados: 4 });
    expect((dna.porCargo || []).filter((g) => g.avaliados === 1)).toHaveLength(10);
  });

  it('o cargo de 1 pessoa carrega a distribuição dessa pessoa, não zeros', async () => {
    const colabs = [{ id: 'g1', email: 'g1@cliente.com', cargo: 'GERENTE OPERACIONAL' }];
    const dna = await aggregateDna(makeSb([avaliacao('g1', 'avancado', 4)], colabs), 'emp-1');
    const [g] = dna.porCargo || [];
    expect(g.avaliados).toBe(1);
    expect(g.dna.distGeralPct.n4).toBe(100);
    expect(g.dna.participacaoPct).toBe(100);
  });

  it('ordem estável: maior primeiro e, no empate, alfabética (o PDF não troca de ordem entre duas gerações)', () => {
    const cargoDe = (a: any) => a.cargo;
    const linhas = (ordem: [string, string][]) => ordem.map(([id, cargo]) => ({ ...avaliacao(id), cargo }));
    const a = recortePorCargoDna(linhas([['z', 'Zeta'], ['a', 'Alfa'], ['m1', 'Mu'], ['m2', 'Mu']]), cargoDe, new Map());
    const b = recortePorCargoDna(linhas([['m1', 'Mu'], ['a', 'Alfa'], ['m2', 'Mu'], ['z', 'Zeta']]), cargoDe, new Map());
    expect(a.map((g) => g.cargo)).toEqual(['Mu', 'Alfa', 'Zeta']);
    expect(b.map((g) => g.cargo)).toEqual(a.map((g) => g.cargo));
  });

  it('o PDF não promete anonimato que o recorte sem piso não entrega', () => {
    const pdf = readFileSync(path.join(process.cwd(), 'lib/dna-organizacional-pdf.tsx'), 'utf8');
    expect(pdf).not.toMatch(/an[oô]nim/i);
    expect(pdf).not.toMatch(/nenhum profissional é identificado/i);
    expect(pdf).not.toMatch(/menos de 3 pessoas/i);
    expect(pdf).toContain('Em cargos com 1 ou 2 pessoas, o recorte descreve essas pessoas, não uma tendência do grupo.');
  });
});
