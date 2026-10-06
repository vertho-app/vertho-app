import { BEDROCK_KIMI_K3_MODEL } from '@/lib/ai-provedores';

// Compatibilidade comprovada pelo canário strict JSON do PACE, não pelo prefixo do fornecedor.
// Expandir este conjunto exige verificar JSON nativo + schema PACE + contexto + catálogo de custo.
export const MODELOS_PACE = new Set([
  'gpt-5.4-2026-03-05',
  'gpt-5.4-mini',
  'gpt-5.4-mini-2026-03-17',
  'gemini-3.8-flash',
  'claude-sonnet-5-5',
  'claude-opus-5-5',
  BEDROCK_KIMI_K3_MODEL,
]);
export function modeloPaceCompativel(modelo: string): boolean {
  return MODELOS_PACE.has(modelo);
}

export function modeloVertho(
  etapa: 'criador' | 'cliente' | 'moderador' | 'intencao' | 'gerente',
  nivel: 1 | 2 | 3,
) {
  if (etapa === 'gerente')
    return { modelo: 'claude-opus-5-5', esforco: 'medium' as const };
  if (etapa === 'criador' || (etapa === 'cliente' && nivel !== 1))
    return { modelo: BEDROCK_KIMI_K3_MODEL, esforco: 'low' as const };
  return { modelo: 'gemini-3.8-flash', esforco: 'low' as const };
}
