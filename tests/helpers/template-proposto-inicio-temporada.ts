/**
 * `inicio_temporada`: o texto da abertura de uma temporada nova, SUBMETIDO à Meta em 08/10/2026
 * (id 1632488078229341, PENDING/UTILITY provisório no momento da submissão), com o conteúdo EXATO
 * enviado. O estado real (PENDING, APPROVED, a categoria e a `correct_category`) se confere na
 * Meta, nunca aqui.
 *
 * ⚠️ Estes literais são a CÓPIA CONGELADA do que o dono aprovou, de propósito duplicada: a Meta
 * compara o corpo ao aprovar, então se o corpo do código (`lib/whatsapp/templates.ts`) for editado
 * (uma palavra, a ordem de duas variáveis), o teste que compara os dois cai. Mudar este arquivo é
 * decidir submeter OUTRA versão, com nome novo, e não um ajuste de teste.
 */
export const INICIO_TEMPORADA = {
  id: '1632488078229341',
  body: 'Olá, {{1}}. Boas-vindas à sua temporada de {{2}}.\n\nPara começar, faça o mapeamento de competências no link abaixo:\n{{3}}\n\nSão 4 perguntas sobre uma situação real, cerca de 10 minutos por competência. É a partir dele que montamos a sua trilha de desenvolvimento.\n\nBoa temporada!',
  example: ['Maria', 'Comunicação', 'https://ibipeba.vertho.ai/dashboard/assessment'],
  variaveis: 3,
  /** O mesmo corpo com o `example` já aplicado, escrito à mão (não gerado pelo código). */
  renderizadoComExemplo: 'Olá, Maria. Boas-vindas à sua temporada de Comunicação.\n\nPara começar, faça o mapeamento de competências no link abaixo:\nhttps://ibipeba.vertho.ai/dashboard/assessment\n\nSão 4 perguntas sobre uma situação real, cerca de 10 minutos por competência. É a partir dele que montamos a sua trilha de desenvolvimento.\n\nBoa temporada!',
} as const;
