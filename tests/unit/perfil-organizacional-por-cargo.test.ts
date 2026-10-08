import { describe, expect, it } from 'vitest';
import { recortePorCargo } from '@/lib/perfil-organizacional/aggregate';

function pessoa(cargo: string | null, d = 50) {
  return { nome_completo: 'Pessoa', cargo, d_natural: d, i_natural: 40, s_natural: 56, c_natural: 55 };
}

describe('Perfil Organizacional: recorte por cargo', () => {
  it('traz TODOS os cargos, inclusive os de 1 pessoa (Amazon Bowling, 08/10/2026)', () => {
    // 14 pessoas com DISC em 11 cargos: 4 + dez cargos de 1. Com o piso antigo (3) saía só o primeiro.
    const linhas = [
      ...Array.from({ length: 4 }, () => pessoa('SUPERVISÃO DE LOJA E OPERAÇÃO')),
      ...['COORDENADOR DE EVENTOS', 'CAIXA', 'ADMINISTRATIVO - CONTÁBIL', 'GERENTE OPERACIONAL', 'SOCIOGESTOR 1',
        'SOCIOGESTOR 2', 'ADMINISTRATIVO - CAIXA / SISTEMA E RH', 'AUX. DE MANUTENÇÃO DE INFRAESTRUTURA E MECÂNICA',
        'SUP. DE MANUTENÇÃO - INFRA E MECÂNICA', 'SUP. DE MANUTENÇÃO - ELETRÔNICA E INFORMÁTICA',
      ].map((c) => pessoa(c)),
    ];

    const r = recortePorCargo(linhas);

    expect(r).toHaveLength(11);
    expect(r.reduce((s, g) => s + g.n, 0)).toBe(14); // ninguém some no recorte
    expect(r[0].n).toBe(4);
    expect(r.filter((g) => g.n === 1)).toHaveLength(10);
  });

  it('cargo de 2 pessoas também aparece', () => {
    const r = recortePorCargo([pessoa('A'), pessoa('A'), pessoa('B'), pessoa('B'), pessoa('B')]);
    expect(r.map((g) => [g.cargo, g.n])).toEqual([['B', 3], ['A', 2]]);
  });

  it('o cargo de 1 pessoa carrega o perfil dessa pessoa, não zeros', () => {
    const [g] = recortePorCargo([pessoa('GERENTE OPERACIONAL', 78)]);
    expect(g.n).toBe(1);
    expect(g.perfil.natural.d).toBe(78);
    expect(g.perfil.avaliados).toBe(1);
  });

  it('ordem estável: maior primeiro e, no empate, alfabética (o PDF não troca de ordem entre duas gerações)', () => {
    const a = recortePorCargo([pessoa('Zeta'), pessoa('Alfa'), pessoa('Mu'), pessoa('Mu')]);
    const b = recortePorCargo([pessoa('Mu'), pessoa('Alfa'), pessoa('Mu'), pessoa('Zeta')]);
    expect(a.map((g) => g.cargo)).toEqual(['Mu', 'Alfa', 'Zeta']);
    expect(b.map((g) => g.cargo)).toEqual(a.map((g) => g.cargo));
  });

  it('cargo vazio ou só com espaços vira "(sem cargo)", agrupado junto', () => {
    const r = recortePorCargo([pessoa(null), pessoa('   '), pessoa('')]);
    expect(r).toHaveLength(1);
    expect(r[0].cargo).toBe('(sem cargo)');
    expect(r[0].n).toBe(3);
  });

  it('sem linhas, sem recorte', () => {
    expect(recortePorCargo([])).toEqual([]);
  });
});
