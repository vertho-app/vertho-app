// types/behavioral-report.ts
// Schema de dados que conecta o CIS → LLM → Template React

export interface DISCScores {
  D: number; // 0-100
  I: number;
  S: number;
  C: number;
}

export interface LeadershipDistribution {
  executivo: number;   // % (soma = 100)
  motivador: number;
  metodico: number;
  sistematico: number;
}

export interface CompetencyScore {
  nome: string;
  natural: number;    // 0-100
  adaptado: number;   // 0-100
}

export interface PsychologicalType {
  extroversao: number;   // 0-100 (introversão = 100 - extroversao)
  intuicao: number;      // 0-100 (sensação = 100 - intuicao)
  pensamento: number;    // 0-100 (sentimento = 100 - pensamento)
  tipo: string;          // ex: "ENT", "ISF"
}

export interface Indices {
  positividade: number;  // 0-1
  estima: number;        // 0-1
  flexibilidade: number; // 0-1
}

// === DADOS BRUTOS DO CIS (input) ===
export interface CISRawData {
  nome: string;
  data_realizacao: string;           // ISO date
  perfil_dominante: string;          // ex: "DI", "SC", "ID"
  disc_natural: DISCScores;
  disc_adaptado: DISCScores;
  indices: Indices;
  lideranca: LeadershipDistribution;
  tipo_psicologico: PsychologicalType;
  competencias: CompetencyScore[];   // 16 competências
}

// === TEXTOS GERADOS PELO LLM (output do prompt) ===
export interface LLMGeneratedTexts {
  sintese_perfil: string;            // 4-5 linhas descrevendo a essência da pessoa
  quadrante_D: {
    titulo_traço: string;            // ex: "Diretor", "Cooperador"
    descricao: string;               // 2-3 frases
    adaptacao: string | null;        // frase sobre adaptação crescente/decrescente, ou null
  };
  quadrante_I: {
    titulo_traço: string;
    descricao: string;
    adaptacao: string | null;
  };
  quadrante_S: {
    titulo_traço: string;
    descricao: string;
    adaptacao: string | null;
  };
  quadrante_C: {
    titulo_traço: string;
    descricao: string;
    adaptacao: string | null;
  };
  top5_forcas: {
    competencia: string;
    frase: string;                   // 1 linha interpretativa
  }[];
  top5_desenvolver: {
    competencia: string;
    frase: string;
  }[];
  lideranca_sintese: string;        // 3-4 linhas sobre o estilo dominante
  lideranca_trabalhar: string;      // 2-3 linhas sobre comportamentos a trabalhar
  pontos_desenvolver_pressao: string[]; // 6-8 comportamentos sob pressão
}

// === DADOS COMPLETOS PARA O TEMPLATE ===
export interface BehavioralReportData {
  raw: CISRawData;
  texts: LLMGeneratedTexts;
}
