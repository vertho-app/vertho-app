import { describe, expect, it } from 'vitest';
import { buildEngagementEvolutionDashboard } from '@/lib/engagement-evolution';
import { buildViews } from '@/lib/engajamento/relatorio-model';
import { engagementBlocker, engagementDetailHref } from '@/lib/engajamento/prioridades';

const base = { events: [], videos: [], progress: [], tutorUses: [], completedStatus: 'completed' };
const person = (id: string, week = 2, area = 'Operações') => ({ colaboradorId: id, nome: `Pessoa ${id}`, cargo: 'Analista', area, semanaAtual: week });
const rollup = { resumo: { inscritos: 999, porFormato: [] }, colaboradores: [] };

describe('prioridades de engajamento', () => {
  it('cada pessoa pertence a uma etapa pendente e os grupos somam as perdas do fechamento', () => {
    const evolution = buildEngagementEvolutionDashboard({ ...base,
      enrollments: [person('sem-acesso'), person('consumo'), person('evidencia'), person('concluiu'), person('turma-anterior', 1)],
      events: [{ colaboradorId: 'consumo', semana: 2, tipo: 'formato' }],
      progress: [
        { colaboradorId: 'evidencia', semana: 2, tipo: 'conteudo', status: 'pending', conteudoConsumido: true },
        { colaboradorId: 'concluiu', semana: 2, tipo: 'conteudo', status: 'completed', conteudoConsumido: false },
      ],
    });
    const views = buildViews({ empresaNome: 'Teste', rollup, evolucao: evolution })!;
    expect(views.gestor.eligible).toBe(4);
    expect(views.gestor.enrolled).toBe(5);
    expect(views.gestor.priorities.map((item) => [item.key, item.count, item.members.length])).toEqual([
      ['ativacao', 1, 1], ['consumo', 1, 1], ['evidencia', 1, 1],
    ]);
    expect(views.gestor.priorities.flatMap((item) => item.members.map((member) => member.id))).not.toContain('turma-anterior');
    expect(JSON.stringify(views.rh)).not.toContain('Pessoa ');
    expect(JSON.stringify(views.rh)).not.toContain('sem-acesso');
  });

  it('inclui todas as pessoas no ranking por área, mesmo quando há mais de 20 críticas', () => {
    const evolution = buildEngagementEvolutionDashboard({ ...base,
      enrollments: Array.from({ length: 35 }, (_, i) => person(String(i).padStart(2, '0'), 2, i < 20 ? 'Área A' : 'Área B')),
    });
    const view = buildViews({ empresaNome: 'Teste', rollup, evolucao: evolution })!.rh;
    expect(evolution.pessoasEmRisco).toHaveLength(35);
    expect(view.risk.total).toBe(35);
    expect(view.focusItems.find((item) => item.name === 'Área B')?.context).toContain('15 pessoas em risco · 15 inscritos');
  });

  it('não chama primeira semana de duas semanas sem atividade nem inventa estabilidade', () => {
    const evolution = buildEngagementEvolutionDashboard({ ...base, enrollments: [person('nova', 1)] });
    const view = buildViews({ empresaNome: 'Teste', rollup, evolucao: evolution })!.gestor;
    expect(view.focusItems[0].reason).toBe('Sem atividade na primeira semana');
    expect(view.canCompare).toBe(false);
  });

  it('bloqueio e chegada ao canal não contam como ativação ou recuperação', () => {
    const evolution = buildEngagementEvolutionDashboard({ ...base, enrollments: [person('bloqueada')],
      events: ['bloqueio', 'chegada_email', 'chegada_whatsapp', 'chegada_push'].map((tipo) => ({ colaboradorId: 'bloqueada', semana: 2, tipo })),
    });
    expect(evolution.semanas.at(-1)?.ativados).toBe(0);
    expect(evolution.recuperados).toBe(0);
  });

  it('não apresenta agregado como semanal após falha ou ausência de fechamento', () => {
    expect(buildViews({ empresaNome: 'Teste', rollup, evolucao: null })).toBeNull();
    const evolution = buildEngagementEvolutionDashboard({ ...base, enrollments: [] });
    expect(buildViews({ empresaNome: 'Teste', rollup, evolucao: evolution })!.gestor.eligible).toBe(0);
    expect(buildViews({ empresaNome: 'Teste', rollup: { resumo: { erro: 'Indisponível' } }, evolucao: evolution })).toBeNull();
  });

  it('filtros operacionais respeitam consumo e evidência sem exigir um evento de abertura', () => {
    expect(engagementBlocker({})).toBe('ativacao');
    expect(engagementBlocker({ deuPlay: true })).toBe('consumo');
    expect(engagementBlocker({ consumiu: true })).toBe('evidencia');
    expect(engagementBlocker({ enviouEvidencia: true })).toBeNull();
    const url = new URL(engagementDetailHref('empresa', { id: 'pessoa & nome', week: 3 }), 'https://app.vertho.ai');
    expect(url.searchParams.get('pessoa')).toBe('pessoa & nome');
    expect(url.searchParams.get('semana')).toBe('3');
  });
});
