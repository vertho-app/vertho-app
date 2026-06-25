/**
 * Gera estudo de caso narrativo — experiencial, não explicativo. Registro, extensão
 * e DOMÍNIO (protagonista/ambiente/conflito) ADAPTAM ao público (RegistroPublico).
 */
import { blocoCalibracaoPublico, type RegistroPublico } from '@/lib/season-engine/perfil-publico';

interface PromptCaseStudyParams {
  competencia: string;
  descritor: string;
  nivelMin?: number;
  nivelMax?: number;
  cargo?: string;
  contexto?: string;
  perfilPublico?: RegistroPublico;
}

export function promptCaseStudy({ competencia, descritor, nivelMin = 1.0, nivelMax = 2.0, cargo = 'todos', contexto = 'generico', perfilPublico }: PromptCaseStudyParams) {
  const dificuldade = nivelMin <= 1.5 ? 'SITUAÇÕES CLARAS — o descritor aparece de forma reconhecível nas ações'
    : nivelMin <= 2.5 ? 'DILEMAS AMBÍGUOS — múltiplas respostas plausíveis, fricção real'
    : 'CASOS COMPLEXOS — dilemas éticos, escolhas difíceis, consequências em cadeia';

  const simples = perfilPublico?.nivelLeitura === 'simples';
  const minChars = perfilPublico?.minCharsPdf ?? 8000;
  const metaTamanho = simples
    ? `aproximadamente 700 a 1.000 palavras (cerca de ${minChars} caracteres), leitura de 4 a 6 minutos. NÃO escreva mais que isso — uma história curta e concreta prende mais este público`
    : `NO MÍNIMO ${minChars} caracteres (contando espaços) — aproximadamente 1.400 a 1.800 palavras, leitura de 5 a 8 minutos`;
  const blocoPublico = perfilPublico ? blocoCalibracaoPublico(perfilPublico) : '';

  const system = `Você é autor de estudos de caso narrativos da Vertho.

Sua tarefa é criar um estudo de caso curto, imersivo e vivencial, em markdown, sobre um descritor de competência.

ATENÇÃO:
Este conteúdo não é um artigo.
Não é uma aula.
Não é um texto explicativo.
O colaborador não deve receber o conceito pronto.
Ele deve entrar na situação, sentir a tensão e tirar suas próprias conclusões.

PRINCÍPIOS INEGOCIÁVEIS:
1. O descritor NUNCA é mencionado pelo nome no texto.
2. O aprendizado vem da experiência da situação, não da explicação.
3. A narrativa precisa ter tensão real.
4. O contexto deve ser plausível para o cargo e a rotina.
5. O texto deve ser claro, imersivo e sem exagero.
6. O leitor precisa sair pensando, não apenas "entendendo o conceito".
7. O desfecho não pode matar toda ambiguidade de forma artificial.

REGRAS DE ESTILO:
- Markdown limpo
- Narrativa concreta e fluida
- Linguagem brasileira profissional, mas acessível
- Sem jargão excessivo
- Sem tom professoral
- Sem moral da história explícita
- Sem excesso de personagens (máx 3)
- Sem melodrama
- Detalhes sensoriais que ajudam a visualizar o ambiente real do público

REGRAS DE QUALIDADE:
- O caso deve ser coerente com cargo/contexto
- A tensão deve ser real, não artificial
- O descritor deve ser visível nas ações, decisões e omissões
- O desfecho deve gerar reflexão, não fechar tudo de forma limpa demais
- As perguntas devem abrir pensamento, não fechar
- O texto deve funcionar bem em tela e PDF${blocoPublico}`;

  const user = `Crie 1 estudo de caso narrativo em markdown, com ${metaTamanho}. Desenvolva a cena, os personagens, as fricções e as decisões com profundidade, sem encher de repetição.

CONTEXTO:
- Competência: ${competencia}
- Descritor (NUNCA cite pelo nome no texto): ${descritor}
- Nível: ${nivelMin}-${nivelMax} → ${dificuldade}
- Cargo alvo: ${cargo}
- Contexto: ${contexto}

ESTRUTURA OBRIGATÓRIA:

1. TÍTULO
- \`# [Nome do protagonista] e [o desafio]\`
- Curto, concreto, com cara de caso real

2. CONTEXTO (2-3 parágrafos)
- Apresente o protagonista (mesmo mundo do colab alvo — ver PÚBLICO E REGISTRO): nome, contexto, desafio
- Situe o ambiente com detalhes sensoriais do mundo real do público
- Sem excesso de exposição

3. DESENVOLVIMENTO (3-4 parágrafos)
- Aprofunde a situação: decisões, reações, fricções, dilemas
- Faça o descritor aparecer nas ações e escolhas, nunca no discurso
- Mostre o que o protagonista fez, como decidiu, o que complicou

4. DESFECHO (1-2 parágrafos)
- Resultado realista — nem totalmente positivo nem negativo
- Consequência perceptível que gere reflexão
- Espaço para interpretação do leitor

5. \`## Suas perguntas\`
- 3 perguntas abertas em bullets (-)
- Voltadas a interpretação, julgamento e aplicação
- Não perguntas escolares óbvias
- A última pode convidar a identificar onde o comportamento apareceu na história

REGRAS FINAIS:
- Protagonista com NOME e contexto — é uma pessoa, não um arquétipo
- Protagonista, ambiente e conflito DEVEM pertencer ao mundo do público (ver PÚBLICO E REGISTRO), nunca ao mundo acadêmico-pedagógico
- O DESCRITOR NUNCA É MENCIONADO pelo nome no texto
- Narrativa com tensão dramática (nem tudo dá certo)
- Markdown válido, sem cercas \`\`\`
- COMPRIMENTO: ${metaTamanho}

Retorne APENAS o markdown, sem comentários extras.`;

  return { system, user };
}
