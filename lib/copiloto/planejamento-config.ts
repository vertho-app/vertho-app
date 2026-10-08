import { DEFAULT_COPILOTO_PLANNING_MODEL } from '@/lib/ai-tasks';

/**
 * Modelo, teto e esforço da SÍNTESE do planejamento (`app/api/copiloto/planejamento/route.ts`).
 *
 * Sonnet 5.5 em `medium` com teto de 16000 (o que foi medido em 08/10/2026: saída de ~14 mil caracteres e 37 a 56 s). No Claude de
 * geração 5 o raciocínio divide o `max_tokens` com o texto, por isso o teto é maior que o do Terra. A porta de volta é a env
 * `COPILOTO_PLANNING_MODEL=gpt-5.6-terra`, que traz junto o esforço `low` e o teto de 12000 com que o Terra sempre rodou.
 */
export function configDaSinteseDoPlanejamento(envModelo?: string | null) {
  const modelo = (envModelo || '').trim() || DEFAULT_COPILOTO_PLANNING_MODEL;
  const claude = modelo.startsWith('claude');
  return {
    modelo,
    maxTokens: claude ? 16000 : 12000,
    reasoningEffort: (claude ? 'medium' : 'low') as 'medium' | 'low',
  };
}
