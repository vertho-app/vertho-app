// prompts/behavioral-report-prompt.ts
// Prompt para gerar os textos interpretativos do relatório comportamental
// Funciona com Claude API ou Gemini API

export function buildBehavioralReportPrompt(data: {
  nome: string;
  perfil_dominante: string;
  disc_natural: { D: number; I: number; S: number; C: number };
  disc_adaptado: { D: number; I: number; S: number; C: number };
  lideranca: { executivo: number; motivador: number; metodico: number; sistematico: number };
  tipo_psicologico: { tipo: string; extroversao: number; intuicao: number; pensamento: number };
  competencias: { nome: string; natural: number; adaptado: number }[];
}): string {

  const compList = data.competencias
    .map(c => `${c.nome}: Natural=${c.natural}, Adaptado=${c.adaptado}`)
    .join('\n');

  return `Você é um especialista em análise comportamental DISC e desenvolvimento humano.

TAREFA: Gerar os textos interpretativos para o relatório comportamental individual de ${data.nome}.

DADOS DO COLABORADOR:
- Nome: ${data.nome}
- Perfil dominante: ${data.perfil_dominante}
- DISC Natural: D=${data.disc_natural.D}, I=${data.disc_natural.I}, S=${data.disc_natural.S}, C=${data.disc_natural.C}
- DISC Adaptado: D=${data.disc_adaptado.D}, I=${data.disc_adaptado.I}, S=${data.disc_adaptado.S}, C=${data.disc_adaptado.C}
- Liderança: Executivo=${data.lideranca.executivo}%, Motivador=${data.lideranca.motivador}%, Metódico=${data.lideranca.metodico}%, Sistemático=${data.lideranca.sistematico}%
- Tipo Psicológico: ${data.tipo_psicologico.tipo} (Extroversão=${data.tipo_psicologico.extroversao}%, Intuição=${data.tipo_psicologico.intuicao}%, Pensamento=${data.tipo_psicologico.pensamento}%)
- Competências:
${compList}

CONTEXTO DISC (use como referência, NÃO reproduza no texto):
- D (Dominância): como lida com problemas e desafios. Alto D = direto, ousado, orientado a resultados. Baixo D = cooperativo, harmonioso, avesso a risco.
- I (Influência): como lida com pessoas e as influencia. Alto I = comunicativo, entusiasmado, persuasivo. Baixo I = reservado, analítico, formal.
- S (Estabilidade): como lida com ritmo e consistência. Alto S = paciente, cooperativo, metódico. Baixo S = intenso, versátil, rápido.
- C (Conformidade): como lida com regras e procedimentos. Alto C = preciso, organizado, cauteloso. Baixo C = flexível, informal, criativo.

TRAÇOS POR FAIXA (referência para títulos):
- D 51+: Diretor | D ≤50: Cooperador
- I 51+: Comunicador | I ≤50: Pesquisador
- S 51+: Planejador | S ≤50: Executor
- C 51+: Analista | C ≤50: Criador

ADAPTAÇÃO:
- Se adaptado > natural + 5: adaptação CRESCENTE (a pessoa sente que o ambiente exige mais dessa dimensão)
- Se adaptado < natural - 5: adaptação DECRESCENTE (a pessoa sente que o ambiente exige menos dessa dimensão)
- Se diferença ≤ 5: sem adaptação significativa (não mencionar)

REGRAS:
1. Linguagem acessível — o público é o próprio colaborador, não RH. Evite jargões técnicos.
2. Tom positivo e construtivo — mesmo pontos a desenvolver devem ser apresentados como oportunidades.
3. Use o primeiro nome da pessoa (não nome completo) quando se referir a ela.
4. Textos curtos e diretos — cada campo tem um limite de tamanho indicado.
5. NÃO explique a teoria DISC — apenas aplique-a.
6. Seja específico ao perfil — evite frases genéricas que serviriam para qualquer pessoa.
7. Considere a COMBINAÇÃO dos fatores, não cada um isoladamente.
8. Para as top 5 forças/desenvolvimento, ordene por relevância (maior impacto primeiro).
9. Gere o gênero correto baseado no contexto (se não souber, use linguagem neutra).

FORMATO DE SAÍDA — Retorne APENAS o JSON abaixo, sem markdown, sem backticks, sem texto adicional:

{
  "sintese_perfil": "STRING — 4 a 5 linhas. Síntese da essência comportamental da pessoa. Como ela se apresenta ao mundo, seus principais motivadores e sua forma natural de agir. Deve ser lido como um 'retrato falado' comportamental.",

  "quadrante_D": {
    "titulo_traco": "STRING — nome do traço (Diretor/Cooperador)",
    "descricao": "STRING — 2 a 3 frases descrevendo como a pessoa lida com desafios e problemas. Específico ao score.",
    "adaptacao": "STRING ou null — 1 frase sobre adaptação crescente/decrescente, ou null se não houver"
  },
  "quadrante_I": {
    "titulo_traco": "STRING",
    "descricao": "STRING — como lida com pessoas e as influencia",
    "adaptacao": "STRING ou null"
  },
  "quadrante_S": {
    "titulo_traco": "STRING",
    "descricao": "STRING — como dita ritmo e consistência das atividades",
    "adaptacao": "STRING ou null"
  },
  "quadrante_C": {
    "titulo_traco": "STRING",
    "descricao": "STRING — como lida com regras e procedimentos",
    "adaptacao": "STRING ou null"
  },

  "top5_forcas": [
    { "competencia": "STRING — nome", "frase": "STRING — 1 linha interpretativa explicando por que é uma força" }
  ],

  "top5_desenvolver": [
    { "competencia": "STRING — nome", "frase": "STRING — 1 linha construtiva sobre a oportunidade de desenvolvimento" }
  ],

  "lideranca_sintese": "STRING — 3 a 4 linhas sobre o estilo de liderança dominante e suas principais características. Baseado na distribuição percentual.",

  "lideranca_trabalhar": "STRING — 2 a 3 linhas sobre comportamentos que podem ser trabalhados para maior eficácia como líder.",

  "pontos_desenvolver_pressao": [
    "STRING — comportamento sob pressão 1",
    "STRING — comportamento sob pressão 2"
  ]
}`;
}

// === EXEMPLO DE USO ===
// 
// const prompt = buildBehavioralReportPrompt({
//   nome: "Paola de Souza Pissolato",
//   perfil_dominante: "DI",
//   disc_natural: { D: 58, I: 53, S: 47, C: 42 },
//   disc_adaptado: { D: 63, I: 30, S: 54, C: 53 },
//   lideranca: { executivo: 29, motivador: 26.5, metodico: 23.5, sistematico: 21 },
//   tipo_psicologico: { tipo: "ENT", extroversao: 55.8, intuicao: 55.5, pensamento: 50 },
//   competencias: [
//     { nome: "Ousadia", natural: 57, adaptado: 49.5 },
//     { nome: "Comando", natural: 63, adaptado: 68.5 },
//     // ... todas as 16
//   ]
// });
//
// const response = await anthropic.messages.create({
//   model: "claude-sonnet-4-20250514",
//   max_tokens: 2000,
//   messages: [{ role: "user", content: prompt }]
// });
//
// const texts = JSON.parse(response.content[0].text);
