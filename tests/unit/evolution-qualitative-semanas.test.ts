import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { promptEvolutionQualitative } from '@/lib/season-engine/prompts/evolution-qualitative';

/**
 * R-29 (revisão de 02/10/2026): a conversa qualitativa de fechamento dizia
 * "nessas 12 semanas" escrito à mão, inclusive na mensagem que a IA é INSTRUÍDA
 * a enviar no turno 1, e "após 12 semanas" no system. No encerramento da
 * Ibipeba (conversa na semana 8) a pessoa tem 7 semanas de desenvolvimento, e a
 * IA lhe dizia 12.
 *
 * O número vem do plano (`semanasDeDesenvolvimentoDoPlano`). Sem ele vale 12,
 * o texto de sempre: nenhum prompt em uso muda de byte.
 *
 * Validado por mutação (ver o relatório): fixar `semanas` em 12 dentro de
 * `promptEvolutionQualitative` derruba os casos com número.
 */

const base = {
  nomeColab: 'COLAB_1', cargo: 'Coordenadora', perfilDominante: 'S', competencia: 'Gestão Escolar',
  descritores: [{ descritor: 'Escuta ativa' }], insightsAnteriores: ['percebi que escuto menos'],
};
const turno = (turnIA: number, semanas?: number | null) =>
  promptEvolutionQualitative({ ...base, turnIA, totalTurns: 12, semanasDeDesenvolvimento: semanas });

describe('conversa qualitativa: as semanas do plano', () => {
  it('🔴 a abertura que a IA é instruída a enviar cita as semanas do plano (7 na Ibipeba)', () => {
    const { systemSuffix, instrucao } = turno(1, 7);
    expect(systemSuffix).toContain('evolução nessas 7 semanas');
    expect(systemSuffix).not.toMatch(/\b12 semanas/);
    expect(instrucao).toBe(systemSuffix);
  });

  it('o system diz as mesmas semanas, no objetivo e no contexto dos insights', () => {
    const { system } = turno(2, 7);
    expect(system).toContain('após 7 semanas de desenvolvimento');
    expect(system).toContain('Insights das sems 1-7:');
    expect(system).not.toMatch(/\b12 semanas|sems 1-12/);
  });

  it('o formato de 14 semanas (12 de desenvolvimento) segue com o texto de sempre', () => {
    for (const semanas of [12, undefined, null]) {
      const p = turno(1, semanas as any);
      expect(p.systemSuffix).toContain('evolução nessas 12 semanas');
      expect(p.system).toContain('após 12 semanas de desenvolvimento');
      expect(p.system).toContain('Insights das sems 1-12:');
    }
  });

  it('número inválido (0 ou negativo) cai no 12, nunca "nessas 0 semanas"', () => {
    expect(turno(1, 0).systemSuffix).toContain('nessas 12 semanas');
    expect(turno(1, -3).systemSuffix).toContain('nessas 12 semanas');
  });

  it('a rota passa o número do plano à conversa', () => {
    const rota = readFileSync('app/api/temporada/evaluation/route.ts', 'utf-8');
    expect(rota).toContain('semanasDeDesenvolvimento: semanasDeDesenvolvimentoDoPlano(trilha.temporada_plano)');
  });
});
