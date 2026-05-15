import { describe, expect, it } from 'vitest';
import { calcularMercadoScores } from '@/lib/mercado-potencial/scoring';
import { calcularDispersaoMunicipalFromRows } from '@/lib/radar/queries';
import { isPerfilComportamentalLiberado } from '@/lib/votacao/status';

describe('regressoes de produto', () => {
  it('mercado potencial recalcula professores de onboarding pelo corte de idade', () => {
    const row = {
      rede: 'MUNICIPAL',
      qt_professores: 100,
      qt_docs_0_24: 10,
      qt_docs_jovens: 25,
      qt_docs_pos: 40,
      qt_gestores: 3,
      inse_medio: 2,
    };

    const ate24 = calcularMercadoScores(row, { idadeOnboarding: 24, precoProf: 300, precoGestor: 500 });
    const ate29 = calcularMercadoScores(row, { idadeOnboarding: 29, precoProf: 300, precoGestor: 500 });

    expect(ate24.qt_professores_onboarding).toBe(10);
    expect(ate29.qt_professores_onboarding).toBe(25);
    expect(ate24.tam_mensal_onboarding).toBe(4500);
    expect(ate29.tam_mensal_onboarding).toBe(9000);
    expect(ate24.pct_jovens).toBeCloseTo(0.10);
    expect(ate29.pct_jovens).toBeCloseTo(0.25);
  });

  it('radarbett diferencia total da rede de escolas com Ideb publicado na dispersao', () => {
    const escolas = Array.from({ length: 27 }, (_, i) => ({
      codigo_inep: String(29000000 + i),
      nome: `Escola ${i + 1}`,
    }));
    const valores = [4.5, 4.7, 4.9, 5.5, 5.6, 5.9, 6.6];
    const rows = [
      ...valores.map((ideb, i) => ({
        codigo_inep: escolas[i].codigo_inep,
        ano: 2023,
        etapa: '5_EF',
        ideb,
      })),
      ...[5.1, 5.2, 5.3, 5.4].map((ideb, i) => ({
        codigo_inep: escolas[i + 7].codigo_inep,
        ano: 2023,
        etapa: '9_EF',
        ideb,
      })),
      ...escolas.slice(0, 12).map((e, i) => ({
        codigo_inep: e.codigo_inep,
        ano: 2021,
        etapa: '5_EF',
        ideb: 4 + i / 10,
      })),
    ];

    const dispersao = calcularDispersaoMunicipalFromRows(escolas, rows);

    expect(dispersao?.ano).toBe(2023);
    expect(dispersao?.etapa).toBe('5_EF');
    expect(dispersao?.totalEscolas).toBe(7);
    expect(dispersao?.pontos).toHaveLength(7);
    expect(dispersao?.min).toBe(4.5);
    expect(dispersao?.max).toBe(6.6);
    expect(dispersao?.mediana).toBe(5.5);
  });

  it('bloqueia perfil comportamental enquanto a votacao estiver aberta sem liberacao explicita', () => {
    expect(isPerfilComportamentalLiberado({})).toBe(true);
    expect(isPerfilComportamentalLiberado({ perfil_comportamental_liberado: false })).toBe(false);
    expect(isPerfilComportamentalLiberado({ votacao_ativa: true })).toBe(false);
    expect(isPerfilComportamentalLiberado({ votacao_ativa: true, perfil_comportamental_liberado: false })).toBe(false);
    expect(isPerfilComportamentalLiberado({ votacao_ativa: true, perfil_comportamental_liberado: true })).toBe(true);
    expect(isPerfilComportamentalLiberado({ votacao_ativa: false, perfil_comportamental_liberado: undefined })).toBe(true);
  });
});
