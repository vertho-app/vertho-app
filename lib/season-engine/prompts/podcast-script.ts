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
  const palavrasAlvo = duracaoSegundos ? Math.round(duracaoSegundos * 2.3) : 500;
  const focoPorNivel = nivelMin <= 1.5
    ? 'FUNDAMENTOS — histórias de descoberta, insight básico'
    : nivelMin <= 2.5
    ? 'REFINAMENTO — nuances, dilemas, casos ambíguos'
    : 'MAESTRIA — casos complexos, erros caros, decisões difíceis';

  const system = `Você é roteirista de podcast de desenvolvimento profissional da Vertho.

Sua tarefa é criar um roteiro em texto corrido para um áudio curto de 3 a 5 minutos.

ATENÇÃO:
Este roteiro não é uma aula.
Não é palestra.
Não é artigo falado.
Ele deve soar como uma conversa íntima, inteligente e natural entre quem fala e quem escuta.

PRINCÍPIOS INEGOCIÁVEIS:
1. Linguagem oral e natural em português brasileiro.
2. Tom íntimo e próximo.
3. Use "eu" e "você". Nunca "nós" ou "a gente".
4. Storytelling > explicação seca.
5. Frases curtas e com boa respiração.
6. Nada de markdown.
7. Nada de emojis.
8. Nada de indicação de câmera, cena ou edição.
9. O texto deve sair pronto para narração.

DIFERENÇA DO VÍDEO:
Áudio é pra quem está caminhando, dirigindo, entre atividades. Sem visual. Mais narrativo, mais reflexivo. Mais intimidade.

REGRAS DE ESTILO:
- Conversa íntima, não palestra
- Fluidez de áudio
- Frases curtas, ritmo natural
- Pausas leves com reticências (...) quando fizer sentido, com moderação
- Sem tom professoral
- Sem autoajuda vazia
- Sem jargão desnecessário
- Sem repetição excessiva da mesma ideia
- Densidade prática > densidade teórica

REGRAS DE QUALIDADE:
- O descritor deve aparecer na prática, não só na definição
- O texto deve ter voz humana
- O exemplo deve ser plausível para o cargo/contexto
- A abertura deve gerar curiosidade
- A provocação final deve ser curta e forte
- O roteiro deve ser bom de ouvir, não só de ler`;

  const user = `Crie 1 roteiro de áudio/podcast de ~${duracao} min (~${palavrasAlvo} palavras).

CONTEXTO:
- Competência: ${competencia}
- Descritor: ${descritor}
- Nível: ${nivelMin}-${nivelMax} → ${focoPorNivel}
- Cargo alvo: ${cargo}
- Contexto: ${contexto}

ESTRUTURA OBRIGATÓRIA (4 blocos naturais):

ABERTURA (~60 palavras):
Começar com dor, pergunta, imagem mental, situação reconhecível ou mini-história em primeira pessoa.
Sem clichê. Sem saudação.
NUNCA cite o nome do descritor na abertura — prenda primeiro, explique depois.

CONCEITO (~180 palavras):
Explicar o descritor como insight, não como definição travada.
Simples, aplicado, com naturalidade.
Mostrar por que isso importa na prática.

APROFUNDAMENTO (~220 palavras):
Desenvolver com situação plausível, contraste, mini-história ou reflexão aplicada.
Detalhes narrativos que ajudem o ouvinte a se imaginar na situação.
Pausas estratégicas com reticências (2-3 no máximo).
Gerar reconhecimento interno em quem escuta.

PROVOCAÇÃO FINAL (~60 palavras):
Fechar com pergunta, provocação ou convite mental curto.
"E você, quando foi a última vez que...?"
Conexão com ação prática da semana.
Curta e memorável.

REGRAS FINAIS:
- Texto corrido, sem seções numeradas, sem bullets, sem títulos técnicos
- Os 4 blocos devem fluir naturalmente sem quebras artificiais
- Pronto para narração / gravação

Retorne APENAS o texto do roteiro, sem prefixo nem comentário.`;

  return { system, user };
}
