/**
 * Gera a Missão Prática das semanas 4/8/12.
 * Substitui o cenário escrito por uma tarefa que obriga o colab a aplicar
 * os 3 descritores das semanas anteriores na rotina real (não em resposta
 * fictícia). Cenário escrito fica como fallback.
 */
interface PromptMissaoParams {
  competencia: string;
  descritores: string[];
  cargo: string;
  contexto: string;
}

export function promptMissao({ competencia, descritores, cargo, contexto }: PromptMissaoParams) {
  const system = `Você é um designer de missões práticas de desenvolvimento. Sua missão integra descritores comportamentais em uma única tarefa que o profissional executa no trabalho real durante a semana — não em resposta escrita.`;

  const user = `Crie 1 MISSÃO PRÁTICA que o colaborador vai executar durante a semana no trabalho real.

CONTEXTO:
- Cargo: ${cargo}
- Setor: ${contexto}
- Competência: ${competencia}
- Descritores a integrar (TODOS os 3 precisam aparecer naturalmente): ${descritores.join(', ')}

REGRAS:
1. Missão é UMA tarefa concreta executada no trabalho real — não responder cenário fictício.
2. Deve ser viável em uma semana típica do cargo. Nada que dependa de evento raro.
3. Os 3 descritores precisam aparecer integrados (não lista de sub-tarefas separadas).
4. Foco em OBSERVÁVEL: o colab precisa poder relatar "o que fiz, o que aconteceu, o que aprendi".
5. Evite missões genéricas ("melhore sua comunicação"). Seja específica ao cargo.

FORMATO DE RESPOSTA (markdown, SEM título, comece direto pela descrição):
**Sua missão:** [1-2 frases descrevendo a tarefa concreta]

**Descritores a integrar:**
- **[Descritor 1]**: [como deve aparecer na execução, 1 linha]
- **[Descritor 2]**: [como deve aparecer, 1 linha]
- **[Descritor 3]**: [como deve aparecer, 1 linha]

NÃO inclua seção "Como vai se saber que funcionou", "Resultado esperado", gabarito, ou critério de sucesso observável — isso é gabarito que vai influenciar o relato do colaborador.

Retorne APENAS o markdown acima, sem comentários adicionais.`;

  return { system, user };
}
