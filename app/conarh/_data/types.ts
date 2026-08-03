// CONARH 52 — contrato do pacote offline.
// `conteudo.json` (mesma pasta) implementa esta interface. Tudo que a rota
// /conarh renderiza sai daqui: nenhuma chamada de geração, nenhuma rede.
// Trocar o caso = trocar este JSON, sem mexer em componente.

export interface DescritorCaso {
  cod: string; // ex. "FBK-D01"
  nome_curto: string;
  descritor_completo: string;
  n1: string; // âncora N1 — gap
  n2: string; // âncora N2 — desenvolvimento
  n3: string; // âncora N3 — meta
  n4: string; // âncora N4 — referência
  leitura_motor: {
    nota: number; // 1–4, decimal (ex. 2.33)
    nivel: 1 | 2 | 3 | 4;
    evidencia: string; // trecho literal do registro
    justificativa: string; // por que este nível e não outro
    limite: string; // o que faltou para o nível acima
  };
}

export interface Porta2 {
  // O recorte que o visitante lê EM PÉ: 3 momentos da conversa, ~70 palavras
  // no total. O registro inteiro (228 palavras) fica atrás de um toque — ler
  // uma página em pé, num corredor de feira, ninguém lê.
  registro_trechos: Array<{ momento: string; texto: string }>;
  registro_conversa: string; // registro integral, sob demanda (caso rotulado demonstrativo)
  contexto: string; // quem são os personagens, 2-3 linhas
  descritores: DescritorCaso[]; // 5–6, ordem da matriz
}

export interface Porta1 {
  competencia: string;
  introducao: string; // "Liderança não é uma coisa só" — 2-3 linhas
  descritores: DescritorCaso[]; // mesmos da porta 2 (a régua é uma só)
}

export interface Porta3 {
  personagem: string; // nome da persona do caso
  lacuna: string; // descritor mais baixo
  objetivo: string;
  missao: string; // missão prática da semana
  evidencia_esperada: string;
  ritual: string;
  checklist: string[]; // 3 itens
}

export interface Porta4Espelho {
  semana: number;
  comum: { competencia: string; descritor: string; ideia_central: string };
  pessoas: Array<{
    nome: string;
    cargo: string;
    perfil_disc: string; // ex. "D", "S"
    exemplo: string;
    linguagem: string;
    desafio: string;
    formato: string; // vídeo | áudio | texto | pdf
  }>; // exatamente 2 — mesmo cargo, competência e semana
}

export interface Porta5Painel {
  ciclo: string; // ex. "Ciclo 1 · 12 semanas"
  pessoas: Array<{
    nome: string;
    cargo: string;
    descritores: Array<{
      nome: string;
      antes: number;
      depois: number;
      status: 'evolucao_confirmada' | 'evolucao_parcial' | 'estagnacao';
    }>;
  }>;
}

export interface PersonaKit {
  id: string;
  nome: string;
  cargo: string;
  perfil_disc: string;
  descritor_foco: string;
  kit: {
    pilula1: { tipo: 'video' | 'audio' | 'texto'; src: string | null; titulo: string; duracao?: string };
    pilula2: { tipo: 'video' | 'audio' | 'texto'; src: string | null; titulo: string; duracao?: string };
    missao: { titulo: string; texto: string; evidencia: string };
    pdf: { src: string | null; titulo: string };
  };
}

export interface CasoReserva {
  id: string;
  tema: string; // delegacao | conversa-dificil
  resumo: string;
}

export interface ConteudoConarh {
  versao: string;
  rotulo: string; // "caso demonstrativo" — aparece em toda tela
  caso: {
    id: string;
    tema: 'feedback' | 'delegacao' | 'conversa-dificil';
    titulo: string;
    personagem: { nome: string; cargo: string; contexto: string };
  };
  portas: [
    { numero: 1; nome: string; sub: string },
    { numero: 2; nome: string; sub: string },
    { numero: 3; nome: string; sub: string },
    { numero: 4; nome: string; sub: string },
    { numero: 5; nome: string; sub: string },
  ];
  porta1: Porta1;
  porta2: Porta2;
  porta3: Porta3;
  porta4: Porta4Espelho;
  porta5: Porta5Painel;
  personas: PersonaKit[]; // 4–5, kit completo com play local
  casos_reserva: CasoReserva[];
  mapa_evolucao: {
    perguntas_revisao: string[]; // 3 perguntas para ele revisar o processo atual
    ciclo_resumo: string[]; // 5 linhas, uma por porta
  };
  agenda: {
    dias: Array<{ data: string; rotulo: string; slots: string[] }>; // 3 dias da feira + follow
  };
}
