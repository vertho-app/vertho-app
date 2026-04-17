/**
 * Gera a Missão Prática das semanas 4/8/12.
 * Output JSON estruturado — texto composto para renderização markdown.
 */
interface PromptMissaoParams {
  competencia: string;
  descritores: string[];
  cargo: string;
  contexto: string;
}

export interface MissaoStructured {
  missao_texto: string;
  acao_principal: string;
  contexto_de_aplicacao: string;
  criterio_de_execucao: string;
  integracao_descritores: { descritor: string; como_aparece: string }[];
  por_que_cabe_na_semana: string;
}

export function promptMissao({ competencia, descritores, cargo, contexto }: PromptMissaoParams) {
  const system = `Você é um designer de missões práticas de desenvolvimento da Vertho.

Sua tarefa é criar UMA missão prática de trabalho real para semanas 4, 8 e 12 do motor de temporadas.

ATENÇÃO:
A missão não é uma resposta escrita.
A missão não é um cenário hipotético.
A missão não é uma reflexão.
A missão é uma AÇÃO REAL a ser executada no trabalho durante a semana.

OBJETIVO CENTRAL:
Transformar três descritores comportamentais em uma única missão prática, coerente, observável e viável, capaz de gerar evidência real de comportamento.

PRINCÍPIOS INEGOCIÁVEIS:
1. A missão deve ser UMA ação principal.
2. A missão deve integrar os 3 descritores de forma orgânica.
3. A missão deve ser executável em até 1 semana.
4. A missão deve ser plausível para o cargo e contexto.
5. A missão deve gerar evidência observável para relato posterior.
6. A missão não pode depender de um grande projeto ou de uma condição improvável.
7. A missão não pode ser genérica a ponto de servir para qualquer pessoa.
8. A missão não pode virar checklist de várias tarefas independentes.

REGRAS DE QUALIDADE:
- concreta
- curta
- específica
- observável
- viável
- com alguma tensão ou intenção prática real
- sem jargão
- sem tom professoral
- sem slogan
- sem "esta semana..."
- sem 3 tarefas separadas

INTEGRAÇÃO DOS DESCRITORES:
Os 3 descritores devem aparecer:
- em uma única experiência prática
- como partes de uma mesma ação
- e não como subtarefas artificiais

RETORNE APENAS JSON VÁLIDO, sem markdown, sem comentários, sem texto antes ou depois.

FORMATO OBRIGATÓRIO:
{
  "missao_texto": "texto curto da missão em até 3 frases",
  "acao_principal": "qual é a ação central que a pessoa deve executar",
  "contexto_de_aplicacao": "em que tipo de situação isso pode acontecer no trabalho",
  "criterio_de_execucao": "como saber que a missão foi executada",
  "integracao_descritores": [
    { "descritor": "D1", "como_aparece": "como esse descritor aparece dentro da missão" },
    { "descritor": "D2", "como_aparece": "como esse descritor aparece dentro da missão" },
    { "descritor": "D3", "como_aparece": "como esse descritor aparece dentro da missão" }
  ],
  "por_que_cabe_na_semana": "explicação curta de viabilidade"
}

REGRAS DE FORMATO:
- missao_texto com no máximo 3 frases
- deve existir UMA ação principal clara
- criterio_de_execucao deve ser observável
- integracao_descritores deve cobrir exatamente os descritores recebidos
- por_que_cabe_na_semana deve ser curto e realista`;

  const user = `Crie 1 missão prática de trabalho real.

CONTEXTO:
- Cargo: ${cargo}
- Setor/contexto: ${contexto}
- Competência: ${competencia}
- Descritores a integrar (TODOS precisam aparecer naturalmente): ${descritores.join(', ')}`;

  return { system, user };
}

const REQUIRED_KEYS: (keyof Omit<MissaoStructured, 'integracao_descritores'>)[] = [
  'missao_texto', 'acao_principal', 'contexto_de_aplicacao',
  'criterio_de_execucao', 'por_que_cabe_na_semana',
];

export function parseMissaoResponse(raw: string): MissaoStructured | null {
  try {
    let cleaned = raw.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '');
    }
    const parsed = JSON.parse(cleaned);
    for (const key of REQUIRED_KEYS) {
      if (typeof parsed[key] !== 'string' || parsed[key].trim().length < 5) return null;
    }
    if (!Array.isArray(parsed.integracao_descritores) || parsed.integracao_descritores.length === 0) return null;
    for (const item of parsed.integracao_descritores) {
      if (typeof item.descritor !== 'string' || typeof item.como_aparece !== 'string') return null;
    }
    const sentences = parsed.missao_texto.split(/[.!?]+/).filter((s: string) => s.trim().length > 0);
    if (sentences.length > 4) return null;
    return {
      missao_texto: parsed.missao_texto.trim(),
      acao_principal: parsed.acao_principal.trim(),
      contexto_de_aplicacao: parsed.contexto_de_aplicacao.trim(),
      criterio_de_execucao: parsed.criterio_de_execucao.trim(),
      integracao_descritores: parsed.integracao_descritores.map((d: any) => ({
        descritor: d.descritor.trim(),
        como_aparece: d.como_aparece.trim(),
      })),
      por_que_cabe_na_semana: parsed.por_que_cabe_na_semana.trim(),
    };
  } catch {
    return null;
  }
}

export function missaoToMarkdown(m: MissaoStructured): string {
  const lines = [
    `**Sua missão:** ${m.missao_texto}`,
    '',
    '**Descritores a integrar:**',
    ...m.integracao_descritores.map(d => `- **${d.descritor}**: ${d.como_aparece}`),
  ];
  return lines.join('\n');
}
