/**
 * `votacao_pendente_v3`: o template submetido à Meta em 05/10/2026 (id
 * 1808140096867051, R-117 da revisão de 02/10/2026) para substituir o
 * `votacao_pendente`, com o texto EXATO enviado. A Meta compara o corpo ao
 * aprovar, então o texto do código (`lib/whatsapp/templates.ts`) tem que ser byte
 * a byte este.
 *
 * Sai a variável `{{4}}` do prazo: a votação só fecha quando o admin a desliga, e
 * o prazo "às 23h59" que a v2 prometia não existia no sistema.
 *
 * ⚠️ Estes literais são a CÓPIA CONGELADA do que saiu na submissão, de propósito
 * duplicada: se o corpo do código for editado (uma palavra, a ordem de duas
 * variáveis, o `{{4}}` de volta), o teste que compara os dois cai. Mudar este
 * arquivo é decidir submeter OUTRA versão à Meta, com nome novo, e não um ajuste
 * de teste. O estado real na Meta (PENDING ou APPROVED) se confere lá
 * (`GET /{waba}/message_templates?fields=name,status,category,correct_category`),
 * nunca aqui.
 */
export const VOTACAO_PENDENTE_V3 = {
  id: '1808140096867051',
  /** O template antigo que este substitui (continua APPROVED na Meta). */
  substitui: 'votacao_pendente',
  body: 'Olá, {{1}}. Seu voto na escolha das competências do seu cargo, no programa da {{2}}, ainda não foi registrado.\n\nVocê pode votar em:\n{{3}}\n\nA votação leva cerca de 5 minutos, e o resultado define as competências trabalhadas na Jornada.',
  example: ['Maria', '4Life Educação', 'https://4life-educacao.vertho.ai/dashboard/votacao'],
  variaveis: 3,
  /** O mesmo corpo com o `example` já aplicado, escrito à mão (não gerado pelo código). */
  renderizadoComExemplo: 'Olá, Maria. Seu voto na escolha das competências do seu cargo, no programa da 4Life Educação, ainda não foi registrado.\n\nVocê pode votar em:\nhttps://4life-educacao.vertho.ai/dashboard/votacao\n\nA votação leva cerca de 5 minutos, e o resultado define as competências trabalhadas na Jornada.',
} as const;

/** O texto da v2 ANTIGA, como está APPROVED na Meta (o prazo "às 23h59" que a revisão apontou). */
export const VOTACAO_PENDENTE_V2_ANTIGA =
  'Olá, {{1}}. Seu voto na escolha das competências do seu cargo, no programa da {{2}}, ainda não foi registrado.\n\nVocê pode votar em:\n{{3}}\n\nO prazo para registro do voto é {{4}}, às 23h59. A votação leva cerca de 5 minutos, e o resultado define as competências trabalhadas no programa.';
