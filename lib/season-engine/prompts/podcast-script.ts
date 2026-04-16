/**
 * Gera roteiro de podcast/áudio (3-5 min) para narração (ElevenLabs voice clone).
 * Linguagem íntima, storytelling, otimizada para consumo sem tela.
 */
interface PromptPodcastScriptParams {
  competencia: string;
  descritor: string;
  nivelMin?: number;
  nivelMax?: number;
  cargo?: string;
  contexto?: string;
  duracaoSegundos?: number | null;
}

export function promptPodcastScript({ competencia, descritor, nivelMin = 1.0, nivelMax = 2.0, cargo = 'todos', contexto = 'generico', duracaoSegundos = null }: PromptPodcastScriptParams) {
  const duracao = duracaoSegundos ? `${Math.floor(duracaoSegundos/60)}:${String(duracaoSegundos%60).padStart(2,'0')}` : '4:00';
  const palavrasAlvo = duracaoSegundos ? Math.round(duracaoSegundos * 2.3) : 500; // podcast ~140 palavras/min
  const focoPorNivel = nivelMin <= 1.5
    ? 'FUNDAMENTOS — histórias de descoberta, insight básico'
    : nivelMin <= 2.5
    ? 'REFINAMENTO — nuances, dilemas, casos ambíguos'
    : 'MAESTRIA — casos complexos, erros caros, decisões difíceis';

  const system = `Você é roteirista de podcast de desenvolvimento profissional. Tom conversa íntima, como se estivesse ao lado da pessoa. Usa "eu" e "você" — nunca "nós" ou "a gente". Storytelling > explicação. Inclui pausas naturais (reticências = pausa de 1s na narração). Zero markdown, zero emojis, zero bullets.`;

  const user = `Crie 1 roteiro de áudio/podcast de ~${duracao} min (~${palavrasAlvo} palavras).

CONTEXTO:
- Competência: ${competencia}
- Descritor: ${descritor}
- Nível: ${nivelMin}-${nivelMax} → ${focoPorNivel}
- Cargo alvo: ${cargo}
- Contexto: ${contexto}

DIFERENÇA DO VÍDEO: áudio é pra quem está caminhando, dirigindo, entre atividades. Sem visual. Mais narrativo, mais reflexivo.

ESTRUTURA (4 blocos, texto corrido):

[ABERTURA] (0:00-0:20, ~60 palavras):
História curta ou situação cotidiana, narrada em primeira pessoa.
Exemplo: "Outro dia eu estava conversando com uma gerente que me contou uma coisa que me fez parar..."

[CONCEITO] (0:20-1:30, ~180 palavras):
Explique o descritor, mas contado como insight, não como definição.
Exemplo: "E aí eu percebi uma coisa que muda tudo..."

[APROFUNDAMENTO] (1:30-3:00, ~220 palavras):
Caso real anonimizado com detalhes narrativos. O ouvinte se imagina na situação.
Use "pensa comigo...", "imagina a seguinte cena...".
Deixe 2-3 pausas estratégicas (reticências).

[PROVOCAÇÃO] (3:00-3:30, ~60 palavras):
Pergunta para reflexão pessoal. "E você, quando foi a última vez que...?"
Conexão com ação prática da semana.

REGRAS:
- Zero markdown, zero bullets, zero seções numeradas
- Texto corrido otimizado para narração
- Inclua reticências (...) como pausas dramáticas
- NUNCA leia o nome do descritor antes do conceito

Retorne APENAS o texto do roteiro, pronto para gravação.`;

  return { system, user };
}
