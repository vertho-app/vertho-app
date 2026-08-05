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

// ⚠️ Desde 04/08/2026 a TELA da porta 2 não usa mais este bloco: ela roda o
// `cenario` da régua escolhida na porta 1 (ver CenarioRegua). O registro
// escrito continua vivo porque é o conteúdo da PRANCHETA — o fallback de
// papel plastificado (`/conarh/prancheta`), que não tem toque nem estado.
// Apagar isto quebra o plano B da feira.
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

// Uma das QUATRO perguntas do cenário + a resposta da pessoa avaliada.
//
// As quatro não são um bate-papo: são o instrumento que a IA3 gera de verdade
// (`lib/ia3-cenarios.ts`), e cada uma tem um papel fixo, nesta ordem —
//   1 ESCOLHA        · trade-off real, priorização com custo declarado
//   2 EXECUÇÃO       · o COMO, sabendo que haverá resistência
//   3 TENSÃO HUMANA  · alguém que resiste, sofre ou discorda, na cara
//   4 SUSTENTAÇÃO    · como saber que funcionou no médio prazo
// — todas ABERTAS, em 2ª pessoa, ≤200 caracteres, com decisão forçada: se dá
// para responder bem sem abrir mão de nada, priorizar nada e assumir risco
// nenhum, o cenário falhou como instrumento (regra de ouro do prompt da IA3).
// Escrever aqui pergunta de entrevista ("ficou marcada alguma data?") faz a
// demo exibir um artefato que a plataforma não produz.
//
// ⚠️ `nivel`, `evidencia` e `leitura` são a LEITURA da régua, não o cenário:
// só entram na tela DEPOIS que o visitante classificou. Mostrar o nível junto
// da resposta não deixa nada para ele classificar — e é o erro fácil de
// cometer aqui, porque no JSON os campos moram lado a lado.
export interface PerguntaAvaliativa {
  foco: 'Escolha' | 'Execução' | 'Tensão humana' | 'Sustentação';
  pergunta: string; // a pergunta do cenário, aberta e com custo embutido
  resposta: string; // o que a pessoa avaliada respondeu
  nivel: 1 | 2 | 3 | 4; // o nível que ESTA resposta evidencia
  evidencia: string; // trecho literal da resposta que ancora o nível
  leitura: string; // por que este trecho vale este nível
}

// O cenário situacional da competência + as 4 perguntas respondidas pela
// pessoa avaliada. Na porta 2 (05/08/2026) o visitante lê tudo e CLASSIFICA a
// pessoa num nível — o mesmo trabalho que a régua faz. Depois compara. O que a
// demo prova não é que ele erra: é que a régua sustenta a leitura com trecho,
// e diz a mesma coisa para todo mundo.
//
// A `nota` NÃO mora aqui: é derivada dos níveis das 4 respostas em código
// (`lib/conarh/leitura.ts`). Nota gravada à mão diverge das respostas no
// primeiro ajuste de conteúdo, e a tela passa a mostrar uma média que não é a
// média.
export interface CenarioRegua {
  id: string;
  descritor_cod: string; // qual descritor da matriz esta situação testa
  situacao: string;
  avaliado: { nome: string; cargo: string };
  /** Exatamente 4, na ordem dos focos — é o formato que a IA3 gera. */
  perguntas: PerguntaAvaliativa[];
  justificativa: string; // a leitura do conjunto, depois da classificação
  limite: string; // o que faltaria para o nível acima
}

// Competência de vitrine da porta 1: prova que a engrenagem (descritor +
// régua N1–N4) não é específica de liderança. Só a competência do CASO segue
// nas portas 3–5; a porta 2 roda o cenário da competência escolhida aqui.
export interface ReguaVitrine {
  id: string;
  eixo: string; // "Liderança" | "Vendas" | "Transversal" — rótulo curto do botão
  competencia: string;
  introducao: string; // 1ª frase vira manchete (ver partirNaPrimeiraFrase)
  descritores: DescritorRegua[];
  cenario: CenarioRegua;
}

export interface Porta1 {
  competencia: string;
  introducao: string; // "Liderança não é uma coisa só" — 2-3 linhas
  descritores: DescritorCaso[]; // mesmos da porta 2 (a régua é uma só)
  eixo?: string; // rótulo do botão da competência do caso
  cenario?: CenarioRegua; // o que a porta 2 roda quando esta régua é a escolhida
  reguas_vitrine?: ReguaVitrine[]; // outras competências, só para demonstrar a matriz
}

export interface Porta3 {
  personagem: string; // nome da persona do caso
  /**
   * De onde o plano saiu — os quatro insumos que a engine cruza, cada um com
   * o valor DESTA pessoa e o que ele decidiu no plano.
   *
   * Está na tela porque "o PDI é automático" soa a template até o visitante
   * ver que o perfil comportamental e a preferência de aprendizagem mudaram o
   * COMO e o FORMATO, não só o texto. É o mesmo par que a etapa 4 mostra no
   * espelho (DISC × formato), aqui na origem.
   */
  insumos: Array<{ rotulo: string; valor: string; efeito: string }>;
  /**
   * O PDF que a pessoa recebe de verdade — gerado pelo componente do produto
   * (`components/pdf/RelatorioIndividual`) a partir DESTE bloco, por
   * `scripts/_conarh-pdi-pdf.ts`. O arquivo é versionado porque a demo roda em
   * modo avião: nada é gerado no pavilhão.
   *
   * ⚠️ Mexeu em `objetivo`, `missao`, `evidencia_esperada` ou `ritual`? Rode o
   * script de novo — senão a tela e o PDF passam a contar histórias diferentes
   * sobre a mesma pessoa, e o expositor descobre isso na frente do visitante.
   */
  pdf: { src: string; capa: string; titulo: string; paginas: number };
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
