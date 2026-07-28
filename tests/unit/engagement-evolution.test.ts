import { describe, expect, it } from 'vitest';
import { buildEngagementEvolutionDashboard } from '@/lib/engagement-evolution';

const baseInput = {
  enrollments: [
    { colaboradorId: 'ana', nome: 'Ana', cargo: 'Analista', area: 'Operações', semanaAtual: 3 },
    { colaboradorId: 'beto', nome: 'Beto', cargo: 'Gerente', area: 'Comercial', semanaAtual: 3 },
  ],
  events: [
    { colaboradorId: 'ana', semana: 2, tipo: 'abertura' },
  ],
  videos: [],
  progress: [
    { colaboradorId: 'ana', semana: 1, tipo: 'conteudo', status: 'completed', conteudoConsumido: false },
    { colaboradorId: 'ana', semana: 3, tipo: 'conteudo', status: 'completed', conteudoConsumido: false },
    { colaboradorId: 'beto', semana: 1, tipo: 'conteudo', status: 'completed', conteudoConsumido: false },
  ],
  tutorUses: [],
  completedStatus: 'completed',
};

describe('evolução semanal de engajamento', () => {
  it('calcula séries semanais sobre a população elegível de cada semana', () => {
    const dashboard = buildEngagementEvolutionDashboard(baseInput);

    expect(dashboard.semanas).toEqual([
      {
        semana: 1,
        elegiveis: 2,
        ativados: 2,
        consumiram: 2,
        evidencias: 2,
        usaramTutor: 0,
        ativacaoPct: 100,
        consumoPct: 100,
        evidenciaPct: 100,
        tutorPct: 0,
        indiceEvolucao: 90,
      },
      {
        semana: 2,
        elegiveis: 2,
        ativados: 1,
        consumiram: 0,
        evidencias: 0,
        usaramTutor: 0,
        ativacaoPct: 50,
        consumoPct: 0,
        evidenciaPct: 0,
        tutorPct: 0,
        indiceEvolucao: 10,
      },
      {
        semana: 3,
        elegiveis: 2,
        ativados: 1,
        consumiram: 1,
        evidencias: 1,
        usaramTutor: 0,
        ativacaoPct: 50,
        consumoPct: 50,
        evidenciaPct: 50,
        tutorPct: 0,
        indiceEvolucao: 45,
      },
    ]);
  });

  it('classifica trajetórias e prioriza quem ficou duas semanas sem atividade', () => {
    const dashboard = buildEngagementEvolutionDashboard(baseInput);

    expect(dashboard.trajetorias).toEqual({
      accelerating: 1,
      on_track: 0,
      attention: 0,
      critical: 1,
    });
    expect(dashboard.emRisco).toBe(1);
    expect(dashboard.pessoasEmRisco).toEqual([
      expect.objectContaining({
        colaboradorId: 'beto',
        semanaAtual: 3,
        trajetoria: 'critical',
        motivo: 'Sem atividade há duas semanas',
      }),
    ]);
  });

  it('gera o heatmap por área e preserva as áreas no filtro', () => {
    const dashboard = buildEngagementEvolutionDashboard(baseInput);

    expect(dashboard.areasDisponiveis).toEqual(['Comercial', 'Operações']);
    expect(dashboard.areas).toEqual([
      {
        area: 'Comercial',
        participantes: 1,
        semanas: [
          { semana: 1, indice: 90, elegiveis: 1 },
          { semana: 2, indice: 0, elegiveis: 1 },
          { semana: 3, indice: 0, elegiveis: 1 },
        ],
        tendencia: 0,
      },
      {
        area: 'Operações',
        participantes: 1,
        semanas: [
          { semana: 1, indice: 90, elegiveis: 1 },
          { semana: 2, indice: 20, elegiveis: 1 },
          { semana: 3, indice: 90, elegiveis: 1 },
        ],
        tendencia: 70,
      },
    ]);
  });

  it('aplica o filtro de área sem perder as opções disponíveis', () => {
    const dashboard = buildEngagementEvolutionDashboard({ ...baseInput, area: 'Operações' });

    expect(dashboard.areaSelecionada).toBe('Operações');
    expect(dashboard.areasDisponiveis).toEqual(['Comercial', 'Operações']);
    expect(dashboard.inscritos).toBe(1);
    expect(dashboard.semanas.at(-1)?.evidenciaPct).toBe(100);
    expect(dashboard.areas).toHaveLength(1);
  });

  it('conta recuperação quando a pessoa volta a ter atividade', () => {
    const dashboard = buildEngagementEvolutionDashboard({
      enrollments: [
        { colaboradorId: 'carla', nome: 'Carla', cargo: 'Coord.', area: 'Pessoas', semanaAtual: 2 },
      ],
      events: [{ colaboradorId: 'carla', semana: 2, tipo: 'abertura' }],
      videos: [],
      progress: [],
      tutorUses: [],
      completedStatus: 'completed',
    });

    expect(dashboard.recuperados).toBe(1);
    expect(dashboard.trajetorias.accelerating).toBe(1);
  });
});
