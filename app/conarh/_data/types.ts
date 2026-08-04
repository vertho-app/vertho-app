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

// A régua sozinha — sem a leitura do motor. É o que a porta 1 precisa para
// mostrar a MATRIZ; a leitura (`leitura_motor`) só existe para o caso avaliado
// na porta 2. `DescritorCaso` satisfaz este contrato.
export interface DescritorRegua {
  cod: string;
  nome_curto: string;
  descritor_completo: string;
  n1: string;
  n2: string;
  n3: string;
  n4: string;
}

// Competência de vitrine da porta 1: prova que a engrenagem (descritor +
// régua N1–N4) não é específica de liderança. Não entra no caso das portas
// 2–5 — lá a competência é uma só.
export interface ReguaVitrine {
  id: string;
  eixo: string; // "Liderança" | "Vendas" | "Transversal" — rótulo curto do botão
  competencia: string;
  introducao: string; // 1ª frase vira manchete (ver partirNaPrimeiraFrase)
  descritores: DescritorRegua[];
}

export interface Porta1 {
  competencia: string;
  introducao: string; // "Liderança não é uma coisa só" — 2-3 linhas
  descritores: DescritorCaso[]; // mesmos da porta 2 (a régua é uma só)
  eixo?: string; // rótulo do botão da competência do caso
  reguas_vitrine?: ReguaVitrine[]; // outras competências, só para demonstrar a matriz
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
    // A peça que a pessoa REALMENTE recebe naquele formato. Sem isto, a Camada
    // 3 ("o formato muda") era só uma palavra na tela: o play vinha de personas
    // de outra empresa e outra competência, o que contradizia o "mesma régua".
    midia?: {
      tipo: 'video' | 'audio' | 'texto';
      src: string | null; // arquivo local em /conarh/media (a demo roda offline)
      titulo: string;
      duracao?: string;
    };
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
  // A porta 4 mostra APENAS as personas de vitrine. As demais ficam no pacote
  // como reserva: são de outra empresa e outra competência que o caso da feira,
  // e enfileirá-las embaixo do espelho colocava 7 nomes na mesma tela,
  // contradizendo a frase "mesma competência, uma régua comum".
  vitrine?: boolean;
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
