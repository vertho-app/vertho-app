import { describe, expect, it } from 'vitest';
import { BEHAVIORAL_REPORT_SCHEMA_VERSION } from '@/lib/behavioral-report-schema';
import { buildAcmeDemoBehavioralReport } from '@/lib/demo/acme-behavioral-report';

describe('relatório comportamental determinístico da ACME Demo', () => {
  it('gera o relatório completo no schema atual sem chamar IA', () => {
    const report = buildAcmeDemoBehavioralReport({
      nome_completo: 'Camila Rocha',
      perfil_dominante: 'I',
      d_natural: 48,
      i_natural: 76,
      s_natural: 42,
      c_natural: 34,
    });

    expect(report._schema_version).toBe(BEHAVIORAL_REPORT_SCHEMA_VERSION);
    expect(report.sintese_perfil).toContain('Camila');
    expect(report.quadrante_I.titulo_traco).toBe('Mobilizador');
    expect(report.top5_forcas).toHaveLength(5);
    expect(report.top5_desenvolver).toHaveLength(5);
    expect(report.pontos_desenvolver_pressao).toHaveLength(6);
  });

  it('mantém a narrativa ligada aos números de cada persona', () => {
    const influente = buildAcmeDemoBehavioralReport({
      nome_completo: 'Camila Rocha', perfil_dominante: 'I',
      d_natural: 48, i_natural: 76, s_natural: 42, c_natural: 34,
    });
    const analitico = buildAcmeDemoBehavioralReport({
      nome_completo: 'Aline Barros', perfil_dominante: 'CS',
      d_natural: 25, i_natural: 30, s_natural: 63, c_natural: 82,
    });

    expect(influente.quadrante_I.titulo_traco).not.toBe(analitico.quadrante_I.titulo_traco);
    expect(influente.top5_forcas.map((item) => item.competencia))
      .not.toEqual(analitico.top5_forcas.map((item) => item.competencia));
  });
});
