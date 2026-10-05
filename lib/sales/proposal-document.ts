// Modelo de dados do DOCUMENTO da proposta (cliente-facing).
//
// Fonte única consumida pela página pública /proposta/[token] E pelo PDF, para
// que os dois fiquem idênticos. Exclui de propósito TUDO que é interno: comissão
// estimada, margem, score, notas de aprovação. O cliente só vê o que é dele.
//
// O conteúdo institucional (pilares, entregas, o que cada lado recebe, etapas)
// mora aqui como constante e não no banco: é a mesma história em toda proposta,
// e texto que sai para fora de graça precisa de um lugar onde seja revisado uma
// vez — não copiado à mão por quem monta cada proposta.
//
// 🔴 NÃO PROMETER BLOCO DESLIGADO. `lib/blocos-offline.ts` mantém Pulso, Seleção,
// Radar Empresas, RadarBett e CONARH fora do ar desde 31/08/2026. Este arquivo
// descreve o que o cliente vai receber: cite só o que está no ar. (Até 14/09 o
// item de "não incluso" explicava o Pulso para dizer que não era eNPS — falava
// de um bloco desligado para negar outra coisa.)
import { PRODUCT_PACKAGE_LABELS, CUSTOMER_TYPE_LABELS } from './constants';
import { ROTULO_SIMULADOR } from '@/lib/orcamento/precificacao';
import { SIMULADORES, type Simulador } from '@/lib/simuladores/acesso-cargo';
import type { SalesProposal } from './types';
import { extrairProgramaDoOrcamento, type OrcamentoVinculado, type ProposalPrograma } from './proposal-programa';

export const PROPOSAL_VALIDITY_DAYS = 30;

/** Canais públicos da Vertho (os mesmos da sala de imprensa, vertho.ai). */
export const CONTATO_INSTITUCIONAL = {
  nome: 'Equipe Vertho',
  email: 'contato@vertho.ai',
  whatsapp: '5511911807809',
} as const;

export type ProposalContato = {
  nome: string;
  email: string | null;
  /** E.164 sem "+" — é o que monta o link wa.me. */
  whatsapp: string | null;
  /** De onde veio o contato: útil para o admin saber o que corrigir na origem. */
  origem: 'proposta' | 'representante' | 'institucional';
};

export type ProposalAceite = {
  nome: string;
  cargo: string | null;
  em: string; // ISO
};

export type ProposalEtapa = {
  fase: string;
  descricao: string;
  /** Quanto dura, quando se sabe ("~1 semana"). */
  duracao?: string;
  /** O que o cliente TEM na mão ao fim da etapa. */
  entrega?: string;
};

/**
 * Versão do texto institucional. Escola e rede de ensino leem o exemplo da
 * coordenação e das professoras; o resto lê o de liderança. Os três decks de
 * venda (educação pública, privada e corporativo) fazem essa mesma divisão.
 */
export type ProposalSegmento = 'educacao' | 'corporativo';

export type ProposalCuradoria = {
  humano: { titulo: string; resumo: string; itens: string[] };
  ia: { titulo: string; resumo: string; itens: string[] };
};

export type ProposalCenario = {
  rotulo: string;
  situacao: string;
  perguntas: { nome: string; pergunta: string }[];
  fechamento: string;
};

export type ProposalPersonalizacao = {
  titulo: string;
  intro: string;
  pessoas: { nome: string; necessidade: string; foco: string }[];
  fechamento: string;
};

export type ProposalFundador = {
  nome: string;
  bio: string;
  /** Arquivo em `public/proposta/` (a página serve, o PDF lê por `fs`). */
  arquivo: string;
};

export type ProposalGestao = { perguntas: string[]; niveis: string };

export type ProposalSimulador = { nome: string; descricao: string; pessoas: number };

/**
 * Como o documento chama quem contrata. "Instituição" é palavra de escola: numa
 * rede de academias ou numa indústria ela soa como texto de outro cliente
 * (medido em 05/10/2026, na proposta de uma rede de academias, que dizia "A
 * instituição recebe" e "o ambiente da instituição"). O substantivo muda por
 * segmento, e o NOME do cliente entra onde a frase aceita um nome sem artigo.
 * Não se escreve "da Bluefit" nem "do Grupo X": o artigo de um nome próprio não
 * se deduz, e errar o gênero de uma marca é pior que usar "a empresa".
 */
export type ProposalTermos = {
  /** "empresa" ou "instituição", sem artigo. */
  entidade: string;
  /** "da empresa" / "da instituição": o texto corrido do documento. */
  deEntidade: string;
  /** Título do quadro "Quem recebe o quê". */
  tituloQuemRecebe: string;
  /** Cabeçalho da coluna do cliente: "Bluefit recebe" com nome, "A empresa recebe" sem. */
  colunaCliente: string;
  /** Fim da frase do aceite, depois de "em nome": "de Bluefit" com nome, "da empresa" sem. */
  emNomeDe: string;
};

export type ProposalDocumentVM = {
  numero: string;
  emitidaEm: string;   // ISO
  validaAte: string;   // ISO (emitida + PROPOSAL_VALIDITY_DAYS)
  expirada: boolean;
  /**
   * `nome` é null quando ninguém preencheu o destinatário. O documento OMITE o
   * bloco nesse caso — decisão do dono em 14/09/2026. O fallback antigo escrevia
   * "Cliente" no lugar mais visível da capa, e usar o nome do cenário do
   * orçamento seria pior: aquele campo é interno ("agressivo v3", "teste").
   */
  cliente: { nome: string | null; tipo: string | null };
  contexto: string | null;        // dor/contexto (necessidade da oportunidade)
  produto: string | null;
  escopoItens: string[];
  /** Números do programa vindos do orçamento; null no fluxo do RC. */
  programa: ProposalPrograma | null;
  investimento: {
    /** Valor de cada parcela (projeto) ou a mensalidade (contrato). */
    mensal: number | null;
    /** Parcelas do projeto OU meses de vigência — ver `vendidoPorProjeto`. */
    meses: number | null;
    total: number | null;
    condicoesPagamento: string | null;
    descontoPercent: number | null;
    /** Investimento por participante no programa inteiro. */
    porPessoa: number | null;
    /**
     * true = venda por PROJETO (deal desk): `contract_duration_months` são as
     * parcelas e `monthly_value` é a parcela. Dizer "valor mensal · vigência de
     * 10 meses" num projeto de 8 meses parcelado em 10 confunde as duas coisas.
     * false = contrato do RC, onde os campos são mesmo mensalidade e vigência.
     */
    vendidoPorProjeto: boolean;
  };
  segmento: ProposalSegmento;
  termos: ProposalTermos;
  pilares: { titulo: string; texto: string }[];
  curadoria: ProposalCuradoria;
  cenario: ProposalCenario;
  personalizacao: ProposalPersonalizacao;
  fundadores: ProposalFundador[];
  gestao: ProposalGestao;
  /** Simuladores incluídos (vazio = a seção some). Contagem vem do orçamento. */
  simuladores: ProposalSimulador[];
  entregas: { titulo: string; texto: string }[];
  paraPessoa: string[];
  paraInstituicao: string[];
  naoIncluso: string[];           // limites do escopo (padrão)
  premissas: string[];            // padrão
  cronograma: ProposalEtapa[];    // padrão
  proximosPassos: string[];       // padrão
  notasComerciais: string | null;
  contato: ProposalContato;
  aceite: ProposalAceite | null;
  /** Aceite pela página ainda é possível (aprovada/enviada e dentro da validade). */
  podeAceitar: boolean;
  status: string;
};

// ── Conteúdo institucional (mesma história em toda proposta) ────────────────

// A dupla IA vale onde ela roda: mapeamento (avaliação e auditoria), PDI e geração
// de cenários. Os simuladores têm avaliador único, conferido por código pela fala
// literal da pessoa, então "toda avaliação" e "a decisão nunca sai de um único
// julgamento" prometiam mais do que existe (R-133 e decisão 11 da revisão de 02/10/2026).
const PILARES_PADRAO = [
  {
    titulo: 'Diagnóstico por pessoa',
    texto: 'Mapeamento Comportamental e mapeamento por cenários do dia a dia do cargo. '
      + 'No mapeamento, no PDI e na geração dos cenários, uma segunda IA confere o trabalho da primeira.',
  },
  {
    titulo: 'Jornada personalizada',
    texto: 'Conteúdo semanal gerado para o cargo, o nível e o perfil de cada participante, no formato '
      + 'em que ela aprende melhor: vídeo, podcast, texto ou case. Duas pessoas na mesma função podem fazer jornadas diferentes.',
  },
  {
    // Ninguém do cliente vê nota decimal: a pessoa, o gestor e o RH leem nível e
    // avanço (decisão 1 e R-24 da revisão de 02/10/2026).
    titulo: 'Evidência de evolução',
    texto: 'Ao fim da jornada a pessoa passa pela avaliação final, e o relatório mostra, em cada competência, o nível de partida, '
      + 'o nível de chegada e o avanço em cada comportamento. Desenvolvimento que se mede, não que se presume.',
  },
];

/** O substantivo de quem contrata, por segmento. Sem artigo: cada frase põe o seu. */
const ENTIDADE: Record<ProposalSegmento, string> = { educacao: 'instituição', corporativo: 'empresa' };

const entregasPadrao = (segmento: ProposalSegmento) => [
  {
    titulo: 'Ambiente dedicado',
    texto: `Subdomínio próprio da ${ENTIDADE[segmento]}, com a identidade visual de vocês e acesso por WhatsApp ou e-mail.`,
  },
  {
    titulo: 'Matrizes de competência por cargo',
    texto: 'Competências e descritores definidos para cada cargo mapeado: a régua que diz o que se espera de quem ocupa a função.',
  },
  {
    titulo: 'Diagnóstico individual',
    texto: 'Perfil comportamental e nível por competência de cada participante, a partir de cenários reais do cotidiano.',
  },
  {
    // O "PDI" do produto é o relatório individual (`relatorios`, tipo individual):
    // por competência, foco de 30 dias, ações, checklist e evidência esperada,
    // ancorados nas respostas da pessoa. Não prometer mais do que isso.
    titulo: 'Plano de Desenvolvimento Individual (PDI)',
    texto: 'Por competência, o foco, as ações e a evidência esperada, a partir das respostas da própria pessoa no diagnóstico.',
  },
  {
    titulo: 'Semanas personalizadas',
    texto: 'Conteúdo, desafio prático e reflexão a cada semana, no ritmo de cada pessoa.',
  },
  {
    titulo: 'Tira-Dúvidas e Beto',
    texto: 'O Tira-Dúvidas responde sobre o tema da semana, a conversa de evidências provoca reflexão e o Beto, assistente em qualquer tela, ajuda a aplicar no trabalho, durante toda a jornada.',
  },
  {
    titulo: 'Avaliação final',
    texto: 'Novo cenário e arguição oral com a IA ao fim da jornada, para medir o que mudou na prática.',
  },
  {
    // Só documentos que chegam ao cliente. A Plenária e o Dossiê do Gestor nunca
    // foram gerados (R-12 da revisão de 02/10/2026); o PDI tem cartão próprio acima.
    titulo: 'Relatórios',
    texto: 'Relatório de evolução por participante, em tela e PDF, e certificado de conclusão para quem tem participação mínima de 75%; Relatório do Gestor sobre a própria equipe; '
      + 'e, para o RH, relatório consolidado, PDF executivo de fim de jornada e relatório de engajamento.',
  },
  {
    titulo: 'Suporte dedicado',
    texto: 'Canal direto com a equipe Vertho do setup ao fechamento de cada jornada.',
  },
];

const PARA_PESSOA_PADRAO = [
  'Um perfil comportamental com narrativa, não um rótulo de quatro letras.',
  'Um PDI com o foco, as ações e a evidência esperada em cada competência.',
  'Jornada no formato que ela aprende melhor, contextualizada pelo cargo.',
  'Desafios aplicados ao trabalho real, não exercícios genéricos.',
  'Tira-Dúvidas e Beto disponíveis ao longo da semana.',
  'Relatório pessoal de evolução ao fim de cada jornada.',
];

const PARA_INSTITUICAO_PADRAO = [
  'Mapa de competências por cargo, com o nível real de cada pessoa.',
  'Painel de engajamento: quem avançou, quem parou, em que semana.',
  'Relatório consolidado de RH com a leitura do conjunto.',
  'Relatório do Gestor sobre a própria equipe, para conversas de desenvolvimento.',
  'PDF executivo de fim de jornada, com a evolução por competência, por comportamento e por pessoa.',
];

// ── Blocos vindos dos decks de venda (17/09/2026, pedido do Rodrigo) ────────
// Texto dos decks "Educação Pública", "Educação Privada" e "Apresentação 2",
// com os erros de digitação corrigidos. Cada afirmação sobre o produto foi
// conferida no código: o cenário tem mesmo 4 perguntas abertas (p1 a p4) e é
// gerado por cargo, competência e contexto da empresa.

const CURADORIA: Record<ProposalSegmento, ProposalCuradoria> = {
  educacao: {
    humano: {
      titulo: 'Curadoria humana',
      resumo: 'Garante contexto, qualidade e coerência com a proposta da instituição.',
      itens: ['Definição das competências', 'Construção e validação das situações', 'Critérios de avaliação', 'Conteúdo e contextualização', 'Governança'],
    },
    ia: {
      titulo: 'IA + automação',
      resumo: 'Dá velocidade e escala ao que a curadoria define.',
      itens: ['Análise das respostas', 'Identificação de padrões', 'Recomendação e personalização', 'Mobilização e acompanhamento'],
    },
  },
  corporativo: {
    humano: {
      titulo: 'Curadoria humana',
      resumo: 'Garante contexto, qualidade e coerência com o negócio.',
      itens: ['Definição das competências', 'Construção e validação das situações', 'Critérios de avaliação', 'Conteúdo e contextualização', 'Governança'],
    },
    ia: {
      titulo: 'IA + automação',
      resumo: 'Dá velocidade e escala ao que a curadoria define.',
      itens: ['Análise das respostas', 'Identificação de padrões', 'Recomendação e personalização', 'Mobilização e acompanhamento'],
    },
  },
};

const CENARIO: Record<ProposalSegmento, ProposalCenario> = {
  educacao: {
    rotulo: 'Cenário situacional · Coordenação',
    situacao: 'Uma família questiona a coordenação após uma advertência. O professor teve razão em parte, '
      + 'mas a comunicação com a família poderia ter acontecido antes.',
    perguntas: [
      { nome: 'Escolha', pergunta: 'Como conduz a conversa?' },
      { nome: 'Execução', pergunta: 'Que combinados propõe?' },
      { nome: 'Tensão humana', pergunta: 'Como reage à crítica?' },
      { nome: 'Sustentação', pergunta: 'Como acompanha se resolveu?' },
    ],
    fechamento: 'Não é prova. É uma forma de identificar como o profissional decide, se comunica e age na rotina. '
      + 'O resultado é uma fotografia clara do que desenvolver, por profissional, equipe e competência.',
  },
  // Gerado em 05/10/2026 pelo caminho do Banco de Cenários (IA3): os prompts de
  // `lib/ia3-cenarios.ts`, a ficha de um gerente de loja de rede de academias
  // (descrição, entregas, stakeholders, decisões e tensões, no formato de
  // `cargos_empresa`) e a competência "Comunicação e Conversas de Liderança" da
  // matriz global de liderança, a mesma régua do simulador que a proposta vende.
  // Geração no Sonnet 5.5, auditoria por outra família (gpt-5.6-terra): nota 93,
  // aprovado, 1ª rodada, sem erro de validação. O texto abaixo é o da geração,
  // sem retoque. Era um caso de expedição de caminhões (herdado do deck
  // corporativo), servido a uma rede de academias que tinha ouvido
  // "hipercustomizado". Os rótulos das perguntas são os descritores que cada uma
  // cobre (D1 Preparação e propósito, D5 Gestão de divergências, D4 Acordos
  // verificáveis, D6 Continuidade dos acordos), e não os "Escolha/Execução" do deck.
  // Trocar de cargo é regerar com outra ficha, nunca editar à mão: o número da
  // auditoria deixa de valer no texto retocado.
  corporativo: {
    // "Cenário situacional · Gerente de loja" quebra na coluna do PDF e deixa "LOJA"
    // sozinha na segunda linha (medido em imagem, 05/10/2026): 33 caracteres cabem.
    rotulo: 'Cenário · Gerente de loja',
    situacao: 'Sexta, 18h30, horário de pico. Uma unidade da rede está em 78% da meta de matrículas a cinco dias do '
      + 'fechamento. Um instrutor faltou e Rafael, instrutor de confiança há três anos, cobriu o turno com horas extras. '
      + 'Para ajudar a recepção, que tinha fila de matrículas, ele deixou a sala de musculação sem instrutor por cerca de '
      + '15 minutos. Nesse intervalo, um aluno novo caiu ao fazer supino sem orientação, sem lesão grave. Você viu o '
      + 'episódio nas câmeras. Camila, gerente regional, cobra o fechamento da meta. No grupo da equipe, Rafael escreveu: '
      + '"se for pra ser cobrado por ajudar, não cubro mais". A escala de amanhã já tem uma baixa e você precisa conversar com Rafael.',
    perguntas: [
      { nome: 'Abertura', pergunta: 'Como você abre a conversa com Rafael? Diga em que momento e lugar a faria, qual propósito explicita e que fato concreto cita logo no início.' },
      { nome: 'Divergência', pergunta: 'Rafael responde: "Se eu não ajudasse, a gente perdia matrícula. Você cobra meta e agora me cobra isso?" O que você diz e pergunta nesse momento?' },
      { nome: 'Acordo', pergunta: 'Rafael diz que está no limite e que não cobre mais faltas. O que você responde para manter a sala sempre coberta e ainda combinar algo concreto com ele?' },
      { nome: 'Continuidade', pergunta: 'Nas próximas duas semanas, como você acompanha o combinado com Rafael? Diga quando, em que formato, o que observa e como ele sinaliza dificuldades.' },
    ],
    fechamento: 'Não é prova nem quiz, e este caso é só um exemplo: no programa, cada situação é gerada a partir da ficha de cada cargo, '
      + 'da competência avaliada e do contexto da empresa, e cada pergunta força uma decisão com custo. Ninguém digita relatório depois.',
  },
};

const PERSONALIZACAO: Record<ProposalSegmento, ProposalPersonalizacao> = {
  educacao: {
    titulo: 'Mesma função, necessidades diferentes',
    intro: 'A personalização parte do nível, do perfil e das necessidades que o diagnóstico identificou.',
    pessoas: [
      { nome: 'Professora A', necessidade: 'Tem boa relação com a turma, mas precisa tornar as devolutivas às famílias mais claras e frequentes.', foco: 'comunicação com famílias' },
      { nome: 'Professor B', necessidade: 'Domina o conteúdo, mas tem dificuldade para adaptar a prática a diferentes perfis de aprendizagem.', foco: 'diferenciação pedagógica e inclusão' },
      { nome: 'Professor C', necessidade: 'Engaja os alunos, mas precisa registrar evidências e acompanhar a evolução com mais consistência.', foco: 'acompanhamento da aprendizagem' },
      { nome: 'Professora D', necessidade: 'Chegou alinhada à cultura da escola, mas ainda precisa fortalecer planejamento e gestão de sala.', foco: 'planejamento e gestão de sala' },
    ],
    fechamento: 'A competência pode ser a mesma. O que cada professor precisa desenvolver pode ser diferente.',
  },
  corporativo: {
    titulo: 'Mesma competência, jornadas diferentes',
    intro: 'A personalização parte do nível, do perfil e das necessidades que o diagnóstico identificou. Exemplo com a competência liderança:',
    pessoas: [
      { nome: 'Pessoa A', necessidade: 'Precisa tornar as conversas de desenvolvimento mais objetivas e frequentes.', foco: 'feedback' },
      { nome: 'Pessoa B', necessidade: 'Centraliza decisões e precisa ampliar a autonomia do time.', foco: 'delegação' },
      { nome: 'Pessoa C', necessidade: 'Precisa estruturar critérios para decidir com mais segurança.', foco: 'tomada de decisão' },
    ],
    fechamento: 'Cada pessoa trabalha só o que precisa, a partir do ponto em que está.',
  },
};

/** Exportado para o guard que confere se cada foto existe e chega à Vercel. */
export const FUNDADORES: ProposalFundador[] = [
  {
    nome: 'Samuel Protetti',
    bio: '30 anos em aprendizagem e comunicação. 2.000+ educadores e gestores formados. Projetos com UNESCO, Banco Mundial e GIZ.',
    arquivo: 'fundador-samuel-protetti-2026-09.jpg',
  },
  {
    nome: 'Juliane Cavalcante',
    bio: '25+ anos em educação e comunicação. 3.000+ alunos ao longo da carreira. Mestre em Comunicação pela USP.',
    arquivo: 'fundador-juliane-cavalcante-2026-09.jpg',
  },
  {
    nome: 'Rodrigo Naves',
    bio: '20+ anos em T&D e tecnologia. Liderou programas em larga escala e criou plataformas com 23 mil+ usuários.',
    arquivo: 'fundador-rodrigo-naves-2026-09.jpg',
  },
];

const PERGUNTAS_GESTAO = [
  'Onde estão as principais lacunas de desenvolvimento?',
  'Quais equipes precisam de apoio?',
  'Que temas devem virar formação coletiva?',
  'Quem precisa se desenvolver antes de assumir novas responsabilidades?',
  'O que evoluiu depois das jornadas?',
];
const NIVEIS_GESTAO: Record<ProposalSegmento, string> = {
  educacao: 'profissional · equipe · função · escola',
  corporativo: 'pessoa · equipe · função · organização',
};

/**
 * O que cada simulador é, para quem nunca o viu. Conferido no produto
 * (19/09/2026): vendas em docs/SIMULADOR-VENDAS.md, atendimento em
 * docs/recepcao-medica.md e liderança em docs/SIMULADOR-LIDERANCA.md (os
 * encontros) e lib/prontidao-lideranca/ (o Mapeamento de liderança, que o
 * mesmo módulo liga). Até 19/09 a liderança descrevia só o mapeamento.
 */
const descricaoSimulador = (segmento: ProposalSegmento): Record<Simulador, string> => ({
  vendas: 'Conversas de venda com um cliente simulado por IA, a partir dos produtos, do público e das condições '
    + 'da própria empresa, com devolutiva por competência na metodologia PACE.',
  // A revisão humana foi extinta nos três simuladores em 22/09/2026 (R-04).
  atendimento: `Atendimentos com um cliente simulado por IA, em casos que a ${ENTIDADE[segmento]} pode adaptar, avaliados `
    + 'por competência em quatro níveis, com devolutiva que cita a fala literal da pessoa em cada competência.',
  lideranca: 'Cinco encontros com personagens simulados por IA, avaliados por competência em quatro níveis e '
    + 'acompanhados pelo RH e pelo gestor. Inclui o Mapeamento de liderança: quem está pronto para liderar e em que estilo.',
});

/** Escola e rede de ensino leem a versão de educação; o resto, a corporativa. */
export function segmentoDoCliente(customerType: string | null | undefined): ProposalSegmento {
  return customerType === 'escola' || customerType === 'rede_ensino' ? 'educacao' : 'corporativo';
}

// Seções institucionais padrão do documento (iguais ao modelo de proposta do kit).
const NAO_INCLUSO_PADRAO = [
  'Customizações técnicas ou integrações não previstas neste escopo.',
  'Diagnóstico clínico, psicológico ou avaliação de saúde mental.',
  'Pesquisa de clima organizacional ou eNPS.',
  'Avaliação de desempenho formal (nine-box, nota de avaliador, OKRs).',
  'Garantia de ROI financeiro específico (a Vertho mede evolução de competências).',
  'Consultoria presencial, salvo se contratada à parte.',
  'Recrutamento e seleção (ATS).',
];
const PREMISSAS_PADRAO = [
  'O cliente enviará a planilha de setup (cargos + colaboradores) e documentos institucionais até a data combinada.',
  'O ponto focal do cliente estará disponível para validações durante o setup.',
  'Os participantes terão acesso a smartphone ou computador com internet.',
  'O envio de links de acesso será por WhatsApp e/ou e-mail, conforme preferência do cliente.',
];
const cronogramaPadrao = (segmento: ProposalSegmento): ProposalEtapa[] => [
  {
    fase: 'Setup',
    duracao: '~1 semana',
    descricao: `Configuração do ambiente dedicado: cargos, colaboradores e identidade visual da ${ENTIDADE[segmento]}.`,
    entrega: 'Ambiente no ar em até 2 dias úteis após o material completo.',
  },
  {
    fase: 'Diagnóstico',
    duracao: '1 a 2 semanas',
    descricao: 'Mapeamento Comportamental e mapeamento de competências por participante, a partir de cenários do cargo.',
    entrega: 'Perfil e nível por competência de cada pessoa.',
  },
  {
    fase: 'Jornada',
    descricao: 'Desenvolvimento personalizado por cargo e perfil, com conteúdo semanal, desafio prático, Tira-Dúvidas e Beto.',
    entrega: 'Acompanhamento semanal de engajamento para o RH.',
  },
  {
    fase: 'Fechamento',
    descricao: 'Novo cenário situacional e arguição oral com a IA, com reavaliação das competências trabalhadas.',
    entrega: 'Nível de chegada e avanço em cada comportamento, com a leitura conferida por uma segunda IA.',
  },
  {
    fase: 'Resultados',
    descricao: 'Leitura da jornada com o RH e com os gestores, e definição do foco da jornada seguinte.',
    entrega: 'Relatório de evolução por participante, Relatório do Gestor, consolidado de RH e PDF executivo de fim de jornada.',
  },
];
const PROXIMOS_PASSOS_PADRAO = [
  'Aprovação desta proposta.',
  'Envio da planilha de setup preenchida + logo + documentos institucionais.',
  'A Vertho configura o ambiente em até 2 dias úteis após o recebimento completo.',
  'Disparo do diagnóstico na data combinada.',
];

/** Status em que o cliente ainda pode registrar o aceite pela página pública. */
const ACEITAVEIS = ['approved', 'sent_to_client'];

/**
 * O aceite pela página só vale para proposta SEM RC (deal desk).
 *
 * Aceitar uma proposta do RC não é só carimbar `accepted`: `markProposalAccepted`
 * fecha a oportunidade como ganha, ativa a conta na carteira (carimbando início e
 * renovação) e materializa os eventos de comissão. Um carimbo vindo do link
 * público pularia os três — a oportunidade ficaria aberta, a conta fora da
 * carteira e o RC sem comissão de um negócio fechado, sem nada acusando.
 *
 * Então a página oferece o aceite onde ele é completo, e manda falar com o
 * contato onde não é. Reabrir isto exige extrair o núcleo de `markProposalAccepted`
 * para `lib/` e chamá-lo daqui — não basta afrouxar a condição.
 */
export function aceitePublicoPermitido(proposal: Pick<SalesProposal, 'status' | 'representante_id'>): boolean {
  return ACEITAVEIS.includes(proposal.status) && proposal.representante_id == null;
}

function textoOuNull(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : '';
  return s || null;
}

/** Os termos do documento para um segmento e um cliente (nome opcional). Ver `ProposalTermos`. */
export function termosDoCliente(segmento: ProposalSegmento, nomeCliente: string | null | undefined): ProposalTermos {
  const entidade = ENTIDADE[segmento];
  const nome = textoOuNull(nomeCliente);
  return {
    entidade,
    deEntidade: `da ${entidade}`,
    tituloQuemRecebe: `Para cada pessoa, e para a ${entidade}`,
    colunaCliente: nome ? `${nome} recebe` : `A ${entidade} recebe`,
    emNomeDe: nome ? `de ${nome}` : `da ${entidade}`,
  };
}

/**
 * Contato que assina o documento.
 *
 * Precedência: campos da PRÓPRIA proposta (mig 255, obrigatórios na conversão do
 * deal desk) → representante dono → canais públicos da Vertho. O último degrau
 * existe para que uma proposta antiga, criada antes da mig 255 e sem RC, ainda
 * diga com quem falar — nunca para substituir o contato de quem está vendendo.
 */
function resolverContato(
  proposal: SalesProposal,
  rep: { name: string | null; email: string | null; phone: string | null } | null,
): ProposalContato {
  const nome = textoOuNull((proposal as any).contact_name);
  const email = textoOuNull((proposal as any).contact_email);
  const whatsapp = textoOuNull((proposal as any).contact_phone);
  if (nome || email || whatsapp) {
    return { nome: nome || CONTATO_INSTITUCIONAL.nome, email, whatsapp, origem: 'proposta' };
  }

  const repNome = textoOuNull(rep?.name);
  const repEmail = textoOuNull(rep?.email);
  const repFone = textoOuNull(rep?.phone);
  if (repNome || repEmail || repFone) {
    return { nome: repNome || 'Representante Vertho', email: repEmail, whatsapp: repFone, origem: 'representante' };
  }

  return { ...CONTATO_INSTITUCIONAL, origem: 'institucional' };
}

/** Constrói o VM cliente-facing a partir da proposta + conta + representante. */
export function buildProposalDocument(
  proposal: SalesProposal,
  account: { legal_name: string | null; trade_name: string | null } | null,
  rep: { name: string | null; email: string | null; phone: string | null } | null,
  extra?: { contexto?: string | null; orcamento?: OrcamentoVinculado },
): ProposalDocumentVM {
  const emitida = proposal.approved_at || proposal.created_at;
  const emitidaDate = new Date(emitida);
  const valida = new Date(emitidaDate);
  valida.setDate(valida.getDate() + PROPOSAL_VALIDITY_DAYS);
  const expirada = valida.getTime() < Date.now();

  const escopoItens = (proposal.included_scope || '')
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/^[-•*]\s*/, ''))
    .filter(Boolean);

  const programa = extrairProgramaDoOrcamento(extra?.orcamento);
  // Participantes: o orçamento manda, mas a proposta do RC também tem o número.
  const pessoas = programa?.pessoas ?? (proposal.number_of_users || null);
  const total = proposal.total_contract_value;
  const porPessoa = total != null && pessoas != null && pessoas > 0
    ? Math.round(Number(total) / pessoas)
    : null;

  const segmento = segmentoDoCliente(proposal.customer_type);
  const aceiteEm = textoOuNull((proposal as any).accepted_at);
  const aceiteNome = textoOuNull((proposal as any).accepted_by_name);
  // Conta do CRM tem precedência; sem ela, o nome em texto livre que veio do
  // orçamento do deal desk (mig 254). Sem nenhum dos dois o bloco some.
  const nomeCliente = textoOuNull(account?.trade_name) || textoOuNull(account?.legal_name) || textoOuNull(proposal.cliente_nome);

  return {
    numero: proposal.proposal_number,
    emitidaEm: emitida,
    validaAte: valida.toISOString(),
    expirada,
    cliente: {
      nome: nomeCliente,
      tipo: proposal.customer_type ? (CUSTOMER_TYPE_LABELS[proposal.customer_type] || proposal.customer_type) : null,
    },
    contexto: extra?.contexto?.trim() || null,
    produto: proposal.product_package
      ? (PRODUCT_PACKAGE_LABELS[proposal.product_package] || proposal.product_package)
      : null,
    escopoItens,
    programa,
    investimento: {
      mensal: proposal.monthly_value,
      meses: proposal.contract_duration_months,
      total,
      condicoesPagamento: proposal.payment_terms,
      descontoPercent: proposal.discount_requested,
      porPessoa,
      // A venda por projeto é exatamente o caminho que tem orçamento vinculado.
      vendidoPorProjeto: programa != null,
    },
    segmento,
    termos: termosDoCliente(segmento, nomeCliente),
    pilares: PILARES_PADRAO,
    curadoria: CURADORIA[segmento],
    cenario: CENARIO[segmento],
    personalizacao: PERSONALIZACAO[segmento],
    fundadores: FUNDADORES,
    gestao: { perguntas: PERGUNTAS_GESTAO, niveis: NIVEIS_GESTAO[segmento] },
    simuladores: SIMULADORES
      .filter((s) => (programa?.simuladores?.[s] ?? 0) > 0)
      .map((s) => ({ nome: ROTULO_SIMULADOR[s], descricao: descricaoSimulador(segmento)[s], pessoas: programa!.simuladores![s] })),
    entregas: entregasPadrao(segmento),
    paraPessoa: PARA_PESSOA_PADRAO,
    paraInstituicao: PARA_INSTITUICAO_PADRAO,
    naoIncluso: NAO_INCLUSO_PADRAO,
    premissas: PREMISSAS_PADRAO,
    cronograma: cronogramaPadrao(segmento),
    proximosPassos: PROXIMOS_PASSOS_PADRAO,
    notasComerciais: proposal.commercial_notes,
    contato: resolverContato(proposal, rep),
    aceite: aceiteEm && aceiteNome
      ? { nome: aceiteNome, cargo: textoOuNull((proposal as any).accepted_by_role), em: aceiteEm }
      : null,
    podeAceitar: aceitePublicoPermitido(proposal) && !expirada,
    status: proposal.status,
  };
}
