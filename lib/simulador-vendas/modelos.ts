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
  // 08/10/2026: moderador e intenção do treinamento comercial Vertho. O Gemini 3.8 CONTINUA aqui: o snapshot de
  // uma sessão já aberta congela o modelo, e `snapshotPrompts`/`modeloPaceCompativel` o revalidam.
  'claude-haiku-5-5',
  BEDROCK_KIMI_K3_MODEL,
]);
export function modeloPaceCompativel(modelo: string): boolean {
  return MODELOS_PACE.has(modelo);
}

export function modeloVertho(
  etapa: 'criador' | 'cliente' | 'moderador' | 'intencao' | 'gerente',
  _nivel: 1 | 2 | 3,
) {
  if (etapa === 'gerente')
    return { modelo: 'claude-sonnet-5-5', esforco: 'medium' as const };
  if (etapa === 'criador' || etapa === 'cliente')
    return { modelo: BEDROCK_KIMI_K3_MODEL, esforco: 'low' as const };
  // Moderador e intenção: classificação com saída de 19 a 40 tokens (ledger de 30 dias). `none` desliga o raciocínio
  // do Haiku 5.5, que é LIGADO por padrão mesmo em `low`: num JSON desse tamanho o raciocínio seria a maior parte
  // da espera de cada turno do treino (no Copiloto, a saída foi de 381 para 1.153 tokens).
  return { modelo: 'claude-haiku-5-5', esforco: 'none' as const };
}
