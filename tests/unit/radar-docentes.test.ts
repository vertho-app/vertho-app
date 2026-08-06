import { describe, it, expect } from 'vitest';

import {
  agregarDocentes,
  consolidarPorRede,
  temVinculoDeclarado,
  type DocentesAggRow,
} from '@/lib/radar/docentes';

function linha(over: Partial<DocentesAggRow> = {}): DocentesAggRow {
  return {
    rede: 'MUNICIPAL',
    ano: 2025,
    escolas_com_dado: 1,
    docentes_total: 0,
    docentes_infantil: 0,
    docentes_fundamental: 0,
    docentes_medio: 0,
    docentes_superior: 0,
    docentes_licenciatura: 0,
    docentes_especializacao: 0,
    docentes_mestrado: 0,
    docentes_doutorado: 0,
    docentes_concursados: 0,
    docentes_contrato: 0,
    docentes_terceirizados: 0,
    docentes_clt: 0,
    docentes_ate_29: 0,
    docentes_50_mais: 0,
    docentes_fem: 0,
    docentes_masc: 0,
    matriculas_total: 0,
    ...over,
  };
}

describe('temVinculoDeclarado', () => {
  it('é falso na rede privada — o Censo não publica tipo de contratação dela', () => {
    // Medido em 06/08/2026: 651.519 docentes da rede privada, 0 com vínculo.
    // Sem esta guarda a tela exibiria "0% concursados" como se fosse medição.
    expect(temVinculoDeclarado({
      concursados: 0, contrato: 0, terceirizados: 0, clt: 0,
    })).toBe(false);
  });

  it('é verdadeiro quando qualquer vínculo foi declarado', () => {
    expect(temVinculoDeclarado({
      concursados: 0, contrato: 0, terceirizados: 0, clt: 12,
    })).toBe(true);
    expect(temVinculoDeclarado({
      concursados: 5, contrato: 0, terceirizados: 0, clt: 0,
    })).toBe(true);
  });
});

describe('agregarDocentes', () => {
  it('soma as redes e mantém o ano mais recente', () => {
    const agg = agregarDocentes([
      linha({ rede: 'MUNICIPAL', docentes_total: 2020, escolas_com_dado: 103, matriculas_total: 33618, ano: 2025 }),
      linha({ rede: 'ESTADUAL', docentes_total: 1254, escolas_com_dado: 39, matriculas_total: 26366, ano: 2023 }),
    ])!;
    expect(agg.total).toBe(3274);
    expect(agg.escolasComDado).toBe(142);
    expect(agg.matriculas).toBe(59984);
    expect(agg.ano).toBe(2025);
  });

  it('ordena porRede por total e descarta rede sem docente', () => {
    const agg = agregarDocentes([
      linha({ rede: 'ESTADUAL', docentes_total: 1254 }),
      linha({ rede: 'PRIVADA', docentes_total: 2421 }),
      linha({ rede: 'FEDERAL', docentes_total: 0 }),
    ])!;
    expect(agg.porRede.map((r) => r.rede)).toEqual(['PRIVADA', 'ESTADUAL']);
  });

  it('devolve null sem linhas (município sem escola no censo)', () => {
    expect(agregarDocentes([])).toBeNull();
  });
});

describe('consolidarPorRede', () => {
  it('colapsa as linhas de município da UF em uma por rede', () => {
    const consolidado = consolidarPorRede([
      linha({ rede: 'MUNICIPAL', docentes_total: 100, escolas_com_dado: 5, docentes_concursados: 80 }),
      linha({ rede: 'MUNICIPAL', docentes_total: 40, escolas_com_dado: 3, docentes_concursados: 30 }),
      linha({ rede: 'PRIVADA', docentes_total: 25, escolas_com_dado: 2 }),
    ]);
    expect(consolidado).toHaveLength(2);
    const municipal = consolidado.find((r) => r.rede === 'MUNICIPAL')!;
    expect(municipal.docentes_total).toBe(140);
    expect(municipal.escolas_com_dado).toBe(8);
    expect(municipal.docentes_concursados).toBe(110);
  });

  it('não muta as linhas recebidas', () => {
    const original = linha({ rede: 'MUNICIPAL', docentes_total: 100 });
    consolidarPorRede([original, linha({ rede: 'MUNICIPAL', docentes_total: 40 })]);
    expect(original.docentes_total).toBe(100);
  });
});
