import { describe, expect, it } from 'vitest';

import {
  agregarIdebMunicipio,
  type MunicipioIdebSourceRow,
} from '@/lib/radar/ideb-municipio';

function linha(over: Partial<MunicipioIdebSourceRow> = {}): MunicipioIdebSourceRow {
  return {
    ano: 2025,
    etapa: '5_EF',
    codigo_inep: '29000001',
    ideb: 5,
    indicador_rendimento: 0.95,
    nota_saeb: 5.25,
    ...over,
  };
}

describe('agregarIdebMunicipio', () => {
  it('usa o agregado oficial, não a média simples das escolas', () => {
    const escolas = [4.9, 5.2, 5.2, 5.3, 5.7, 6, 6.2].map((ideb, index) =>
      linha({ codigo_inep: `29${index}`.padEnd(8, '0'), ideb }),
    );
    const oficial = linha({
      codigo_inep: null,
      ideb: 6.2,
      indicador_rendimento: 0.994371,
      nota_saeb: 6.218405,
    });

    const [resultado] = agregarIdebMunicipio(escolas, [oficial]);

    expect(resultado.idebAvg).toBe(6.2);
    expect(resultado.rendimentoAvg).toBe(0.994371);
    expect(resultado.notaSaebAvg).toBe(6.218405);
    expect(resultado.totalEscolas).toBe(7);
  });

  it('mantém a média escolar como fallback quando falta o agregado oficial', () => {
    const resultado = agregarIdebMunicipio([
      linha({ codigo_inep: '29000001', ideb: 4 }),
      linha({ codigo_inep: '29000002', ideb: 6 }),
    ], []);

    expect(resultado[0].idebAvg).toBe(5);
    expect(resultado[0].totalEscolas).toBe(2);
  });

  it('preserva null oficial em vez de misturar componentes escolares', () => {
    const [resultado] = agregarIdebMunicipio([
      linha({ indicador_rendimento: 0.99, nota_saeb: 6 }),
    ], [linha({ codigo_inep: null, ideb: 5.9, indicador_rendimento: null, nota_saeb: null })]);

    expect(resultado).toMatchObject({
      idebAvg: 5.9,
      rendimentoAvg: null,
      notaSaebAvg: null,
      totalEscolas: 1,
    });
  });

  it('inclui município oficial mesmo sem linha escolar publicada', () => {
    const [resultado] = agregarIdebMunicipio([], [linha({ codigo_inep: null, etapa: '9_EF', ideb: 4.5 })]);
    expect(resultado).toMatchObject({ etapa: '9_EF', idebAvg: 4.5, totalEscolas: 0 });
  });
});
