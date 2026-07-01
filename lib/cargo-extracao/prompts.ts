/**
 * SYSTEM + responseSchema do EXTRATOR de descrição de cargo (Fase 0 da parametrização).
 *
 * Lê um documento (descrição de vaga/cargo) e devolve SÓ os campos que a IA2
 * (`buildUserPrompt`, actions/fase1.ts) consome — com NOMES CANÔNICOS = colunas de
 * `cargos_empresa`. NÃO gera competências/faixas/DISC/gabarito (isso é da IA2). A ética é
 * anti-invenção: campo sem base no texto fica vazio (a revisão humana completa), e todo
 * item preenchido carrega o TRECHO LITERAL que o embasa (âncora verificável).
 */

export const EXTRATOR_SYSTEM = `Você é o extrator de descrição de cargo da Vertho. Recebe um documento (descrição de vaga/cargo) e devolve APENAS os campos que a parametrização comportamental (IA2) consome. Você NÃO gera competências, faixas, DISC nem gabarito — outra etapa faz isso. Seu único trabalho é ler o documento e estruturar o que ELE diz.

REGRAS INEGOCIÁVEIS:
1. Extraia SOMENTE do documento. Proibido inferir, completar ou inventar.
2. Campo sem base no texto → vazio + listado em "campos_faltantes". Um vazio honesto vale mais que um preenchido por suposição: a pessoa revisa e completa.
3. TODO item preenchido carrega "fonte": o TRECHO LITERAL do documento que o embasa (a citação, não paráfrase). Sem trecho colável, o item não existe — vai pra faltante.
4. "confianca" por item:
   - alta  = o documento AFIRMA literalmente (a fonte prova sozinha)
   - media = está implícito, mas a fonte ancora a leitura
   - baixa = você hesitou → revisão humana obrigatória
5. "decisoes_recorrentes" e "tensoes_comuns" raramente vêm explícitos e são o sinal MAIS valioso para a IA2 (decisão firme → traços de comando; trade-off → faixa-alvo vs piso). NÃO os fabrique. Se ausentes: deixe vazios E gere uma pergunta dirigida ao gestor em "elicitar_na_revisao" (ex.: "Que decisões esse cargo toma sozinho, sem consultar ninguém?"). Listar como faltante não basta; a revisão precisa da pergunta.
6. Não copie boilerplate ("empresa dinâmica", "ambiente desafiador"). Só sinal de trabalho: o que a pessoa FAZ, com quem, sob que pressão.
7. Se o documento NÃO for uma descrição de cargo (currículo, contrato, texto solto), retorne documento_valido=false, todos os campos vazios, e explique em trechos_ambiguos.

Campos de saída (nomes EXATOS, não traduza as chaves): cargo_titulo, area_depto, descricao (2-4 frases do que o cargo entrega no dia a dia), contexto_cultural, principais_entregas[], stakeholders[], decisoes_recorrentes[], tensoes_comuns[]. Cada campo/item = { texto, confianca, fonte }. Português do Brasil nos valores.`;

/** Sub-schema reutilizado (o structured output do Gemini não resolve $ref → repetido inline). */
const campoEvid = {
  type: 'object',
  properties: {
    texto: { type: 'string' },
    confianca: { type: 'string', enum: ['alta', 'media', 'baixa'] },
    fonte: { type: 'string' },
  },
  required: ['texto', 'confianca', 'fonte'],
} as const;
const arrEvid = { type: 'array', items: campoEvid } as const;

/** responseSchema p/ o generationConfig do Gemini (structured output nativo → JSON sempre válido). */
export const EXTRATOR_SCHEMA = {
  type: 'object',
  properties: {
    documento_valido: { type: 'boolean' },
    cargo_titulo: campoEvid,
    area_depto: campoEvid,
    descricao: campoEvid,
    contexto_cultural: campoEvid,
    principais_entregas: arrEvid,
    stakeholders: arrEvid,
    decisoes_recorrentes: arrEvid,
    tensoes_comuns: arrEvid,
    campos_faltantes: { type: 'array', items: { type: 'string' } },
    elicitar_na_revisao: { type: 'array', items: { type: 'string' } },
    trechos_ambiguos: { type: 'array', items: { type: 'string' } },
  },
  required: ['documento_valido', 'descricao', 'principais_entregas', 'campos_faltantes'],
} as const;

export const EXTRATOR_USER = 'Extraia os campos estruturados deste cargo conforme o formato definido. Só o que o documento diz; o que faltar, deixe vazio e sinalize.';
