import { describe, expect, it } from 'vitest';
import {
  normalizeManagerReportInsight,
  normalizeRhReportInsight,
} from '@/lib/relatorios/dashboard-insights';
import {
  criarRelatorioGestorAcmeDemo,
  criarRelatorioRhAcmeDemo,
} from '@/lib/demo/acme-rh-report-fixture';

describe('normalização dos relatórios para dashboards', () => {
  it('transforma o consolidado de RH da demo nas quatro leituras do dashboard', () => {
    const insight = normalizeRhReportInsight(criarRelatorioRhAcmeDemo());

    expect(insight?.indicators.evaluated).toBe(30);
    expect(insight?.indicators.levels.map((item) => item.percentage)).toEqual([12, 31, 39, 18]);
    expect(insight?.roles).toHaveLength(4);
    expect(insight?.roleFocus[0]).toMatchObject({
      role: 'Representante Comercial',
      competency: 'Negociação e Fechamento',
    });
    expect(insight?.criticalCompetencies[0].training?.title).toBe('Negociação de valor sob pressão');
    expect(insight?.actionPlan.shortTerm).toHaveLength(2);
  });

  it('transforma o relatório do próprio gestor sem expor um ranking de perfis', () => {
    const insight = normalizeManagerReportInsight(criarRelatorioGestorAcmeDemo(
      { nome_completo: 'Carla Mendes', cargo: 'Gerente Comercial', area_depto: 'Comercial' },
      [
        { nome_completo: 'Bruna Costa', email: 'bruna@acme.demo', cargo: 'Representante Comercial' },
        { nome_completo: 'Paulo Demo', email: 'paulo@acme.demo', cargo: 'Representante Comercial' },
      ],
    ));

    expect(insight?.executive.reading).toContain('equipe');
    expect(insight?.competencies[0].distribution).toHaveLength(4);
    expect(insight?.highlights[0].person).toBe('Bruna Costa');
    expect(insight?.attention[0].person).toBe('Paulo Demo');
    expect(insight?.actions.thisWeek).toHaveLength(2);
  });

  it('aceita conteúdo JSON serializado e limita percentuais inválidos', () => {
    const insight = normalizeRhReportInsight(JSON.stringify({
      indicadores: { pct_nivel_1: -20, pct_nivel_2: 120 },
      resumo_executivo: { leitura: 'Leitura legada' },
    }));

    expect(insight?.executive.reading).toBe('Leitura legada');
    expect(insight?.indicators.levels[0].percentage).toBe(0);
    expect(insight?.indicators.levels[1].percentage).toBe(100);
  });
});
