/**
 * Gera artigo markdown (800-1200 palavras) para leitura ativa.
 */
export function promptTextContent({ competencia, descritor, nivelMin = 1.0, nivelMax = 2.0, cargo = 'todos', contexto = 'generico' }) {
  const focoPorNivel = nivelMin <= 1.5 ? 'FUNDAMENTOS'
    : nivelMin <= 2.5 ? 'REFINAMENTO'
    : 'MAESTRIA';

  const system = `Você é autor de artigos práticos de desenvolvimento profissional. Prosa com respiro — não lista de bullets. Parágrafos curtos (3-4 linhas), negrito em conceitos-chave (máx 5), linguagem brasileira profissional mas acessível. Formato final: markdown.`;

  const user = `Crie 1 artigo de 800-1200 palavras em markdown.

CONTEXTO:
- Competência: ${competencia}
- Descritor: ${descritor}
- Nível: ${nivelMin}-${nivelMax} (${focoPorNivel})
- Cargo alvo: ${cargo}
- Contexto: ${contexto}

DIFERENÇA DOS OUTROS FORMATOS: leitura ativa. O colaborador controla o ritmo, relê trechos, faz anotações. Estrutura escaneável MAS NÃO é lista de bullet points — é prosa com respiro.

ESTRUTURA (sem usar os nomes das seções como headers):

1. TÍTULO (frase provocativa, não "O que é X"):
   Use \`# Título\` no markdown

2. SITUAÇÃO (1 parágrafo):
   Cenário reconhecível do dia a dia do cargo.

3. CONCEITO-CHAVE (2-3 parágrafos):
   Explique o descritor com exemplos práticos. Destaques em **negrito**.

4. FRAMEWORK (1 modelo mental, 3-5 passos):
   Use lista numerada. Cada passo = 1 pergunta ou ação observável.
   Exemplo: "1. Antes de delegar, pergunte-se: é claro o resultado esperado?"

5. PARA REFLETIR (2-3 perguntas):
   Termine com subseção \`## Para refletir\` seguida de bullets com perguntas.

REGRAS:
- Negrito em conceitos-chave (máx 5 por artigo)
- Parágrafos curtos (3-4 linhas)
- Inclua 1-2 exemplos reais contextualizados ao cargo
- NÃO use subtítulos genéricos tipo "Introdução", "Conclusão" — fluxo natural
- Markdown válido (títulos com #, ## / listas com - ou 1. / negrito com **)

Retorne APENAS o markdown, sem cercas de código \`\`\`md.`;

  return { system, user };
}
