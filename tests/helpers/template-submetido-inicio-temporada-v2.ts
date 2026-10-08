/**
 * `inicio_temporada_v2`: a versão ENXUTA da abertura de temporada, o texto aprovado pelo dono em
 * 08/10/2026 para a 2ª tentativa de ficar em UTILITY (o `inicio_temporada` voltou MARKETING). O
 * `id` da Meta e o momento da submissão estão em `docs/TEMPLATES-WHATSAPP.md`; o estado real
 * (PENDING, APPROVED, a categoria e a `correct_category`) se confere na Meta, nunca aqui.
 *
 * ⚠️ Estes literais são a CÓPIA CONGELADA do que saiu na submissão, de propósito duplicada: a Meta
 * compara o corpo, então se o corpo do código (`lib/whatsapp/templates.ts`) for editado (uma
 * palavra, a ordem de duas variáveis), o teste que compara os dois cai. Mudar este arquivo é
 * decidir submeter OUTRA versão, com nome novo, e não um ajuste de teste.
 */
export const INICIO_TEMPORADA_V2 = {
  body: 'Olá, {{1}}. O mapeamento de competências da sua temporada de {{2}}, no programa da {{3}}, já está disponível.\n\nVocê pode fazê-lo em:\n{{4}}\n\nSão 4 perguntas sobre uma situação real, cerca de 10 minutos por competência.',
  example: ['Maria', 'Comunicação', 'Secretaria Municipal de Ibipeba/BA', 'https://ibipeba.vertho.ai/dashboard/assessment'],
  variaveis: 4,
  /** O mesmo corpo com o `example` já aplicado, escrito à mão (não gerado pelo código). */
  renderizadoComExemplo: 'Olá, Maria. O mapeamento de competências da sua temporada de Comunicação, no programa da Secretaria Municipal de Ibipeba/BA, já está disponível.\n\nVocê pode fazê-lo em:\nhttps://ibipeba.vertho.ai/dashboard/assessment\n\nSão 4 perguntas sobre uma situação real, cerca de 10 minutos por competência.',
} as const;
