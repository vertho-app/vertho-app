import { describe, expect, it } from 'vitest';
import { buildGeminiGenerationConfig } from '@/lib/gemini-generation-config';

describe('generationConfig do Gemini por geração', () => {
  it('3.8 usa thinkingLevel e nunca recebe sampling/thinkingBudget legado', () => {
    const config = buildGeminiGenerationConfig({
      model: 'gemini-3.8-flash',
      maxOutputTokens: 4096,
      thinkingLevel: 'medium',
      legacyTemperature: 0.4,
      legacyThinkingBudget: -1,
    });

    expect(config).toEqual({
      maxOutputTokens: 4096,
      thinkingConfig: { thinkingLevel: 'medium' },
    });
    expect(config).not.toHaveProperty('temperature');
    expect(JSON.stringify(config)).not.toContain('thinkingBudget');
  });

  it('fallback legado preserva temperature e thinkingBudget', () => {
    const config = buildGeminiGenerationConfig({
      model: 'gemini-3.6-flash',
      maxOutputTokens: 8192,
      thinkingLevel: 'low',
      legacyTemperature: 0.2,
      legacyThinkingBudget: 0,
    });

    expect(config).toEqual({
      maxOutputTokens: 8192,
      temperature: 0.2,
      thinkingConfig: { thinkingBudget: 0 },
    });
    expect(JSON.stringify(config)).not.toContain('thinkingLevel');
  });

  it('3.8 assume low quando o caller não pede outro nível', () => {
    expect(buildGeminiGenerationConfig({
      model: 'gemini-3.8-flash',
      maxOutputTokens: 100,
    })).toMatchObject({ thinkingConfig: { thinkingLevel: 'low' } });
  });
});
