// data/sample-paola.ts
// Dados reais da Paola de Souza Pissolato para testar o template

import type { BehavioralReportData } from '../types/behavioral-report';

export const samplePaola: BehavioralReportData = {
  raw: {
    nome: "Paola de Souza Pissolato",
    data_realizacao: "2026-03-17",
    perfil_dominante: "DI",
    disc_natural: { D: 58, I: 53, S: 47, C: 42 },
    disc_adaptado: { D: 63, I: 30, S: 54, C: 53 },
    indices: { positividade: 0.70, estima: 0.47, flexibilidade: 0.73 },
    lideranca: { executivo: 29, motivador: 26.5, metodico: 23.5, sistematico: 21 },
    tipo_psicologico: { tipo: "ENT", extroversao: 55.8, intuicao: 55.5, pensamento: 50 },
    competencias: [
      { nome: "Ousadia", natural: 57, adaptado: 49.5 },
      { nome: "Comando", natural: 63, adaptado: 68.5 },
      { nome: "Objetividade", natural: 65, adaptado: 66 },
      { nome: "Assertividade", natural: 53, adaptado: 60 },
      { nome: "Persuasão", natural: 58, adaptado: 33.5 },
      { nome: "Extroversão", natural: 60, adaptado: 34.5 },
      { nome: "Entusiasmo", natural: 54, adaptado: 33 },
      { nome: "Sociabilidade", natural: 60, adaptado: 48 },
      { nome: "Empatia", natural: 56, adaptado: 48 },
      { nome: "Paciência", natural: 53, adaptado: 64 },
      { nome: "Persistência", natural: 56, adaptado: 59.5 },
      { nome: "Planejamento", natural: 55, adaptado: 63.5 },
      { nome: "Organização", natural: 57, adaptado: 63.17 },
      { nome: "Detalhismo", natural: 51, adaptado: 68 },
      { nome: "Prudência", natural: 48, adaptado: 54.5 },
      { nome: "Concentração", natural: 53, adaptado: 62.67 },
    ],
  },

  // Textos que seriam gerados pelo LLM — exemplo estático para teste
  texts: {
    sintese_perfil: "Paola é uma profissional com forte orientação a resultados e capacidade natural de liderança. Seu perfil DI combina a assertividade na busca de objetivos com habilidade de se conectar com pessoas quando necessário. É prática, direta e dinâmica, capaz de tomar decisões rápidas e mobilizar equipes em torno de metas desafiadoras. Sua energia competitiva é equilibrada por uma sociabilidade autêntica que a torna persuasiva e inspiradora.",

    quadrante_D: {
      titulo_traco: "Diretor",
      descricao: "Paola encara desafios de frente, com determinação e foco em resultados. Gosta de ter autonomia para agir e se motiva com situações que exigem tomada de decisão rápida e ousadia.",
      adaptacao: "Sente que o ambiente atual exige ainda mais assertividade e disposição para correr riscos do que seu estilo natural."
    },
    quadrante_I: {
      titulo_traco: "Comunicador",
      descricao: "Valoriza relações interpessoais e usa sua comunicação para engajar e convencer. Otimista por natureza, prefere ambientes dinâmicos onde pode expressar suas ideias livremente.",
      adaptacao: "Percebe que o momento exige mais formalidade e disciplina, reduzindo temporariamente sua expressividade natural."
    },
    quadrante_S: {
      titulo_traco: "Executor",
      descricao: "Possui ritmo acelerado e prefere ambientes com mudanças constantes. Lida bem com múltiplas demandas simultâneas e não se incomoda com imprevistos ou alterações de cronograma.",
      adaptacao: "Sente necessidade de desacelerar um pouco e estabelecer prioridades com mais planejamento."
    },
    quadrante_C: {
      titulo_traco: "Criador",
      descricao: "Prefere liberdade e flexibilidade em vez de processos rígidos. Tem visão global e imaginativa, enxergando possibilidades onde outros veem limitações. Age com informalidade.",
      adaptacao: "Percebe que precisa desenvolver mais foco em detalhes e agir com mais cautela e organização."
    },

    top5_forcas: [
      { competencia: "Objetividade", frase: "Capacidade de ser direta e manter foco no que realmente importa para alcançar resultados." },
      { competencia: "Comando", frase: "Predisposição natural para assumir a liderança e mobilizar pessoas em torno de objetivos claros." },
      { competencia: "Extroversão", frase: "Facilidade de comunicação e sociabilização que facilita a construção de alianças profissionais." },
      { competencia: "Sociabilidade", frase: "Tendência genuína a buscar conexões, criando redes de relacionamento valiosas." },
      { competencia: "Ousadia", frase: "Disposição para encarar desafios de frente e sair da zona de conforto quando necessário." },
    ],

    top5_desenvolver: [
      { competencia: "Prudência", frase: "Equilibrar a ousadia com uma avaliação mais cuidadosa de riscos antes de agir." },
      { competencia: "Detalhismo", frase: "Dedicar mais atenção aos detalhes para elevar a precisão na entrega de projetos." },
      { competencia: "Assertividade", frase: "Fortalecer a capacidade de perceber variações sutis no ambiente e agir com mais exatidão." },
      { competencia: "Paciência", frase: "Desenvolver tolerância com processos mais lentos e pessoas com ritmo diferente do seu." },
      { competencia: "Planejamento", frase: "Estruturar melhor as ações antes de executar, evitando retrabalho." },
    ],

    lideranca_sintese: "Seu estilo de liderança é predominantemente Executivo, o que significa que você lidera pelo exemplo, com energia, decisão e foco em resultados. Complementado pelo estilo Motivador, você também engaja a equipe pelo diálogo e entusiasmo. É o tipo de líder que mobiliza rapidamente e cria senso de urgência.",
    
    lideranca_trabalhar: "Atenção ao impacto da sua intensidade sobre pessoas com perfil mais analítico ou estável. Dosar a exigência e abrir mais espaço para escutar antes de decidir pode aumentar o engajamento da equipe.",

    pontos_desenvolver_pressao: [
      "Agir com grosseria ou causar intimidação",
      "Faltar com diplomacia em situações delicadas",
      "Correr riscos sem calcular consequências",
      "Falar demais e não ouvir o suficiente",
      "Dar pouca atenção a detalhes importantes",
      "Agir de forma precipitada sem planejar",
      "Ter dificuldade com pessoas de ritmo mais lento",
      "Não seguir regras e processos estabelecidos",
    ],
  }
};
