import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { promptSimuladorColab } from '@/lib/season-engine/prompts/simulador-temporada';

describe('Simulador — migração do ator sintético', () => {
  it('resolve sim_aluno pela fonte central, sem Haiku hardcoded, e fixa effort low', () => {
    const source = readFileSync(join(process.cwd(), 'lib/season-engine/simulador-core.ts'), 'utf8');

    expect(source).not.toContain('claude-haiku-4-5-20251001');
    expect(source).toContain("getModelForTask(trilha.empresa_id, 'sim_aluno')");
    expect(source).toContain("reasoningEffort: 'low'");
    expect(source).toContain("...simOpts(trilha, 'sim_aluno')");
  });

  it('regressão nas semanas finais proíbe narrar evolução consolidada', () => {
    const { system } = promptSimuladorColab({
      perfilEvolucao: 'regressao',
      semana: 13,
      tipoChat: 'qualitativa_fechamento',
      competencia: 'Liderança',
      descritor: 'Delega com clareza',
      historico: [],
      turnUser: 1,
      cargo: 'Diretor escolar',
    });

    expect(system).toContain('Sems 9-14: fica mais curto');
    expect(system).toContain('NÃO narre evolução consolidada');
    expect(system).toContain('pode relatar recaídas');
  });
});
