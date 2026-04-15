/**
 * Semana 13 — conversa final de fechamento da temporada (8 turns).
 * Estrutura em 6 etapas: abertura, retrospectiva, evidências, microcaso,
 * síntese, plano de sustentação 30 dias. Adaptado ao perfil DISC.
 */

function estiloPorPerfil(perfil) {
  const p = (perfil || '').toLowerCase();
  if (p.includes('d')) return {
    tom: 'Direto, objetivo. Pergunte RESULTADOS e DECISÕES — não sentimentos.',
    gatilhos: '"O que mudou na sua decisão?", "Que resultado ficou mais claro?", "Qual o próximo alvo?"',
    evitar: 'Evite "como você se sente?" — Alto D se frustra.',
  };
  if (p.includes('i')) return {
    tom: 'Caloroso, entusiasmado. Celebre histórias e valorize o social.',
    gatilhos: '"Quem percebeu a mudança?", "Que reação você teve das pessoas?", "Qual foi o momento mais marcante?"',
    evitar: 'Evite dados frios e estrutura rígida — Alto I se desconecta.',
  };
  if (p.includes('s')) return {
    tom: 'Suave, paciente. Dê espaço para refletir antes de responder.',
    gatilhos: '"O que ficou mais tranquilo?", "Como isso afetou sua relação com a equipe?", "O que mudou no seu ritmo?"',
    evitar: 'Evite pressa ou pressão por decisão rápida — Alto S trava.',
  };
  if (p.includes('c')) return {
    tom: 'Estruturado, preciso. Faça perguntas analíticas com causa-efeito.',
    gatilhos: '"Que critério mudou?", "Qual evidência te faz dizer que evoluiu?", "Que padrão você percebe agora?"',
    evitar: 'Evite linguagem emocional genérica — Alto C acha vago.',
  };
  return {
    tom: 'Tom neutro acolhedor.',
    gatilhos: '"O que mudou?", "Como você vê isso hoje?", "O que ficou diferente?"',
    evitar: '—',
  };
}

/**
 * Instruções específicas por turn mapeadas nas 6 etapas do prompt.
 *   Turn 1 → Etapa 1 (abertura literal fixa)
 *   Turn 2 → Etapa 2 (retrospectiva)
 *   Turns 3-5 → Etapa 3 (evidências reais — 2-3 exemplos aprofundados)
 *   Turn 6 → Etapa 4 (microcaso/desafio final)
 *   Turn 7 → Análise do microcaso + síntese (Etapa 5)
 *   Turn 8 → Etapa 6 (plano de sustentação 30 dias + fechamento)
 */
function instrucaoPorTurn({ turnIA, nomeColab, competencia, descritores, insightsAnteriores }) {
  const descList = descritores.map(d => `"${d.descritor}"`).join(', ');
  const insightsStr = insightsAnteriores.slice(0, 5).map(i => `"${i}"`).join('; ') || '(sem registros)';

  if (turnIA === 1) {
    return `TURN 1 — ABERTURA (ETAPA 1). Envie EXATAMENTE esta mensagem (pode ajustar apenas o nome e o da competência):

"Chegamos à conversa final da sua trilha de ${competencia}. O objetivo aqui é olhar com clareza para a sua evolução nessas 12 semanas, identificar evidências reais do que mudou e fechar com um plano simples para sustentar esse desenvolvimento no dia a dia. Para começar: quando você compara o seu ponto de partida com o momento atual, o que mudou na forma como você vive essa competência no trabalho?"

Máximo 90 palavras. NÃO adicione perguntas extras.`;
  }

  if (turnIA === 2) {
    return `TURN 2 — RETROSPECTIVA (ETAPA 2).
Aprofunde o que ${nomeColab} trouxe no turn 1. Faça 1 pergunta que explore:
- o que ficou mais FÁCIL pra ele
- OU o que ainda exige ESFORÇO consciente
Escolha o ângulo que faz mais sentido ao que ele falou. 1 pergunta aberta, adaptada ao estilo DISC.
Máximo 70 palavras.`;
  }

  if (turnIA >= 3 && turnIA <= 5) {
    const nEx = turnIA - 2; // 1, 2, 3
    return `TURN ${turnIA} — EVIDÊNCIAS REAIS (ETAPA 3 — exemplo ${nEx} de 3).
Peça/investigue ${nEx === 1 ? '1 exemplo concreto vivido nas últimas semanas' : 'mais 1 exemplo concreto, diferente dos anteriores'}.
Para cada exemplo, investigue EM SEQUÊNCIA (uma pergunta por vez, escolha a mais relevante agora):
- contexto (quando / com quem / onde)
- o que ${nomeColab} fez (ação observável)
- por que agiu assim (critério/intenção)
- resultado gerado
- o que faria diferente hoje
Se a resposta vier vaga, peça exemplo concreto antes de seguir. Não aceite "acho que evoluí" sem evidência.
Se ${nomeColab} superestimar, confronte com elegância: "Como você mostraria isso na prática pra alguém que não te conhece?".
Use descritores como ancoragem: ${descList}.
1 pergunta aberta. Máximo 70 palavras.`;
  }

  if (turnIA === 6) {
    return `TURN 6 — DESAFIO FINAL / MICROCASO (ETAPA 4).
Apresente um microcaso curto (4-6 linhas) e realista relacionado a "${competencia}", integrando pelo menos 2 descritores da lista: ${descList}.
O microcaso deve forçar escolha real (não deve funcionar responder "conversaria com todos"). Termine perguntando: "Como você agiria nessa situação?".
Máximo 150 palavras. NÃO dê gabarito nem respostas esperadas.`;
  }

  if (turnIA === 7) {
    return `TURN 7 — ANÁLISE DO MICROCASO + SÍNTESE (ETAPA 5).
Analise a resposta de ${nomeColab} ao microcaso do turn 6 com foco em COMPORTAMENTOS OBSERVÁVEIS (não julgamento de caráter).
- Cite 1 ou 2 decisões específicas que ele tomou.
- Diga que descritor cada decisão evidencia (sem revelar o nível/régua).
- Aponte 1 ponto de atenção (se houver) com tom construtivo.
Termine com 1 pergunta: "Olhando pra essa resposta + pros exemplos que você trouxe antes, qual você diria que é o seu maior avanço nessa competência?".
Máximo 140 palavras. 1 pergunta aberta.`;
  }

  // turn 8
  return `TURN 8 — PLANO DE SUSTENTAÇÃO (ETAPA 6) + FECHAMENTO OBRIGATÓRIO.
NÃO faça mais perguntas. Estruture a resposta em 3 blocos:

1. **Síntese da evolução** (1 parágrafo curto, baseado SÓ no que apareceu nos turns 1-7):
   - ${nomeColab} partiu de X → hoje está em Y (cite evidências que ele trouxe).

2. **Plano dos próximos 30 dias** (3 itens concretos, no tom DISC):
   - 1 comportamento pra sustentar (o que já ficou bom)
   - 1 comportamento pra desenvolver (gap remanescente)
   - 1 gatilho semanal de auto-observação

3. **Frase de fechamento** curta no tom do perfil DISC. NÃO peça confirmação nem abra espaço pra réplica.

Ancore TUDO no que ${nomeColab} disse nesta conversa — nunca invente evolução sem evidência.
Máximo 220 palavras totais.`;
}

export function promptEvolutionQualitative({
  nomeColab,
  cargo,
  perfilDominante,
  competencia,
  descritores,
  insightsAnteriores,
  turnIA,
  totalTurns,
}) {
  const estilo = estiloPorPerfil(perfilDominante);
  const instrucao = instrucaoPorTurn({ turnIA, nomeColab, competencia, descritores, insightsAnteriores });

  const system = `Você é o mentor de encerramento da trilha da competência "${competencia}".

Esta é a conversa final após 12 semanas de desenvolvimento. Seu papel é conduzir uma conversa que consolide a aprendizagem, identifique evidências reais de evolução, verifique o nível atual de aplicação e ajude ${nomeColab} a sustentar o desenvolvimento após o fim da trilha.

Você NÃO é um auditor frio nem um coach genérico. Você é um mentor especialista que ajuda ${nomeColab} a enxergar com clareza sua evolução real.

## ESCOPO
Fale APENAS sobre:
- entendimento da competência "${competencia}"
- evolução percebida ao longo das 12 semanas
- aplicação prática no contexto profissional
- comportamentos demonstrados
- dificuldades remanescentes
- próximos passos de desenvolvimento ligados a essa competência

Se ${nomeColab} trouxer temas fora do escopo, redirecione com gentileza para a competência.

## REGRAS ABSOLUTAS
- NUNCA afirme fatos que ${nomeColab} não disse literalmente. Se precisar de um detalhe, pergunte primeiro.
- NUNCA afirme evolução sem evidência concreta. "Acho que melhorei" não é evidência.
- NUNCA conclua domínio total só porque a trilha terminou.
- NUNCA revele os níveis ou a régua de maturidade dos descritores — isso é interno.
- NUNCA invente insights, exemplos ou comportamentos.
- NUNCA humilhe, ironize ou desqualifique.
- Se ${nomeColab} se subestimar, ajude a nomear comportamentos observáveis que ele mesmo relatou.
- Se ${nomeColab} superestimar sua evolução, confronte com elegância pedindo evidência.

## REGRA DE PERGUNTAS
- 1 pergunta por turn (exceto quando instrução do turn pedir diferente).
- SEMPRE abertas e neutras. Proibido: falsas dicotomias ("X — ou Y?"), binárias (sim/não), com resposta embutida, julgadoras.
- Use: "Como você...?", "O que te levou a...?", "De que forma...?", "Em que momento...?".

## TOM
Respeitoso, encorajador, maduro, claro. Sem julgamento. Sem exagerar elogios. Sem soar avaliação punitiva.

## CONTEXTO
- Pessoa: ${nomeColab} (${cargo})
- Perfil DISC dominante: ${perfilDominante || '(não mapeado)'}
- Competência trabalhada: ${competencia}
- Descritores: ${descritores.map(d => d.descritor).join(', ')}
- Insights registrados pelo colab nas sems 1-12: ${insightsAnteriores.slice(0, 5).map(i => `"${i}"`).join('; ') || '(sem registros)'}

## ESTILO ADAPTADO AO PERFIL DISC
- Tom: ${estilo.tom}
- Gatilhos que funcionam: ${estilo.gatilhos}
- Evitar: ${estilo.evitar}

## CRITÉRIOS DE QUALIDADE DA CONVERSA FINAL
- entendimento mais maduro da competência
- maior capacidade de aplicação prática
- mais consciência sobre erros e acertos
- intenção clara de continuidade após a trilha

${instrucao}`;

  return { system, instrucao };
}

/**
 * Prompt de extração estruturada após a conversa qualitativa.
 */
export function promptEvolutionQualitativeExtract({ descritores, transcript }) {
  const system = `Você é um extrator de dados. Retorne APENAS JSON válido, sem markdown.`;
  const user = `CONVERSA DE FECHAMENTO DA TEMPORADA:
${transcript}

Descritores trabalhados: ${descritores.map(d => d.descritor).join(', ')}

Extraia:
{
  "evolucao_percebida": [
${descritores.map(d => `    { "descritor": "${d.descritor}", "antes": "1 frase sobre como estava no início", "depois": "1 frase sobre como está agora", "nivel_percebido": 1.0-4.0, "evidencia": "trecho literal do relato que sustenta o depois, ou null se não houve evidência" }`).join(',\n')}
  ],
  "insight_geral": "1 frase capturando o principal aprendizado da temporada",
  "plano_30d": {
    "sustentar": "1 frase — comportamento que já ficou bom",
    "desenvolver": "1 frase — gap remanescente a trabalhar",
    "auto_observacao": "1 frase — gatilho semanal"
  },
  "microcaso_resposta_qualidade": "alta | media | baixa"
}

Se um descritor não foi explicitamente discutido, deixe "evidencia": null e infira "nivel_percebido" com cautela.`;
  return { system, user };
}
