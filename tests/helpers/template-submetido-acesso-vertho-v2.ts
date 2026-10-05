/**
 * `acesso_vertho_v2`: o template submetido à Meta em 05/10/2026 (id
 * 1333940663142012, R-47 da revisão de 02/10/2026) para substituir o
 * `acesso_vertho`, com o texto EXATO enviado. A Meta compara o corpo ao aprovar,
 * então o texto do código (`lib/whatsapp/templates.ts`) tem que ser byte a byte
 * este.
 *
 * ⚠️ Estes literais são a CÓPIA CONGELADA do que saiu na submissão, de propósito
 * duplicada: se o corpo do código for editado, o teste que compara os dois cai.
 * Mudar este arquivo é decidir submeter OUTRA versão à Meta, com nome novo, e não
 * um ajuste de teste. O estado real na Meta (PENDING ou APPROVED) se confere lá
 * (`GET /{waba}/message_templates?fields=name,status,category,correct_category`),
 * nunca aqui.
 */
export const ACESSO_VERTHO_V2 = {
  id: '1333940663142012',
  /** O template antigo que este substitui (continua APPROVED na Meta). */
  substitui: 'acesso_vertho',
  /** Corpo sem variável: a credencial vai no botão. */
  body: 'Seu link de acesso à Vertho foi gerado. Toque no botão abaixo para entrar.\n\nO link vale por 1 hora e só pode ser usado uma vez.',
  example: [] as string[],
  botao: {
    texto: 'Acessar Vertho',
    url: 'https://app.vertho.ai/entrar?t={{1}}',
    exemplo: 'https://app.vertho.ai/entrar?t=ibipeba~pkce_a1b2c3d4e5f6a7b8',
  },
  /** O rodapé só existe na Meta: `TemplateDef` não modela rodapé. */
  rodape: 'Não compartilhe este link com ninguém.',
} as const;

/** O texto do template ANTIGO, como está APPROVED na Meta (o "15 minutos" que a revisão apontou). */
export const ACESSO_VERTHO_ANTIGO =
  'Seu link de acesso à Vertho foi gerado. Toque no botão abaixo para entrar.\n\nO link expira em 15 minutos e só pode ser usado uma vez.';
