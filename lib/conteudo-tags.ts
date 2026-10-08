import { z } from 'zod';

const sugestaoSchema = z.object({
  pilar: z.string().trim().nullable(),
  competencia: z.string().trim().min(1),
  descritor: z.string().trim().nullable(),
  nivel_min: z.number().int().min(1).max(4),
  nivel_max: z.number().int().min(1).max(4),
  contexto: z.enum(['educacional', 'corporativo', 'generico']),
  cargo: z.string().trim().min(1),
  setor: z.string().trim().min(1),
  tipo_conteudo: z.enum(['video', 'texto', 'audio', 'case', 'ferramenta', 'outro']),
  confianca: z.enum(['alta', 'media', 'baixa']),
  raciocinio: z.string().trim().min(1),
}).refine(t => t.nivel_min <= t.nivel_max);

/** Teto de saída da sugestão (JSON curto, sem raciocínio): o que a action usava para todo modelo. */
export const TETO_TAGS_PADRAO = 1000;
/**
 * Teto em Claude: na geração 5 o raciocínio divide o `max_tokens` com o texto, e 1.000 cortaria o JSON. 3.000 foi o teto
 * medido (08/10/2026, 156 chamadas por braço, todas dentro do teto).
 */
export const TETO_TAGS_CLAUDE = 3000;

/**
 * Teto e esforço da chamada por modelo. Só o Claude recebe esforço: `low`, o medido (Sonnet 5.5 `low` empatou o acerto do
 * Gemini e foi o único com estabilidade de 98,7% entre repetições junto com ele; o padrão da geração 5 é `high`, mais lento
 * e não testado). Os demais modelos seguem exatamente como rodavam, sem esforço e com o teto de antes.
 */
export function configDaChamadaDeTags(modelo: string | undefined | null): {
  maxTokens: number;
  reasoningEffort?: 'low';
} {
  return String(modelo || '').startsWith('claude')
    ? { maxTokens: TETO_TAGS_CLAUDE, reasoningEffort: 'low' }
    : { maxTokens: TETO_TAGS_PADRAO };
}

/** Sugestão só chega ao editor com forma válida e competência do catálogo. */
export function validarSugestaoTags(bruto: unknown, competencias: string[]) {
  const resultado = sugestaoSchema.safeParse(bruto);
  if (!resultado.success || !competencias.includes(resultado.data.competencia)) {
    throw new Error('A IA retornou uma classificação inválida ou uma competência fora do catálogo. Revise o conteúdo e tente novamente.');
  }
  return resultado.data;
}
