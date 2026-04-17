/**
 * Gera o desafio semanal — micro-ação prática, observável, executável em 1 semana.
 */
interface PromptDesafioParams {
  competencia: string;
  descritor: string;
  nivel: number;
  cargo: string;
  contexto: string;
  semana: number;
}

export interface DesafioStructured {
  desafio_texto: string;
  acao_observavel: string;
  criterio_de_execucao: string;
  por_que_cabe_na_semana: string;
}

const NIVEL_PROGRESSAO: Record<string, string> = {
  '1': 'Nível 1 — ação simples, inicial, de baixo risco, orientada a prática básica',
  '2': 'Nível 2 — ação concreta com algum critério ou repetição intencional',
  '3': 'Nível 3 — ação de consistência, refinamento ou adaptação contextual',
  '4': 'Nível 4 — ação de influência, sustentação, exemplo ou multiplicação',
};

export function promptDesafio({ competencia, descritor, nivel, cargo, contexto, semana }: PromptDesafioParams) {
  const nivelInt = Math.max(1, Math.min(4, Math.round(nivel)));
  const progressao = NIVEL_PROGRESSAO[String(nivelInt)] || NIVEL_PROGRESSAO['2'];

  const system = `Você é um designer instrucional da Vertho especializado em micro-ações práticas para desenvolvimento de competências em adultos.

Sua tarefa é criar UM desafio semanal curto, observável e realista, ligado ao descritor da semana.

ATENÇÃO:
O desafio não é um conteúdo.
O desafio não é uma dica.
O desafio não é uma reflexão abstrata.
O desafio é uma MICRO-AÇÃO PRÁTICA.

OBJETIVO CENTRAL:
Transformar o descritor da semana em uma ação concreta que o colaborador consiga experimentar no trabalho real ao longo da semana.

PRINCÍPIOS INEGOCIÁVEIS:
1. O desafio deve ser UMA ação principal.
2. A ação deve ser observável.
3. A ação deve caber na rotina da semana.
4. A ação deve ser coerente com o cargo e contexto.
5. A ação deve estar ligada ao descritor da semana.
6. O desafio não pode ser genérico a ponto de servir para qualquer pessoa.
7. O desafio deve ser proporcional ao nível atual do colaborador.

REGRAS DE QUALIDADE:
- Curto: 2 a 3 frases no máximo
- Concreto: dizer o que fazer
- Observável: deve ser possível perceber se foi feito ou não
- Viável: sem depender de grande projeto ou autorização complexa
- Singular: evitar juntar duas tarefas diferentes
- Específico: ancorado no cargo/contexto quando possível
- Sem "Esta semana..."
- Sem jargão
- Sem tom professoral
- Sem slogan motivacional

PROGRESSÃO POR NÍVEL:
${progressao}

RETORNE APENAS JSON VÁLIDO, sem markdown, sem comentários, sem texto antes ou depois.

FORMATO OBRIGATÓRIO:
{
  "desafio_texto": "texto curto do desafio em 2 a 3 frases",
  "acao_observavel": "qual é a ação principal observável",
  "criterio_de_execucao": "como saber que o desafio foi executado",
  "por_que_cabe_na_semana": "explicação curta de viabilidade"
}

REGRAS DE FORMATO:
- desafio_texto deve ter no máximo 3 frases
- deve haver apenas UMA ação principal
- acao_observavel deve ser específica
- criterio_de_execucao não pode ser abstrato
- por_que_cabe_na_semana deve ser curto e realista`;

  const user = `Crie 1 desafio semanal para o colaborador.

CONTEXTO:
- Cargo: ${cargo}
- Setor/contexto: ${contexto}
- Competência: ${competencia}
- Descritor a desenvolver: ${descritor}
- Nível atual: ${nivel}/4 (${progressao})
- Semana ${semana} da temporada`;

  return { system, user };
}

const REQUIRED_KEYS: (keyof DesafioStructured)[] = [
  'desafio_texto', 'acao_observavel', 'criterio_de_execucao', 'por_que_cabe_na_semana',
];

export function parseDesafioResponse(raw: string): DesafioStructured | null {
  try {
    let cleaned = raw.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '');
    }
    const parsed = JSON.parse(cleaned);
    for (const key of REQUIRED_KEYS) {
      if (typeof parsed[key] !== 'string' || parsed[key].trim().length < 5) return null;
    }
    const sentences = parsed.desafio_texto.split(/[.!?]+/).filter((s: string) => s.trim().length > 0);
    if (sentences.length > 4) return null;
    return {
      desafio_texto: parsed.desafio_texto.trim(),
      acao_observavel: parsed.acao_observavel.trim(),
      criterio_de_execucao: parsed.criterio_de_execucao.trim(),
      por_que_cabe_na_semana: parsed.por_que_cabe_na_semana.trim(),
    };
  } catch {
    return null;
  }
}
