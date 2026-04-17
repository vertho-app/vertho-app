/**
 * Gera artigo markdown (800-1200 palavras) para leitura ativa.
 */
interface PromptTextContentParams {
  competencia: string;
  descritor: string;
  nivelMin?: number;
  nivelMax?: number;
  cargo?: string;
  contexto?: string;
}

export function promptTextContent({ competencia, descritor, nivelMin = 1.0, nivelMax = 2.0, cargo = 'todos', contexto = 'generico' }: PromptTextContentParams) {
  const focoPorNivel = nivelMin <= 1.5 ? 'FUNDAMENTOS — conceitos básicos, exemplos diretos'
    : nivelMin <= 2.5 ? 'REFINAMENTO — nuances, casos menos óbvios'
    : 'MAESTRIA — casos complexos, dilemas, transferência';

  const system = `Você é autor de artigos práticos de desenvolvimento profissional da Vertho.

Sua tarefa é criar um microartigo em markdown, claro, útil e agradável de ler, sobre um descritor de competência.

ATENÇÃO:
Este texto não é artigo acadêmico.
Não é blog genérico.
Não é apostila.
Não é aula escrita.
Ele deve funcionar como um conteúdo curto de aprendizagem aplicada.

PRINCÍPIOS INEGOCIÁVEIS:
1. Prosa com respiro, não lista de bullets.
2. Parágrafos curtos, de 3 a 4 linhas quando possível.
3. Markdown limpo.
4. No máximo 5 trechos em negrito.
5. Linguagem brasileira profissional, mas acessível.
6. Clareza e aplicabilidade valem mais que sofisticação.
7. Nada de academicismo desnecessário.
8. Nada de texto genérico que serviria para qualquer descritor.

REGRAS DE ESTILO:
- Prosa fluida com respiro visual
- Linguagem concreta
- Exemplos plausíveis pro cargo/contexto
- Sem jargão em excesso
- Sem tom professoral
- Sem exagero motivacional
- Sem repetição de ideias
- Sem listas longas
- Sem subtítulos genéricos ("Introdução", "Conclusão")
- Sem linhas separadoras "---"
- Fluxo natural entre seções`;

  const user = `Crie 1 artigo de 800-1200 palavras em markdown.

CONTEXTO:
- Competência: ${competencia}
- Descritor: ${descritor}
- Nível: ${nivelMin}-${nivelMax} (${focoPorNivel})
- Cargo alvo: ${cargo}
- Contexto: ${contexto}

DIFERENÇA DOS OUTROS FORMATOS: leitura ativa. O colaborador controla o ritmo, relê trechos, faz anotações. Estrutura escaneável MAS NÃO é lista de bullets — é prosa com respiro.

ESTRUTURA OBRIGATÓRIA (sem usar os nomes das seções como headers):

1. TÍTULO
- Frase provocativa, curta e viva. Use \`# Título\`
- Sem soar como nome de disciplina

2. SITUAÇÃO (1 parágrafo)
- Abrir por uma cena, dor, dilema ou situação reconhecível do cargo
- Gerar conexão rápida com a realidade do trabalho

3. CONCEITO (2-3 parágrafos)
- Explicar o descritor de forma simples e aplicada
- Sem definição travada
- Mostrar por que isso importa na prática
- Destaques em **negrito** (máx 5 no artigo todo)
- 1-2 exemplos contextualizados ao cargo

4. FRAMEWORK (1 modelo mental, 3-5 passos)
- Oferecer forma simples de aplicar
- Lista numerada, cada passo = 1 pergunta ou ação observável
- Memorável, leve e acionável
- Apresentado como ferramenta prática, não como receita acadêmica

5. PARA REFLETIR (2-3 perguntas)
- Subseção \`## Para refletir\` com bullets de perguntas
- Ajudar a pessoa a olhar para a própria prática
- Sem autoajuda vazia

REGRAS FINAIS:
- Markdown válido (títulos com #, ## / listas com - ou 1. / negrito com **)
- NÃO use cercas de código \`\`\`md
- O texto deve funcionar bem em tela e PDF

Retorne APENAS o markdown, sem comentários extras.`;

  return { system, user };
}
