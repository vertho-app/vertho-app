/**
 * Gera roteiro de vídeo (3-5 min) para gravação externa/HeyGen.
 * Texto corrido, linguagem oral, pronto para narração.
 */
interface PromptVideoScriptParams {
  competencia: string;
  descritor: string;
  nivelMin?: number;
  nivelMax?: number;
  cargo?: string;
  contexto?: string;
  duracaoSegundos?: number | null;
}

export function promptVideoScript({ competencia, descritor, nivelMin = 1.0, nivelMax = 2.0, cargo = 'todos', contexto = 'generico', duracaoSegundos = null }: PromptVideoScriptParams) {
  const duracao = duracaoSegundos ? `${Math.floor(duracaoSegundos/60)}:${String(duracaoSegundos%60).padStart(2,'0')}` : '3:00';
  const palavrasAlvo = duracaoSegundos ? Math.round(duracaoSegundos * 2.5) : 450;
  const focoPorNivel = nivelMin <= 1.5
    ? 'FUNDAMENTOS — pessoa começando a desenvolver. Conceitos básicos, exemplos diretos.'
    : nivelMin <= 2.5
    ? 'REFINAMENTO — pessoa que já pratica mas quer aprimorar. Nuances, casos menos óbvios.'
    : 'MAESTRIA — quem já domina e quer transferir/liderar. Casos complexos, dilemas.';

  const system = `Você é roteirista de micro-aprendizagem da Vertho, especializado em vídeos curtos de desenvolvimento profissional.

Sua tarefa é criar um roteiro em texto corrido para um vídeo de 3 a 5 minutos.

ATENÇÃO:
Este roteiro não é uma palestra.
Não é artigo falado.
Não é texto institucional.
Ele precisa soar como uma conversa clara, prática e bem construída entre colegas.

PRINCÍPIOS INEGOCIÁVEIS:
1. Linguagem oral e natural em português brasileiro.
2. Frases curtas, com boa respiração (máx ~20 palavras quando possível).
3. Nada de markdown.
4. Nada de emojis.
5. Nada de indicações de câmera, cena ou edição.
6. O texto deve ser gravável do jeito que sair.
7. O vídeo deve ser útil para quem está trabalhando, não para quem quer teoria acadêmica.

REGRAS DE ESTILO:
- Conversa entre colegas, não palestra
- Parágrafos curtos
- Sem jargão excessivo
- Sem repetir a mesma ideia de três jeitos
- Sem soar robótico
- Sem soar motivacional demais
- Densidade prática > densidade teórica
- Tom curioso, não autoritário

REGRAS DE QUALIDADE:
- O exemplo deve ser coerente com cargo/contexto
- O descritor deve aparecer na prática, não só na definição
- O roteiro deve ter começo forte e final claro
- Evitar abstrações vazias e metáforas excessivas
- Personagens nomeados quando houver storytelling (ex: "Ana, gerente regional...")`;

  const user = `Crie 1 roteiro de vídeo de ~${duracao} min (~${palavrasAlvo} palavras) para o tema abaixo.

CONTEXTO:
- Competência: ${competencia}
- Descritor foco: ${descritor}
- Nível alvo: ${nivelMin}-${nivelMax} → ${focoPorNivel}
- Cargo alvo: ${cargo}
- Contexto: ${contexto}

ESTRUTURA OBRIGATÓRIA (4 blocos naturais):

GANCHO (~40 palavras):
Abrir com uma dor, situação reconhecível, pergunta ou contraste forte.
Sem saudação. Sem clichê. Vai direto.
NUNCA cite o nome do descritor no gancho — prenda primeiro, explique depois.

CONCEITO (~150 palavras):
Explicar o descritor de forma simples e aplicada.
Sem definição acadêmica engessada.
Máximo 2 conceitos-chave.
Mostrar por que isso importa na prática.

EXEMPLO PRÁTICO (~200 palavras):
Trazer uma situação plausível do trabalho.
Personagens com nomes.
Mostrar comportamento concreto — o que a pessoa fez, como decidiu, o que mudou.
Storytelling com começo/meio/fim.
Ajudar a visualizar o conceito em ação.

CHAMADA FINAL (~60 palavras):
Fechar com uma provocação, pergunta ou micro convite à aplicação.
Conectar com a rotina da semana.
Curta e memorável.

REGRAS FINAIS:
- Texto corrido, sem seções numeradas, sem bullets, sem títulos técnicos
- Os 4 blocos devem fluir naturalmente sem quebras artificiais
- Pronto para narração / gravação

Retorne APENAS o texto do roteiro, sem prefixo nem comentário.`;

  return { system, user };
}
