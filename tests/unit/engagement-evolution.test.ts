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
        emRisco: 1,
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
        emRisco: 0,
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

  it('reconcilia os cargos com o fechamento sem confundir inscritos, elegíveis e risco individual', () => {
    const dashboard = buildEngagementEvolutionDashboard({
      ...baseInput,
      enrollments: [
        ...['a', 'b', 'c', 'd'].map(colaboradorId => ({ colaboradorId, nome: colaboradorId, cargo: ' Analista ', area: 'Operações', semanaAtual: 3 })),
        { colaboradorId: 'e', nome: 'e', cargo: 'analista', area: 'Operações', semanaAtual: 2 },
        { colaboradorId: 'f', nome: 'f', cargo: 'Gerente', area: 'Comercial', semanaAtual: 2 },
        { colaboradorId: 'g', nome: 'g', cargo: '  ', area: 'Comercial', semanaAtual: 3 },
      ],
      events: [
        { colaboradorId: 'b', semana: 3, tipo: 'audio_fim' },
        { colaboradorId: 'b', semana: 3, tipo: 'audio_fim' },
        { colaboradorId: 'c', semana: 3, tipo: 'abertura' },
        { colaboradorId: 'c', semana: 2, tipo: 'abertura' },
        { colaboradorId: 'fora-da-base', semana: 3, tipo: 'audio_fim' },
      ],
      progress: [
        { colaboradorId: 'a', semana: 3, tipo: 'aplicacao', status: 'completed', conteudoConsumido: false },
        { colaboradorId: 'e', semana: 2, tipo: 'conteudo', status: 'completed', conteudoConsumido: false },
      ],
    });
    expect(dashboard.cargos[0]).toEqual({
      cargo: 'Analista', participantes: 5, elegiveis: 4,
      ativados: 3, consumiram: 2, evidencias: 1,
      ativacaoPct: 75, consumoPct: 50, evidenciaPct: 25,
      emRisco: 2, criticos: 1, atencao: 1, riscoPct: 40,
    });
    expect(dashboard.cargos.find(c => c.cargo === 'Gerente')).toMatchObject({
      participantes: 1, elegiveis: 0, ativados: 0, emRisco: 1, riscoPct: 100,
    });
    expect(dashboard.cargos.find(c => c.cargo === 'Cargo não informado')).toMatchObject({ participantes: 1, elegiveis: 1 });
    const sum = (field: keyof typeof dashboard.cargos[number]) => dashboard.cargos.reduce((total, c) => total + Number(c[field]), 0);
    expect(sum('participantes')).toBe(dashboard.inscritos);
    expect(sum('emRisco')).toBe(dashboard.emRisco);
    expect(sum('criticos')).toBe(dashboard.trajetorias.critical);
    expect(sum('atencao')).toBe(dashboard.trajetorias.attention);
    for (const field of ['elegiveis', 'ativados', 'consumiram', 'evidencias'] as const) {
      expect(sum(field)).toBe(dashboard.semanas.at(-1)![field]);
    }
  });

  it('reconcilia risco por cargo e área com a lista completa de acompanhamento', () => {
    const dashboard = buildEngagementEvolutionDashboard({
      ...baseInput, events: [], progress: [],
      enrollments: Array.from({ length: 31 }, (_, i) => ({
        colaboradorId: String(i), nome: `Pessoa ${i}`, cargo: 'Professor', area: 'Educação', semanaAtual: 2,
      })),
    });
    expect(dashboard.pessoasEmRisco).toHaveLength(31);
    expect(dashboard.cargos).toHaveLength(1);
    expect(dashboard.cargos[0]).toMatchObject({ participantes: 31, emRisco: 31, criticos: 31, riscoPct: 100 });
    expect(dashboard.areas[0].emRisco).toBe(31);
  });

  it('aplica o filtro de área também nos cargos e preserva o estado vazio', () => {
    const filtered = buildEngagementEvolutionDashboard({ ...baseInput, area: 'Operações' });
    expect(filtered.cargos).toHaveLength(1);
    expect(filtered.cargos[0]).toMatchObject({ cargo: 'Analista', participantes: 1, emRisco: 0 });
    const empty = buildEngagementEvolutionDashboard({ ...baseInput, enrollments: [] });
    expect(empty.cargos).toEqual([]);
  });
});
