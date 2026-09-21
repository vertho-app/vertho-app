import { describe, expect, it } from 'vitest';
import { historicoIlustrativoDemo } from '@/lib/demo/engajamento-historico';
import { buildEngagementEvolutionDashboard } from '@/lib/engagement-evolution';

describe('histórico ilustrativo da degustação', () => {
  const semanas = Array.from({ length: 7 }, (_, i) => ({ semana: i + 1 }));
  it('exige tanto a flag demo quanto um ambiente conhecido', () => {
    for (const empresa of [null, { slug: 'acme-demo', is_demo: false }, { slug: 'cliente', is_demo: true }]) {
      expect(historicoIlustrativoDemo(empresa, semanas)).toBeUndefined();
    }
  });
  it.each(['acme-demo', 'gruposinal', 'escolas-acme'])('mantém o piso de 73%% em %s, incluindo diferentes durações', slug => {
    for (const tamanho of [1, 3, 7, 14]) {
      const source = Array.from({ length: tamanho }, (_, i) => ({ semana: i + 1 }));
      const serie = historicoIlustrativoDemo({ slug, is_demo: true }, source)!;
      expect(serie.map(s => s.semana)).toEqual(source.map(s => s.semana));
      for (const s of serie) {
        expect(s.evidenciaPct).toBeGreaterThanOrEqual(73);
        expect(s.consumoPct).toBeGreaterThanOrEqual(s.evidenciaPct);
        expect(s.ativacaoPct).toBeGreaterThanOrEqual(s.consumoPct);
        expect(s.ativacaoPct).toBeLessThanOrEqual(100);
      }
      if (tamanho > 1) expect(serie.at(-1)!.evidenciaPct).toBeGreaterThan(serie[0].evidenciaPct);
    }
  });
  it('não inventa semanas sem população nem altera métricas operacionais', () => {
    expect(historicoIlustrativoDemo({ slug: 'acme-demo', is_demo: true }, [])).toEqual([]);
    const medido = buildEngagementEvolutionDashboard({
      enrollments: [{ colaboradorId: 'p1', nome: 'Pessoa', cargo: 'Cargo', area: 'Área', semanaAtual: 1 }],
      events: [], videos: [], progress: [], tutorUses: [], completedStatus: 'concluido',
    });
    medido.historicoIlustrativo = historicoIlustrativoDemo({ slug: 'acme-demo', is_demo: true }, medido.semanas);
    expect(medido.semanas[0].evidenciaPct).toBe(0);
    expect(medido.emRisco).toBe(1);
    expect(medido.historicoIlustrativo![0].evidenciaPct).toBe(73);
  });
});
