/**
 * Gera estudo de caso narrativo (600-1000 palavras) — experiencial, não explicativo.
 */
export function promptCaseStudy({ competencia, descritor, nivelMin = 1.0, nivelMax = 2.0, cargo = 'todos', contexto = 'generico' }) {
  const dificuldade = nivelMin <= 1.5 ? 'SITUAÇÕES ÓBVIAS (o descritor aparece de forma clara)'
    : nivelMin <= 2.5 ? 'DILEMAS AMBÍGUOS (múltiplas respostas plausíveis)'
    : 'CASOS COMPLEXOS (dilemas éticos, escolhas difíceis)';

  const system = `Você é autor de estudos de caso narrativos. Case imersivo e vivencial — o colaborador NÃO aprende um conceito, ele VIVE a situação e tira suas próprias conclusões. Não é explicativo, é experiencial. Tensão dramática. Formato markdown.`;

  const user = `Crie 1 estudo de caso de 600-1000 palavras em markdown.

CONTEXTO:
- Competência: ${competencia}
- Descritor: ${descritor}
- Nível: ${nivelMin}-${nivelMax} → ${dificuldade}
- Cargo alvo: ${cargo}
- Contexto: ${contexto}

ESTRUTURA:

1. TÍTULO:
   \`# [Nome do protagonista] e [o desafio]\`
   Exemplo: \`# Marina e o Projeto Pedagógico\`

2. CONTEXTO (2-3 parágrafos):
   Apresente o protagonista (mesmo cargo do colab alvo): nome, idade, onde trabalha,
   que desafio enfrenta. Use detalhes sensoriais (escritório, horário, pressão do prazo).

3. DESENVOLVIMENTO (3-4 parágrafos):
   Narre as decisões, reações dos stakeholders, erros e acertos do protagonista.
   O descritor aparece NAS AÇÕES, NUNCA é nomeado no texto.

4. DESFECHO (1-2 parágrafos):
   Resultado realista — nem totalmente positivo nem negativo.
   O colaborador DEVE perceber tensão dramática.

5. \`## Suas perguntas\`:
   Lista com 3 perguntas (bullets com -):
   - O que [protagonista] fez bem?
   - O que você faria diferente?
   - Em que momento o descritor apareceu na história? (NÃO revele antes)

REGRAS CRÍTICAS:
- Protagonista com NOME, IDADE, contexto — é uma pessoa, não um arquétipo
- O DESCRITOR NUNCA É MENCIONADO pelo nome no texto — aparece nas ações
- Narrativa com tensão dramática (nem tudo dá certo)
- O colaborador descobre o descritor nas perguntas finais
- Markdown válido

Retorne APENAS o markdown, sem cercas \`\`\`.`;

  return { system, user };
}
