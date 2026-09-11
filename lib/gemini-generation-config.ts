/**
 * Contrato único de generationConfig do Gemini.
 *
 * O 3.8 removeu parâmetros de sampling e trocou `thinkingBudget` por
 * `thinkingLevel`. Os modelos de fallback ainda usam o contrato legado. Manter
 * a bifurcação aqui evita que cada fluxo multimodal envelheça separadamente.
 */

export type GeminiThinkingLevel = 'low' | 'medium' | 'high';

interface GeminiGenerationConfigOptions {
  model: string;
  maxOutputTokens: number;
  thinkingLevel?: GeminiThinkingLevel;
  responseMimeType?: string;
  responseSchema?: Record<string, unknown>;
  legacyTemperature?: number;
  legacyThinkingBudget?: number;
}

export function isGemini38(model: string): boolean {
  return model.startsWith('gemini-3.8');
}

export function buildGeminiGenerationConfig(options: GeminiGenerationConfigOptions) {
  const base = {
    maxOutputTokens: options.maxOutputTokens,
    ...(options.responseMimeType ? { responseMimeType: options.responseMimeType } : {}),
    ...(options.responseSchema ? { responseSchema: options.responseSchema } : {}),
  };

  if (isGemini38(options.model)) {
    return {
      ...base,
      thinkingConfig: { thinkingLevel: options.thinkingLevel || 'low' },
    };
  }

  return {
    ...base,
    ...(options.legacyTemperature != null ? { temperature: options.legacyTemperature } : {}),
    ...(options.legacyThinkingBudget != null
      ? { thinkingConfig: { thinkingBudget: options.legacyThinkingBudget } }
      : {}),
  };
}
