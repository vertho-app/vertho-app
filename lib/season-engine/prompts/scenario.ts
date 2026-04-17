/**
 * Gera cenários situacionais para semanas de aplicação (4, 8, 12).
 * Output JSON estruturado — texto composto para renderização markdown.
 */
interface PromptCenarioParams {
  competencia: string;
  descritores: string[];
  cargo: string;
  contexto: string;
  complexidade: string;
}

export interface CenarioStructured {
  contexto: string;
  tensao_central: string;
  fator_complicador: string;
  stakeholders: string[];
  tradeoff_testado: string;
  armadilha_resposta_generica: string;
  pergunta: string;
  complexidade_aplicada: string;
  por_que_essa_complexidade_faz_sentido: string;
}

export function promptCenario({ competencia, descritores, cargo, contexto, complexidade }: PromptCenarioParams) {
  const system = `Você é um designer de casos para desenvolvimento de competências executivas na Vertho.

Sua tarefa é criar um cenário escrito de APLICAÇÃO PRÁTICA para semanas 4, 8 e 12 do motor de temporadas.

ATENÇÃO:
Este cenário não é um cenário de assessment formal da Fase 1.
Também não é um conteúdo teórico.
Ele é um caso de aplicação prática usado quando o colaborador não consegue executar a missão real da semana.

OBJETIVO CENTRAL:
Criar um cenário situacional curto, realista e discriminante, que force o colaborador a pensar como agiria na prática diante de um dilema relevante ao descritor trabalhado.

PRINCÍPIOS INEGOCIÁVEIS:
1. O cenário deve ser realista para o cargo e contexto.
2. O cenário deve ter uma tensão central clara.
3. O cenário deve forçar decisão, priorização ou critério.
4. O teste do "conversaria com todos" deve falhar.
5. O cenário não pode permitir resposta genérica como solução suficiente.
6. O cenário não pode dar a resposta no enunciado.
7. O caso deve ser proporcional à complexidade pedida.
8. Máximo de 2 stakeholders principais.

NÍVEIS DE COMPLEXIDADE:
- simples:
  - caso mais direto
  - menor ambiguidade
  - uma tensão principal
  - linguagem mais simples
- intermediario:
  - tensão mais rica
  - mais necessidade de critério
  - um fator complicador relevante
- completo:
  - maior exigência de julgamento
  - trade-off mais sofisticado
  - pressão contextual mais forte
  - maior densidade sem ficar teatral

ESTRUTURA OBRIGATÓRIA DO CASO:
- Contexto
- Tensão central
- Fator complicador
- Stakeholders
- Pergunta aberta final

REGRAS DE QUALIDADE:
- contexto plausível
- linguagem clara
- sem excesso de subtramas
- sem moral da história embutida
- sem pergunta fechada
- sem permitir resposta "eu alinharia com todos" como suficiente
- sem virar mini-ensaio longo

RETORNE APENAS JSON VÁLIDO, sem markdown, sem comentários, sem texto antes ou depois.

FORMATO OBRIGATÓRIO:
{
  "contexto": "texto do cenário",
  "tensao_central": "qual é a tensão principal",
  "fator_complicador": "o que torna o caso mais difícil",
  "stakeholders": ["stakeholder 1", "stakeholder 2"],
  "tradeoff_testado": "qual escolha difícil está no centro do caso",
  "armadilha_resposta_generica": "por que resposta vaga não resolve",
  "pergunta": "pergunta aberta final",
  "complexidade_aplicada": "simples|intermediario|completo",
  "por_que_essa_complexidade_faz_sentido": "explicação curta"
}

REGRAS DE FORMATO:
- stakeholders com no máximo 2 itens
- pergunta deve ser aberta
- contexto deve ser curto a moderado, sem excesso de detalhes
- tradeoff_testado é obrigatório
- armadilha_resposta_generica é obrigatória
- não invente jargão que não combine com o cargo`;

  const user = `Crie 1 cenário de aplicação prática.

CONTEXTO:
- Cargo: ${cargo}
- Setor/contexto: ${contexto}
- Competência: ${competencia}
- Descritores avaliados (integrar todos no cenário): ${descritores.join(', ')}
- Complexidade: ${complexidade}`;

  return { system, user };
}

const REQUIRED_KEYS: (keyof CenarioStructured)[] = [
  'contexto', 'tensao_central', 'fator_complicador', 'stakeholders',
  'tradeoff_testado', 'armadilha_resposta_generica', 'pergunta',
  'complexidade_aplicada',
];

export function parseCenarioResponse(raw: string): CenarioStructured | null {
  try {
    let cleaned = raw.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '');
    }
    const parsed = JSON.parse(cleaned);
    for (const key of REQUIRED_KEYS) {
      if (key === 'stakeholders') {
        if (!Array.isArray(parsed.stakeholders) || parsed.stakeholders.length === 0) return null;
        if (parsed.stakeholders.length > 2) parsed.stakeholders = parsed.stakeholders.slice(0, 2);
      } else {
        if (typeof parsed[key] !== 'string' || parsed[key].trim().length < 3) return null;
      }
    }
    return {
      contexto: parsed.contexto.trim(),
      tensao_central: parsed.tensao_central.trim(),
      fator_complicador: parsed.fator_complicador.trim(),
      stakeholders: parsed.stakeholders.map((s: any) => String(s).trim()),
      tradeoff_testado: parsed.tradeoff_testado.trim(),
      armadilha_resposta_generica: parsed.armadilha_resposta_generica.trim(),
      pergunta: parsed.pergunta.trim(),
      complexidade_aplicada: parsed.complexidade_aplicada?.trim() || '',
      por_que_essa_complexidade_faz_sentido: parsed.por_que_essa_complexidade_faz_sentido?.trim() || '',
    };
  } catch {
    return null;
  }
}

export function cenarioToMarkdown(c: CenarioStructured): string {
  const lines = [
    `**Contexto:** ${c.contexto}`,
    '',
    `**Tensão central:** ${c.tensao_central}`,
    '',
    `**Fator complicador:** ${c.fator_complicador}`,
    '',
    '**Stakeholders:**',
    ...c.stakeholders.map(s => `- ${s}`),
    '',
    `**${c.pergunta}**`,
  ];
  return lines.join('\n');
}
