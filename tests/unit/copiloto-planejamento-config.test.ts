import { describe, expect, it } from 'vitest';
import { DEFAULT_COPILOTO_PLANNING_MODEL, DEFAULT_TASK_MODELS } from '@/lib/ai-tasks';
import { configDaSinteseDoPlanejamento } from '@/lib/copiloto/planejamento-config';

// Planejamento do Copiloto: Sonnet 5.5 em `medium` (08/10/2026; antes GPT 5.6 Terra em `low`). `Medido` na mesma entrada, 4 empresas,
// 2 repetições: Sonnet cumpriu as regras do prompt em 8 de 8, o Terra em 6 de 8; 43 s contra 50 s.
describe('síntese do planejamento do Copiloto', () => {
  it('o default é o Sonnet 5.5, e a tela de custo lê a MESMA decisão que a rota', () => {
    expect(DEFAULT_COPILOTO_PLANNING_MODEL).toBe('claude-sonnet-5-5');
    expect(
      DEFAULT_TASK_MODELS.copiloto_planejamento,
      'rota e tabela com ids diferentes: a tela de custo atribuiria o modelo errado',
    ).toBe(DEFAULT_COPILOTO_PLANNING_MODEL);
  });

  it('sem env, roda em Sonnet 5.5 com esforço medium e teto de 16000 (o raciocínio divide o teto com o texto)', () => {
    expect(configDaSinteseDoPlanejamento(undefined)).toEqual({ modelo: 'claude-sonnet-5-5', maxTokens: 16000, reasoningEffort: 'medium' });
    expect(configDaSinteseDoPlanejamento('')).toMatchObject({ modelo: 'claude-sonnet-5-5' });
    expect(configDaSinteseDoPlanejamento('   ')).toMatchObject({ modelo: 'claude-sonnet-5-5' });
  });

  it('a porta de volta por env traz o esforço e o teto com que o Terra sempre rodou', () => {
    expect(configDaSinteseDoPlanejamento('gpt-5.6-terra')).toEqual({ modelo: 'gpt-5.6-terra', maxTokens: 12000, reasoningEffort: 'low' });
  });
});
