/**
 * Gera artigo markdown (mín. 8.000 caracteres, ~1.400-1.800 palavras) para leitura ativa.
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

  const system = `Você é autor sênior de conteúdos de desenvolvimento profissional da Vertho, especializado em textos profundos, aplicados e FÁCEIS DE TRANSFORMAR em publicação editorial premium.

O conteúdo será usado depois para gerar um PDF visual da Vertho. Portanto, ele precisa ter substância conceitual, exemplos práticos e ÂNCORAS EDITORIAIS claras (frases fortes, exemplos nomeáveis, perguntas, ferramentas, contrastes) que o PDF consiga transformar visualmente.

ATENÇÃO:
Este texto não é artigo acadêmico, blog genérico, apostila nem aula escrita.
Ele deve parecer uma conversa inteligente com um profissional adulto.

PRINCÍPIOS INEGOCIÁVEIS:
1. Linguagem brasileira profissional, clara e humana.
2. Parágrafos curtos, com respiro (3-4 linhas quando possível).
3. Markdown limpo. No máximo 5 trechos em negrito.
4. Densidade prática vale mais que teoria.
5. Específico ao cargo, contexto e descritor — nada que serviria para qualquer competência.
6. Não invente estatísticas, leis, normas ou evidências.
7. Sem jargão excessivo, sem tom infantil, professoral ou publicitário.
8. Sem linhas separadoras "---".`;

  const user = `Crie 1 conteúdo em markdown para desenvolvimento de competências, com NO MÍNIMO 8.000 caracteres (contando espaços) — aproximadamente 1.400 a 1.800 palavras. Desenvolva cada seção com profundidade (exemplos, nuance, aplicação ao cargo) em vez de encher com repetição.

CONTEXTO:
- Competência: ${competencia}
- Descritor: ${descritor}
- Nível: ${nivelMin}-${nivelMax} (${focoPorNivel})
- Cargo alvo: ${cargo}
- Contexto: ${contexto}

ESTRUTURA OBRIGATÓRIA (USE estes headers de seção):

# [Título provocativo, específico e memorável]
Conectado ao cotidiano do público, nunca genérico nem com cara de disciplina.

## Contexto
Abra com uma cena realista e reconhecível do cotidiano do cargo. Mostre a tensão principal do tema. Não comece por definição conceitual.

## Conceito
Explique o conceito central incluindo obrigatoriamente: o que é; o que NÃO é; por que importa; qual problema resolve; o que muda quando a competência é aplicada melhor. Inclua aqui UMA frase forte que possa virar pull quote.

## Exemplo aplicado
Pelo menos um exemplo prático com situação concreta, mostrando: problema → risco → leitura da situação → ação melhor → consequência esperada. Use um personagem fictício com nome comum brasileiro (nunca nomes reais), coerente com o cargo.

## Ferramenta prática
Um método, roteiro ou conjunto de perguntas aplicáveis, com 3 a 6 passos em LISTA NUMERADA. Cada item: título curto + explicação objetiva + aplicação prática. Será transformado em cards/ciclo/checklist no PDF.

## Aplicação no cotidiano
Como aplicar na rotina real do cargo: cuidados de aplicação; riscos de aplicar mal; como evitar resistência; uma pequena ação que a pessoa pode testar na semana. Inclua aqui mais UMA frase forte para destaque editorial.

## Para refletir
3 a 5 perguntas de reflexão em bullets (-): provocam autoanálise real, são aplicáveis ao cotidiano, evitam resposta óbvia e ajudam a transformar o conteúdo em ação.

ÂNCORAS EDITORIAIS (o texto deve oferecer naturalmente):
- pelo menos 2 frases fortes para pull quote;
- pelo menos 1 exemplo prático nomeável;
- pelo menos 1 ferramenta com passos numerados;
- pelo menos 1 tensão ou comparação implícita (ex.: reativo vs. preventivo);
- perguntas finais adequadas para cards de reflexão.

REGRAS FINAIS:
- Markdown válido (# / ## para headers, - ou 1. para listas, ** para negrito).
- NÃO use cercas de código \`\`\`.
- COMPRIMENTO: mínimo de 8.000 caracteres. Aprofunde com exemplos e nuance, nunca com enchimento repetitivo.

Retorne APENAS o markdown, sem comentários extras.`;

  return { system, user };
}
