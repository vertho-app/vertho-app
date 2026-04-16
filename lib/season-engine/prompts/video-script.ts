/**
 * Gera roteiro de vídeo (3-5 min) para gravação externa/HeyGen.
 * Linguagem de câmera: frases curtas, conversa entre colegas, sem markdown.
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
  const palavrasAlvo = duracaoSegundos ? Math.round(duracaoSegundos * 2.5) : 450; // ~150 palavras/min
  const focoPorNivel = nivelMin <= 1.5
    ? 'FUNDAMENTOS — aquela pessoa que está começando a desenvolver esse descritor. Conceitos básicos, exemplos diretos.'
    : nivelMin <= 2.5
    ? 'REFINAMENTO — pessoa que já pratica mas quer aprimorar. Nuances, casos menos óbvios.'
    : 'MAESTRIA — quem já domina e quer transferir para liderar. Casos complexos, dilemas.';

  const system = `Você é roteirista especializado em micro-aprendizagem (vídeo de 3-5 min). Linguagem conversa entre colegas, não palestra. Frases curtas (máx 20 palavras). Português brasileiro natural. Zero markdown, zero indicações de câmera, zero emojis.`;

  const user = `Crie 1 roteiro de vídeo de ~${duracao} min (~${palavrasAlvo} palavras) para o tema abaixo.

CONTEXTO:
- Competência: ${competencia}
- Descritor foco: ${descritor}
- Nível alvo: ${nivelMin}-${nivelMax} → ${focoPorNivel}
- Cargo alvo: ${cargo}
- Contexto: ${contexto}

ESTRUTURA OBRIGATÓRIA (4 blocos):

[GANCHO] (0:00-0:15, ~40 palavras):
Pergunta provocativa OU situação reconhecível do dia a dia. Sem saudação. Vai direto.

[CONCEITO] (0:15-1:30, ~150 palavras):
Explique o descritor na prática. Máximo 2 conceitos-chave. Exemplos concretos.

[EXEMPLO] (1:30-3:00, ~200 palavras):
Cenário com personagens fictícios (dê nomes). Mostre comportamento CERTO e ERRADO.
Storytelling com começo/meio/fim. Deixe visual mesmo sendo áudio.

[CHAMADA] (3:00-3:30, ~60 palavras):
Conecte com uma micro-ação prática da semana do colaborador.
Frase de encerramento memorável.

REGRAS:
- Texto corrido, sem seções numeradas, sem bullets
- NUNCA cite o nome do descritor no gancho (prenda primeiro, explique depois)
- Personagens nomeados (ex: "Ana, gerente regional...")
- Tom: curioso, não autoritário

Retorne APENAS o texto do roteiro, pronto para gravação, sem prefixo nem comentário.`;

  return { system, user };
}
