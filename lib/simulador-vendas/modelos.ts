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

/**
 * Esforço de cada agente FORA do treino Vertho. Só o modelo Claude recebe esforço (o GPT segue sem, como sempre rodou, e o
 * snapshot não ganha a chave `esforco`). Medido em 08/10/2026, pelo `executarCore` + `gerador` reais (o padrão do Sonnet 5.5 é
 * `high`, mais lento e não testado):
 * - gerente e criador: `medium` (criador 28 s contra 33 s do GPT, todos válidos);
 * - cliente: `low` (p50 de 2,5 s contra 2,8 s do GPT, 13 de 13 turnos válidos);
 * - moderador: `medium` (23 de 26 na severidade; `none` subestima);
 * - intenção: `none`, SÓ no Haiku 5.x (decisão binária, 35 de 35). O Sonnet 5.5 devolve 400 para `thinking: disabled`, então
 *   fora do Haiku a intenção roda em `low`.
 */
export function esforcoPadraoPace(etapa: string, modelo: string): 'none' | 'low' | 'medium' | undefined {
  if (!modelo.startsWith('claude')) return undefined;
  if (etapa === 'gerente' || etapa === 'criador' || etapa === 'moderador') return 'medium';
  if (etapa === 'cliente') return 'low';
  if (etapa === 'intencao') return /^claude-haiku-5/.test(modelo) ? 'none' : 'low';
  return undefined;
}

/** O gerente em Claude leva a conferência de evidências no prompt (ver `conferencia-evidencias.ts`). */
export function gerenteComConferencia(etapa: string, modelo: string): boolean {
  return etapa === 'gerente' && modelo.startsWith('claude');
}

export function modeloVertho(
  etapa: 'criador' | 'cliente' | 'moderador' | 'intencao' | 'gerente',
  _nivel: 1 | 2 | 3,
) {
  if (etapa === 'gerente')
    return { modelo: 'claude-sonnet-5-5', esforco: 'medium' as const };
  if (etapa === 'criador' || etapa === 'cliente')
    return { modelo: BEDROCK_KIMI_K3_MODEL, esforco: 'low' as const };
  // Moderador (corrigido em 08/10/2026): `medium`, não `none`. O Haiku 5.5 sem raciocínio SUBESTIMA a severidade (em 56 casos,
  // com 3 repetições: acerta 18 de 26 violações, contra 23 de 26 em `medium` e no Gemini que ele substituiu). Cinco violações
  // não leves ficavam sem alerta (jailbreak explícito, generalização discriminatória) e a severidade vira penalidade na nota
  // (`PENALIDADE` em avaliacao.ts: leve 0,5, moderada 1,5, grave 2,5). `medium` repetiu 23/26 em duas execuções e NÃO custou
  // latência nesta tarefa curta (p50 de 1,2 s, igual ao `none`). Detalhe em docs/CUSTO-QUALIDADE.md.
  if (etapa === 'moderador')
    return { modelo: 'claude-haiku-5-5', esforco: 'medium' as const };
  // Intenção: decisão binária com saída de 19 a 40 tokens. `none` desliga o raciocínio do Haiku 5.5, que é LIGADO por padrão
  // mesmo em `low`, e acertou 35 de 35 (105 de 105 chamadas), igual ao `medium`. Aqui não há severidade para calibrar.
  return { modelo: 'claude-haiku-5-5', esforco: 'none' as const };
}
