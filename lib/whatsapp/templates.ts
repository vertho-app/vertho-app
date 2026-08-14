/**
 * FONTE ÚNICA dos templates de WhatsApp — o corpo aqui é BYTE-IGUAL ao que foi
 * submetido à Meta (`scripts/_sync-templates-whatsapp.ts`).
 *
 * POR QUE ISTO EXISTE
 * ───────────────────
 * A Cloud API oficial só entrega mensagem iniciada pela empresa através de
 * TEMPLATE APROVADO — um objeto que vive no servidor da Meta, com o texto fixo e
 * variáveis posicionais `{{1}}`, `{{2}}`. O caminho legado (Z-API por QR) manda
 * texto livre montado em TypeScript.
 *
 * São dois consumidores da MESMA copy. Se cada um tiver a sua cópia, elas
 * divergem — e a divergência é invisível, porque nenhuma tela mostra o que foi
 * entregue. Esta base já pagou por isso três vezes num único dia (29/07): a
 * correção estava sempre no gêmeo que não roda. Aqui o texto livre é gerado
 * SUBSTITUINDO as variáveis do corpo do template, então não há segunda cópia
 * para divergir: se o template mudar, o texto do legado muda junto.
 *
 * ⚠️ MUDOU O `body`? O template da Meta precisa ser REENVIADO e reaprovado. Rode
 * o script de sync — editar só este arquivo faz o legado mandar um texto que o
 * template aprovado não conhece, e aí os dois caminhos voltam a divergir.
 *
 * CATEGORIA É DINHEIRO (medido em 14/08/2026)
 * ───────────────────────────────────────────
 * UTILITY custa R$ 0,06–0,09 no Brasil; MARKETING custa R$ 0,40–0,55 — 6×. E a
 * categoria NÃO é o que você declara: a Meta reclassifica na revisão. Três dos
 * sete primeiros templates foram submetidos como UTILITY e voltaram MARKETING.
 *
 * O que derrubou, comparando os que caíram com os que passaram:
 *   - nome do produto no corpo ("plataforma Vertho Mentor IA")  → derruba
 *   - urgência ("Acesse agora", "dá tempo até o fim da semana") → derruba
 *   - pergunta engajadora ("Você já fez seu desafio?")          → derruba
 *   - assinatura "— Equipe Vertho" no rodapé                    → tolerada
 *   - fato sobre o estado da conta da pessoa                    → passa
 *
 * A amostra é de sete templates, não setenta: trate como heurística observada,
 * não como regra publicada pela Meta. O guard em
 * `tests/unit/integrations/whatsapp-templates.test.ts` congela esses sinais para
 * que copy nova não reintroduza um deles sem alguém decidir isso de propósito.
 */

export type TemplateCategoria = 'UTILITY' | 'AUTHENTICATION' | 'MARKETING';

export interface TemplateDef {
  /** Nome na Meta (minúsculas e underscore — é a chave da API). */
  name: string;
  category: TemplateCategoria;
  /** Código de idioma da Meta (pt_BR, en_US...). */
  language: string;
  /** Corpo com variáveis posicionais `{{1}}`, `{{2}}`, … */
  body: string;
  /** Exemplo por variável, na ordem — a Meta EXIGE para aprovar. */
  example: string[];
}

/**
 * Ordem das variáveis é contrato: `{{1}}` é sempre o primeiro item de `params`.
 * Trocar a ordem sem reenviar o template entrega os valores nos lugares errados
 * — e isso o typecheck não pega, porque tudo é string.
 */
export const TEMPLATES = {
  /** Quinta da semana de aplicação (4/8/12): cobra o registro de evidência. */
  evidencia_semanal: {
    name: 'registro_evidencia',
    category: 'UTILITY',
    language: 'pt_BR',
    body: 'Olá, {{1}}. Você está na semana {{2}} da sua trilha de desenvolvimento.\n\nO registro de evidências desta semana está pendente. Você pode registrar em:\n{{3}}\n\nAs evidências registradas são usadas para ajustar as próximas semanas da sua trilha.',
    example: ['Maria', '5', 'https://ibipeba.vertho.ai/dashboard/temporada/semana/5'],
  },

  /** Quinta das semanas de conteúdo: cobra a prática do desafio da semana. */
  nudge_desafio: {
    name: 'registro_desafio',
    category: 'UTILITY',
    language: 'pt_BR',
    body: 'Olá, {{1}}. O desafio da semana {{2}} da sua trilha ainda não foi registrado.\n\nVocê pode rever o desafio e relatar como foi em:\n{{3}}\n\nO relato é usado para acompanhar sua evolução na trilha.',
    example: ['Maria', '5', 'https://ibipeba.vertho.ai/dashboard/temporada/semana/5'],
  },

  /** Resultado do assessment comportamental liberado. */
  perfil_disponivel: {
    name: 'resultado_perfil',
    category: 'UTILITY',
    language: 'pt_BR',
    body: 'Olá, {{1}}. O resultado do seu perfil comportamental já está disponível na sua conta.\n\nVocê pode consultar em:\n{{2}}\n\nO resultado é usado para personalizar as próximas etapas da sua trilha.',
    example: ['Maria', 'https://ibipeba.vertho.ai/dashboard/perfil-comportamental'],
  },
} as const satisfies Record<string, TemplateDef>;

export type TemplateNome = keyof typeof TEMPLATES;

/**
 * ⚠️ A CHAVE do objeto acima é interna; `name` é o que existe na Meta, e os dois
 * DIVERGEM de propósito em três casos (`evidencia_semanal` → `registro_evidencia`
 * etc.).
 *
 * Por quê, medido em 14/08/2026: os nomes originais foram submetidos, voltaram
 * reclassificados como MARKETING, e foram apagados para recriar com copy factual
 * — mas a Meta **bloqueia recriar um nome com categoria diferente enquanto a
 * exclusão processa**, e esse bloqueio dura muito mais que o "menos de 1 minuto"
 * que a mensagem de erro promete. Os três nomes ficaram inutilizáveis.
 *
 * A lição, que vale para qualquer template futuro: **crie a versão corrigida com
 * um nome NOVO e só então apague a antiga.** Apagar primeiro deixa você sem os
 * dois.
 */

/** Quantas variáveis `{{n}}` o corpo declara (o MAIOR índice, não a contagem). */
export function contarVariaveis(body: string): number {
  const indices = [...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  return indices.length ? Math.max(...indices) : 0;
}

/**
 * Renderiza o corpo substituindo `{{n}}` pelos parâmetros — é assim que o
 * caminho legado (texto livre) reaproveita a copy do template aprovado.
 *
 * LANÇA se a quantidade não bater. Deixar passar produziria uma mensagem com
 * `{{3}}` cru no meio do texto, entregue a uma pessoa real — e essa falha é
 * exatamente a que ninguém observa, porque nenhuma tela mostra o que saiu. Aqui
 * é construção de mensagem, não entrega: falhar alto é o lado certo da régua de
 * `lib/degradacao.ts`.
 */
export function renderTemplate(def: TemplateDef, params: string[]): string {
  const esperadas = contarVariaveis(def.body);
  if (params.length !== esperadas) {
    throw new Error(
      `template ${def.name}: esperava ${esperadas} variáveis, recebeu ${params.length}`,
    );
  }
  return def.body.replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1] ?? '');
}

/** Payload de criação na Graph API (`POST /{waba-id}/message_templates`). */
export function payloadDaMeta(def: TemplateDef) {
  return {
    name: def.name,
    language: def.language,
    category: def.category,
    components: [{ type: 'BODY', text: def.body, example: { body_text: [def.example] } }],
  };
}
