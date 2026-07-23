// data/sample-paola.ts
// Dados reais da Paola de Souza Pissolato para testar o template

import type { BehavioralReportData } from '../types/behavioral-report';

export const samplePaola: BehavioralReportData = {
  raw: {
    nome: "Paola de Souza Pissolato",
    data_realizacao: "2026-03-17",
    perfil_dominante: "DI",
    disc_natural: { D: 58, I: 53, S: 47, C: 42 },
    indices: { positividade: 0.70, estima: 0.47, flexibilidade: 0.73 },
    lideranca: { executivo: 29, motivador: 26.5, metodico: 23.5, sistematico: 21 },
    tipo_psicologico: { tipo: "ENT", extroversao: 55.8, intuicao: 55.5, pensamento: 50 },
    competencias: [
      { nome: "Ousadia", natural: 57 },
      { nome: "Comando", natural: 63 },
      { nome: "Objetividade", natural: 65 },
      { nome: "Assertividade", natural: 53 },
      { nome: "Persuasão", natural: 58 },
      { nome: "Extroversão", natural: 60 },
      { nome: "Entusiasmo", natural: 54 },
      { nome: "Sociabilidade", natural: 60 },
      { nome: "Empatia", natural: 56 },
      { nome: "Paciência", natural: 53 },
      { nome: "Persistência", natural: 56 },
      { nome: "Planejamento", natural: 55 },
      { nome: "Organização", natural: 57 },
      { nome: "Detalhismo", natural: 51 },
      { nome: "Prudência", natural: 48 },
      { nome: "Concentração", natural: 53 },
    ],
  },

  // Textos que seriam gerados pelo LLM — exemplo estático para teste
  texts: {
    sintese_perfil: "Paola é uma profissional com forte orientação a resultados e capacidade natural de liderança. Seu perfil DI combina a assertividade na busca de objetivos com habilidade de se conectar com pessoas quando necessário. É prática, direta e dinâmica, capaz de tomar decisões rápidas e mobilizar equipes em torno de metas desafiadoras. Sua energia competitiva é equilibrada por uma sociabilidade autêntica que a torna persuasiva e inspiradora.",

    quadrante_D: {
      titulo_traco: "Diretor",
      descricao: "Paola encara desafios de frente, com determinação e foco em resultados. Gosta de ter autonomia para agir e se motiva com situações que exigem tomada de decisão rápida e ousadia."
    },
    quadrante_I: {
      titulo_traco: "Comunicador",
      descricao: "Valoriza relações interpessoais e usa sua comunicação para engajar e convencer. Otimista por natureza, prefere ambientes dinâmicos onde pode expressar suas ideias livremente."
    },
    quadrante_S: {
      titulo_traco: "Executor",
      descricao: "Possui ritmo acelerado e prefere ambientes com mudanças constantes. Lida bem com múltiplas demandas simultâneas e não se incomoda com imprevistos ou alterações de cronograma."
    },
    quadrante_C: {
      titulo_traco: "Criador",
      descricao: "Prefere liberdade e flexibilidade em vez de processos rígidos. Tem visão global e imaginativa, enxergando possibilidades onde outros veem limitações. Age com informalidade."
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
