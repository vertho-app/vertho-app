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

/** Sugestão só chega ao editor com forma válida e competência do catálogo. */
export function validarSugestaoTags(bruto: unknown, competencias: string[]) {
  const resultado = sugestaoSchema.safeParse(bruto);
  if (!resultado.success || !competencias.includes(resultado.data.competencia)) {
    throw new Error('A IA retornou uma classificação inválida ou uma competência fora do catálogo. Revise o conteúdo e tente novamente.');
  }
  return resultado.data;
}
