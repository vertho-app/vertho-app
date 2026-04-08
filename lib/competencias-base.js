// lib/competencias-base.js — Default competency catalogs for Vertho Mentor IA

/**
 * Competencias padrao para o segmento Educacao.
 * Cada competencia tem cargo sugerido para facilitar associacao.
 */
export const COMPETENCIAS_EDUCACAO = [
  { cod_comp: 'EDU-01', nome: 'Gestão Pedagógica', pilar: 'Gestão', cargo: 'Diretor',
    descricao: 'Capacidade de planejar, implementar e avaliar processos pedagógicos alinhados aos objetivos institucionais.' },
  { cod_comp: 'EDU-02', nome: 'Liderança Educacional', pilar: 'Liderança', cargo: 'Diretor',
    descricao: 'Habilidade de inspirar e mobilizar equipes educacionais em torno de uma visão compartilhada de ensino de excelência.' },
  { cod_comp: 'EDU-03', nome: 'Comunicação Educacional', pilar: 'Comunicação', cargo: 'Coordenador',
    descricao: 'Capacidade de transmitir informações de forma clara, empática e adaptada a diferentes públicos da comunidade escolar.' },
  { cod_comp: 'EDU-04', nome: 'Inovação Pedagógica', pilar: 'Inovação', cargo: 'Coordenador',
    descricao: 'Disposição e competência para adotar novas metodologias, tecnologias e práticas de ensino-aprendizagem.' },
  { cod_comp: 'EDU-05', nome: 'Gestão de Pessoas', pilar: 'Gestão', cargo: 'Diretor',
    descricao: 'Habilidade de recrutar, desenvolver e reter talentos no ambiente educacional.' },
  { cod_comp: 'EDU-06', nome: 'Planejamento Estratégico', pilar: 'Estratégia', cargo: 'Diretor',
    descricao: 'Competência para definir metas de longo prazo e alinhar recursos para alcançar objetivos educacionais.' },
  { cod_comp: 'EDU-07', nome: 'Avaliação e Feedback', pilar: 'Comunicação', cargo: 'Coordenador',
    descricao: 'Capacidade de avaliar desempenho e fornecer feedback construtivo para o desenvolvimento contínuo.' },
  { cod_comp: 'EDU-08', nome: 'Gestão Financeira Educacional', pilar: 'Gestão', cargo: 'Diretor',
    descricao: 'Competência para gerenciar orçamentos, custos e investimentos em contexto educacional.' },
  { cod_comp: 'EDU-09', nome: 'Inclusão e Diversidade', pilar: 'Cultura', cargo: 'Professor',
    descricao: 'Habilidade de promover ambientes inclusivos que valorizem a diversidade e equidade no aprendizado.' },
  { cod_comp: 'EDU-10', nome: 'Tecnologia Educacional', pilar: 'Inovação', cargo: 'Professor',
    descricao: 'Domínio de ferramentas e plataformas digitais aplicadas ao processo de ensino-aprendizagem.' },
  { cod_comp: 'EDU-11', nome: 'Mediação de Conflitos', pilar: 'Comunicação', cargo: 'Coordenador',
    descricao: 'Capacidade de mediar e resolver conflitos entre alunos, professores e famílias de forma construtiva.' },
  { cod_comp: 'EDU-12', nome: 'Práticas Pedagógicas Diferenciadas', pilar: 'Gestão', cargo: 'Professor',
    descricao: 'Competência para adaptar metodologias de ensino às necessidades individuais dos alunos.' },
  { cod_comp: 'EDU-13', nome: 'Engajamento Familiar', pilar: 'Cultura', cargo: 'Coordenador',
    descricao: 'Habilidade de construir parcerias com famílias para fortalecer o processo educativo.' },
  { cod_comp: 'EDU-14', nome: 'Gestão do Tempo e Prioridades', pilar: 'Gestão', cargo: 'Professor',
    descricao: 'Capacidade de organizar rotinas, priorizar demandas e cumprir prazos no cotidiano escolar.' },
  { cod_comp: 'EDU-15', nome: 'Desenvolvimento Profissional Contínuo', pilar: 'Cultura', cargo: 'Professor',
    descricao: 'Disposição para buscar formação continuada e aplicar novos conhecimentos à prática docente.' },
];

/**
 * Competencias padrao para o segmento Corporativo.
 */
export const COMPETENCIAS_CORPORATIVO = [
  { cod_comp: 'CORP-01', nome: 'Liderança Estratégica', pilar: 'Liderança', cargo: 'Diretor',
    descricao: 'Capacidade de guiar a organização com visão de longo prazo, tomar decisões e desenvolver líderes.' },
  { cod_comp: 'CORP-02', nome: 'Liderança de Times', pilar: 'Liderança', cargo: 'Gerente',
    descricao: 'Habilidade de engajar, delegar e desenvolver equipes de alta performance.' },
  { cod_comp: 'CORP-03', nome: 'Comunicação Executiva', pilar: 'Comunicação', cargo: 'Diretor',
    descricao: 'Comunicar com clareza e impacto em reuniões de diretoria, apresentações e negociações.' },
  { cod_comp: 'CORP-04', nome: 'Comunicação Interpessoal', pilar: 'Comunicação', cargo: 'Analista',
    descricao: 'Habilidade de se expressar com clareza e escutar ativamente em diferentes contextos.' },
  { cod_comp: 'CORP-05', nome: 'Resolução de Problemas', pilar: 'Estratégia', cargo: 'Analista',
    descricao: 'Competência analítica para identificar causas-raiz e propor soluções eficazes e sustentáveis.' },
  { cod_comp: 'CORP-06', nome: 'Pensamento Estratégico', pilar: 'Estratégia', cargo: 'Gerente',
    descricao: 'Visão sistêmica para antecipar cenários, identificar oportunidades e alinhar ações aos objetivos.' },
  { cod_comp: 'CORP-07', nome: 'Gestão de Projetos', pilar: 'Gestão', cargo: 'Gerente',
    descricao: 'Capacidade de planejar, executar e controlar projetos dentro de escopo, prazo e orçamento.' },
  { cod_comp: 'CORP-08', nome: 'Inteligência Emocional', pilar: 'Cultura', cargo: 'Analista',
    descricao: 'Habilidade de reconhecer e gerenciar emoções próprias e dos outros para relações produtivas.' },
  { cod_comp: 'CORP-09', nome: 'Orientação a Resultados', pilar: 'Gestão', cargo: 'Gerente',
    descricao: 'Foco em metas e indicadores de desempenho com disciplina na execução e entrega.' },
  { cod_comp: 'CORP-10', nome: 'Inovação e Criatividade', pilar: 'Inovação', cargo: 'Analista',
    descricao: 'Disposição para questionar o status quo e propor soluções originais que agreguem valor.' },
  { cod_comp: 'CORP-11', nome: 'Colaboração e Trabalho em Equipe', pilar: 'Cultura', cargo: 'Analista',
    descricao: 'Capacidade de trabalhar de forma cooperativa, compartilhando conhecimentos e apoiando colegas.' },
  { cod_comp: 'CORP-12', nome: 'Gestão de Mudanças', pilar: 'Liderança', cargo: 'Diretor',
    descricao: 'Competência para conduzir processos de transformação organizacional com empatia e visão.' },
  { cod_comp: 'CORP-13', nome: 'Negociação e Influência', pilar: 'Comunicação', cargo: 'Consultor',
    descricao: 'Conduzir negociações complexas e influenciar stakeholders com argumentação estruturada.' },
  { cod_comp: 'CORP-14', nome: 'Tomada de Decisão sob Pressão', pilar: 'Estratégia', cargo: 'Gerente',
    descricao: 'Capacidade de decidir com agilidade e assertividade em cenários de incerteza e urgência.' },
  { cod_comp: 'CORP-15', nome: 'Foco no Cliente', pilar: 'Cultura', cargo: 'Consultor',
    descricao: 'Orientação para entender necessidades do cliente e entregar valor com excelência no atendimento.' },
];

/**
 * Cores associadas a cada pilar de competencia.
 */
export const PILAR_COLORS = {
  Gestão: '#0F2A4A',
  Liderança: '#00B4D8',
  Comunicação: '#0D9488',
  Inovação: '#F59E0B',
  Estratégia: '#6366F1',
  Cultura: '#EC4899',
};
