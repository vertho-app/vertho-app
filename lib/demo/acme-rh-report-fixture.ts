export type AcmeDemoDirectoryPerson = {
  key: string;
  nome_completo: string;
  email: string;
  cargo: string;
  role: 'colaborador' | 'gestor';
  area_depto: string;
  gestor_nome: string | null;
  gestor_email: string | null;
  d_natural: number;
  i_natural: number;
  s_natural: number;
  c_natural: number;
};

export const ACME_DEMO_TEAM_SIZE = 30;

const CARLA = { nome: 'Carla Menezes', email: 'carla.demo@vertho.ai' };
const MARCELO = { nome: 'Marcelo Duarte', email: 'marcelo.demo@vertho.ai' };
const JULIANA = { nome: 'Juliana Freitas', email: 'juliana.demo@vertho.ai' };
const EDUARDO = { nome: 'Eduardo Ramos', email: 'eduardo.demo@vertho.ai' };

/**
 * Pessoas sem acesso próprio, usadas somente para dar escala e coerência ao
 * tenant de apresentação. Somadas às seis personas navegáveis, formam uma
 * empresa de 30 participantes. Todos os contatos permanecem no domínio interno
 * e o tenant demo continua protegido contra disparos externos.
 */
export const ACME_DEMO_REPORT_DIRECTORY: AcmeDemoDirectoryPerson[] = [
  { key: 'lucas', nome_completo: 'Lucas Almeida', email: 'lucas.demo@vertho.ai', cargo: 'Representante Comercial', role: 'colaborador', area_depto: 'Comercial', gestor_nome: CARLA.nome, gestor_email: CARLA.email, d_natural: 62, i_natural: 70, s_natural: 30, c_natural: 38 },
  { key: 'camila', nome_completo: 'Camila Rocha', email: 'camila.demo@vertho.ai', cargo: 'Representante Comercial', role: 'colaborador', area_depto: 'Comercial', gestor_nome: CARLA.nome, gestor_email: CARLA.email, d_natural: 48, i_natural: 76, s_natural: 42, c_natural: 34 },
  { key: 'diego', nome_completo: 'Diego Santos', email: 'diego.demo@vertho.ai', cargo: 'Representante Comercial', role: 'colaborador', area_depto: 'Comercial', gestor_nome: CARLA.nome, gestor_email: CARLA.email, d_natural: 70, i_natural: 58, s_natural: 32, c_natural: 40 },
  { key: 'fernanda', nome_completo: 'Fernanda Ribeiro', email: 'fernanda.demo@vertho.ai', cargo: 'Representante Comercial', role: 'colaborador', area_depto: 'Comercial', gestor_nome: MARCELO.nome, gestor_email: MARCELO.email, d_natural: 42, i_natural: 71, s_natural: 53, c_natural: 34 },
  { key: 'joao', nome_completo: 'João Pedro Lima', email: 'joao.demo@vertho.ai', cargo: 'Representante Comercial', role: 'colaborador', area_depto: 'Comercial', gestor_nome: MARCELO.nome, gestor_email: MARCELO.email, d_natural: 66, i_natural: 64, s_natural: 28, c_natural: 42 },
  { key: 'patricia', nome_completo: 'Patrícia Nunes', email: 'patricia.demo@vertho.ai', cargo: 'Representante Comercial', role: 'colaborador', area_depto: 'Comercial', gestor_nome: MARCELO.nome, gestor_email: MARCELO.email, d_natural: 39, i_natural: 74, s_natural: 51, c_natural: 36 },
  { key: 'rafael', nome_completo: 'Rafael Moreira', email: 'rafael.demo@vertho.ai', cargo: 'Representante Comercial', role: 'colaborador', area_depto: 'Comercial', gestor_nome: CARLA.nome, gestor_email: CARLA.email, d_natural: 72, i_natural: 61, s_natural: 29, c_natural: 38 },
  { key: 'beatriz', nome_completo: 'Beatriz Campos', email: 'beatriz.demo@vertho.ai', cargo: 'Representante Comercial', role: 'colaborador', area_depto: 'Comercial', gestor_nome: MARCELO.nome, gestor_email: MARCELO.email, d_natural: 45, i_natural: 78, s_natural: 44, c_natural: 33 },
  { key: 'thiago', nome_completo: 'Thiago Azevedo', email: 'thiago.demo@vertho.ai', cargo: 'Representante Comercial', role: 'colaborador', area_depto: 'Comercial', gestor_nome: CARLA.nome, gestor_email: CARLA.email, d_natural: 64, i_natural: 67, s_natural: 31, c_natural: 38 },
  { key: 'marcelo', nome_completo: MARCELO.nome, email: MARCELO.email, cargo: 'Gerente Comercial', role: 'gestor', area_depto: 'Comercial', gestor_nome: null, gestor_email: null, d_natural: 20, i_natural: 80, s_natural: 55, c_natural: 45 },
  { key: 'juliana', nome_completo: JULIANA.nome, email: JULIANA.email, cargo: 'Analista Financeiro', role: 'gestor', area_depto: 'Financeiro', gestor_nome: null, gestor_email: null, d_natural: 42, i_natural: 31, s_natural: 57, c_natural: 70 },
  { key: 'eduardo', nome_completo: EDUARDO.nome, email: EDUARDO.email, cargo: 'Coordenador de Operações', role: 'gestor', area_depto: 'Operações', gestor_nome: null, gestor_email: null, d_natural: 68, i_natural: 36, s_natural: 54, c_natural: 42 },
  { key: 'aline', nome_completo: 'Aline Barros', email: 'aline.demo@vertho.ai', cargo: 'Analista Financeiro', role: 'colaborador', area_depto: 'Financeiro', gestor_nome: JULIANA.nome, gestor_email: JULIANA.email, d_natural: 25, i_natural: 30, s_natural: 63, c_natural: 82 },
  { key: 'gustavo', nome_completo: 'Gustavo Pires', email: 'gustavo.demo@vertho.ai', cargo: 'Analista Financeiro', role: 'colaborador', area_depto: 'Financeiro', gestor_nome: JULIANA.nome, gestor_email: JULIANA.email, d_natural: 32, i_natural: 28, s_natural: 61, c_natural: 79 },
  { key: 'isabela', nome_completo: 'Isabela Monteiro', email: 'isabela.demo@vertho.ai', cargo: 'Analista Financeiro', role: 'colaborador', area_depto: 'Financeiro', gestor_nome: JULIANA.nome, gestor_email: JULIANA.email, d_natural: 28, i_natural: 36, s_natural: 60, c_natural: 76 },
  { key: 'leandro', nome_completo: 'Leandro Castro', email: 'leandro.demo@vertho.ai', cargo: 'Analista Financeiro', role: 'colaborador', area_depto: 'Financeiro', gestor_nome: JULIANA.nome, gestor_email: JULIANA.email, d_natural: 55, i_natural: 60, s_natural: 40, c_natural: 45 },
  { key: 'natalia', nome_completo: 'Natália Braga', email: 'natalia.demo@vertho.ai', cargo: 'Analista Financeiro', role: 'colaborador', area_depto: 'Financeiro', gestor_nome: JULIANA.nome, gestor_email: JULIANA.email, d_natural: 65, i_natural: 45, s_natural: 65, c_natural: 25 },
  { key: 'debora', nome_completo: 'Débora Machado', email: 'debora.demo@vertho.ai', cargo: 'Coordenador de Operações', role: 'colaborador', area_depto: 'Operações', gestor_nome: EDUARDO.nome, gestor_email: EDUARDO.email, d_natural: 58, i_natural: 34, s_natural: 64, c_natural: 44 },
  { key: 'felipe', nome_completo: 'Felipe Cardoso', email: 'felipe.demo@vertho.ai', cargo: 'Coordenador de Operações', role: 'colaborador', area_depto: 'Operações', gestor_nome: EDUARDO.nome, gestor_email: EDUARDO.email, d_natural: 65, i_natural: 33, s_natural: 56, c_natural: 46 },
  { key: 'gabriela', nome_completo: 'Gabriela Neves', email: 'gabriela.demo@vertho.ai', cargo: 'Coordenador de Operações', role: 'colaborador', area_depto: 'Operações', gestor_nome: EDUARDO.nome, gestor_email: EDUARDO.email, d_natural: 49, i_natural: 39, s_natural: 68, c_natural: 44 },
  { key: 'henrique', nome_completo: 'Henrique Moraes', email: 'henrique.demo@vertho.ai', cargo: 'Coordenador de Operações', role: 'colaborador', area_depto: 'Operações', gestor_nome: EDUARDO.nome, gestor_email: EDUARDO.email, d_natural: 20, i_natural: 65, s_natural: 35, c_natural: 80 },
  { key: 'larissa', nome_completo: 'Larissa Teixeira', email: 'larissa.demo@vertho.ai', cargo: 'Coordenador de Operações', role: 'colaborador', area_depto: 'Operações', gestor_nome: EDUARDO.nome, gestor_email: EDUARDO.email, d_natural: 20, i_natural: 70, s_natural: 60, c_natural: 50 },
  { key: 'rodrigo', nome_completo: 'Rodrigo Farias', email: 'rodrigo.demo@vertho.ai', cargo: 'Coordenador de Operações', role: 'colaborador', area_depto: 'Operações', gestor_nome: EDUARDO.nome, gestor_email: EDUARDO.email, d_natural: 25, i_natural: 75, s_natural: 20, c_natural: 80 },
  { key: 'vanessa', nome_completo: 'Vanessa Silveira', email: 'vanessa.demo@vertho.ai', cargo: 'Coordenador de Operações', role: 'colaborador', area_depto: 'Operações', gestor_nome: EDUARDO.nome, gestor_email: EDUARDO.email, d_natural: 51, i_natural: 41, s_natural: 64, c_natural: 44 },
];

/**
 * Funil narrativo da ACME Demo. Os grupos são cumulativos: ninguém entra em
 * mapeamento sem perfil e ninguém entra em jornada sem concluir o Top 5.
 * Mantê-los como chaves estáveis deixa o reset e a aplicação operacional do
 * fixture produzirem exatamente a mesma fotografia.
 */
export const ACME_DEMO_FUNNEL_TARGETS = Object.freeze({
  people: ACME_DEMO_TEAM_SIZE,
  withProfile: 28,
  withMapping: 25,
  inJourney: 20,
  onTrack: 16,
  behind: 4,
  /**
   * Jornadas com o fechamento feito e Evolution Report gravado. É um SUBCONJUNTO
   * de `onTrack` (quem concluiu está em dia por definição), e não um estágio
   * paralelo: somar `concluded` com `onTrack` conta gente duas vezes.
   *
   * Existe desde 01/09/2026 porque a prova de evolução só nasce no fechamento,
   * e sem nenhuma jornada concluída a demo mostrava a mesma tela vazia que a
   * produção. As 4 restantes ficam em andamento de propósito: um painel em que
   * 100% concluiu não deixa ver o recorte "quem ainda está no meio".
   */
  concluded: 15,
});

export const ACME_DEMO_WITHOUT_PROFILE_KEYS = ['ana', 'vanessa'] as const;

export const ACME_DEMO_SYNTHETIC_MAPPED_KEYS = ACME_DEMO_REPORT_DIRECTORY
  .filter((person) => person.key !== 'vanessa')
  .map((person) => person.key);

export const ACME_DEMO_MAPPED_KEYS = [
  'bruna',
  'mariana',
  ...ACME_DEMO_SYNTHETIC_MAPPED_KEYS,
];

export const ACME_DEMO_JOURNEY_KEYS = ACME_DEMO_MAPPED_KEYS.slice(
  0,
  ACME_DEMO_FUNNEL_TARGETS.inJourney,
);

/**
 * Quem está atrasado na jornada.
 *
 * Os três primeiros são os DOIS gestores e uma pessoa de operações, e a escolha
 * não é decorativa: eles são os únicos do cargo deles entre quem entrou em
 * jornada, então deixá-los concluir produziria competências medidas com UMA
 * pessoa só no painel de evolução — uma média de n=1 apresentada ao lado de
 * médias de n=9, com o mesmo peso visual. Gestor atrasado também é a versão
 * mais crível da história: quem lidera é quem mais perde a cadência.
 *
 * **Rafael entrou em 04/09/2026** por um motivo diferente: o card "Ação esta
 * semana" da home do gestor mostra quem PAROU, e nenhum dos três anteriores é
 * liderado da Carla — a persona pela qual a demo abre a visão de gestor. O card
 * ficava permanentemente vazio numa tela cujo propósito é dar ao gestor o que
 * fazer nesta semana. Ele é do time dela e é quem o painel de evolução já
 * descreve como "precisa transformar intenção em ação observável", então o
 * atraso confirma o texto ao lado em vez de contradizê-lo. Há outros quatro
 * Representantes Comerciais entre os concluídos, então a média do cargo não
 * cai para n=1.
 */
export const ACME_DEMO_BEHIND_KEYS = ['marcelo', 'eduardo', 'debora', 'rafael'];

/**
 * A persona navegável do participante. A jornada EM ANDAMENTO dela é o roteiro
 * da apresentação (`DEMO_ACCESS_PERSONAS` entra como "Participante" e cai na
 * semana 1), então ela fica fora das concluídas: marcá-la como concluída
 * silenciaria a demo da experiência do colaborador para ganhar mais uma linha
 * num painel que já tem dezesseis.
 */
export const ACME_DEMO_JOURNEY_SHOWCASE_KEY = 'bruna';

/**
 * Quem concluiu a temporada e tem Evolution Report: todo mundo em jornada,
 * menos a persona de vitrine e as três atrasadas. Uma pessoa atrasada e
 * concluída ao mesmo tempo é a contradição mais fácil de produzir aqui e a que
 * mais estraga a apresentação, então a exclusão é explícita e não posicional.
 * O total precisa bater com `ACME_DEMO_FUNNEL_TARGETS.concluded` (guard no
 * teste da régua da demo).
 */
export const ACME_DEMO_CONCLUDED_KEYS = ACME_DEMO_JOURNEY_KEYS.filter(
  (key) => key !== ACME_DEMO_JOURNEY_SHOWCASE_KEY && !ACME_DEMO_BEHIND_KEYS.includes(key),
);

const COMPETENCIAS_POR_CARGO: Record<string, string[]> = {
  'Representante Comercial': [
    'Comunicação e Apresentação de Valor',
    'Negociação e Fechamento',
    'Relacionamento e Pós-venda',
    'Resiliência e Constância',
    'Orientação a Metas e Resultados',
  ],
  'Gerente Comercial': [
    'Coaching e Desenvolvimento de Vendedores',
    'Inteligência de Mercado e Visão Competitiva',
    'Negociação Estratégica e Suporte a Deals',
    'Planejamento Comercial, Priorização e Execução de Estratégia',
    'Gestão de Performance, Indicadores e Accountability',
  ],
  'Analista Financeiro': [
    'Controle, Precisão e Confiabilidade dos Dados',
    'Análise de Indicadores Financeiros',
    'Organização de Rotinas e Prazos',
    'Comunicação Financeira para Não Especialistas',
    'Critério e Ética no Tratamento de Informações',
  ],
  'Coordenador de Operações': [
    'Priorização e Gestão da Rotina Operacional',
    'Resolução de Problemas e Gargalos',
    'Liderança de Equipe e Alinhamento Diário',
    'Melhoria Contínua de Processos',
    'Comunicação entre Áreas',
  ],
};

export function competenciasAcmeDemoPorCargo(cargo: string): string[] {
  return COMPETENCIAS_POR_CARGO[cargo] || [];
}

function seedOf(value: string): number {
  return [...value].reduce((total, char) => total + char.charCodeAt(0), 0);
}

export function avaliacaoAcmeDemo(email: string, competencia: string) {
  const seed = seedOf(`${email}:${competencia}`);
  const nivel = 1 + (seed % 4);
  const nota = Number(Math.min(4, nivel + ((seed % 7) / 10)).toFixed(1));
  return {
    nivel,
    nota,
    pontosFortes: ['Organiza os fatos antes de decidir', 'Mantém clareza na comunicação com as áreas envolvidas'],
    pontosAtencao: ['Transformar a intenção em uma ação observável com prazo e responsável'],
    feedback: `A resposta demonstra repertório em ${competencia}, com espaço para tornar a execução mais explícita e mensurável no dia a dia.`,
  };
}

export function criarPdiAcmeDemo(person: { nome_completo: string; email: string; cargo: string; area_depto?: string | null }) {
  const competenciasCargo = competenciasAcmeDemoPorCargo(person.cargo);
  const seed = seedOf(person.email);
  const prioridades = [
    competenciasCargo[seed % Math.max(1, competenciasCargo.length)],
    competenciasCargo[(seed + 2) % Math.max(1, competenciasCargo.length)],
  ].filter((value, index, list): value is string => Boolean(value) && list.indexOf(value) === index);
  const resultados = competenciasCargo.map((competencia) => ({ competencia, ...avaliacaoAcmeDemo(person.email, competencia) }));
  const competencias = prioridades.map((nome) => {
    const avaliacao = resultados.find((item) => item.competencia === nome)!;
    return {
      nome,
      nivel_atual: avaliacao.nivel,
      flag: avaliacao.nivel <= 1,
      descritores_desenvolvimento: ['Explicita a decisão, os critérios utilizados e o próximo passo combinado'],
      fez_bem: avaliacao.pontosFortes,
      melhorar: avaliacao.pontosAtencao,
      feedback: avaliacao.feedback,
      sprint: {
        foco_30_dias: `Tornar ${nome.toLowerCase()} uma prática visível e consistente nas decisões da rotina.`,
        acao_principal: 'Aplicar a competência em uma situação real por semana e registrar decisão, ação e resultado.',
        acao_apoio: 'Pedir ao gestor um feedback curto sobre clareza, impacto e próximo passo.',
        evidencia_esperada: 'Quatro registros objetivos com contexto, ação adotada, indicador observado e aprendizado.',
        ritual: 'Revisão de 15 minutos na conversa semanal de desenvolvimento.',
        checklist: ['Escolher uma situação real', 'Definir a ação observável', 'Registrar o resultado', 'Ajustar a próxima tentativa'],
      },
      dicas_desenvolvimento: ['Comece por uma situação de baixa complexidade e aumente o desafio a cada semana.'],
      estudo_recomendado: ['Microconteúdos da jornada Vertho ligados ao foco do ciclo.'],
    };
  });

  return {
    demo_fixture: true,
    acolhimento: `${person.nome_completo.split(' ')[0]}, este plano traduz seu diagnóstico em dois focos práticos para as próximas semanas.`,
    perfil_comportamental: {
      descricao: `Seu estilo combina atenção ao contexto com orientação para entrega. No ambiente de ${person.area_depto || 'sua área'}, isso favorece decisões consistentes quando há clareza de prioridade e critério.`,
      pontos_forca: ['Leitura cuidadosa do contexto', 'Compromisso com acordos e entregas'],
      pontos_atencao: ['Comunicar riscos e escolhas mais cedo', 'Converter análise em próximos passos verificáveis'],
    },
    resumo_desempenho: resultados.map((item) => ({ competencia: item.competencia, nivel: item.nivel })),
    competencias,
    trilha_cursos: prioridades.map((competencia) => ({ nome: `Prática aplicada de ${competencia}`, competencia })),
    total_semanas: 14,
    mensagem_final: 'O desenvolvimento acontece na rotina: pratique, registre a evidência e use a conversa com a liderança para ajustar o próximo passo.',
  };
}

export function criarRelatorioGestorAcmeDemo(
  manager: { nome_completo: string; area_depto?: string | null; cargo: string },
  team: Array<{ nome_completo: string; email: string; cargo: string }>,
) {
  const pessoas = team.length > 0 ? team : [{ nome_completo: 'Equipe demonstrativa', email: 'equipe@vertho.ai', cargo: manager.cargo }];
  const destaque = pessoas[0];
  const atencao = pessoas[Math.min(1, pessoas.length - 1)];
  const competencia = competenciasAcmeDemoPorCargo(atencao.cargo)[0] || 'Comunicação e alinhamento';

  return {
    demo_fixture: true,
    resumo_executivo: {
      leitura_geral: `A equipe de ${manager.area_depto || 'gestão'} apresenta boa capacidade de execução e responde melhor quando prioridades, critérios e acordos ficam visíveis. O principal ganho do próximo ciclo virá da consistência das conversas de desenvolvimento.`,
      principal_avanco: `${destaque.nome_completo} demonstra evolução na transformação de feedback em ações objetivas.`,
      principal_ponto_de_atencao: `A equipe ainda varia na qualidade dos registros de decisão e no acompanhamento dos combinados.`,
    },
    destaques_evolucao: [{ nome: destaque.nome_completo, competencia, nivel: 3, motivo_destaque: 'Aplicou o feedback em uma situação real e trouxe evidência do resultado.' }],
    ranking_atencao: [{ nome: atencao.nome_completo, competencia, nivel: 1, urgencia: 'IMPORTANTE', motivo: 'Precisa transformar intenção em ação observável e acompanhada.', risco_se_nao_agir: 'Perda de previsibilidade e repetição dos mesmos gargalos.' }],
    analise_por_competencia: [
      { competencia, media_nivel: 2.4, distribuicao: { n1: 1, n2: 2, n3: 3, n4: 1 }, padrao_observado: 'A equipe reconhece o comportamento esperado, mas ainda oscila sob pressão.', acao_gestor: 'Usar uma situação real por semana para praticar decisão, comunicação e registro.', impacto_se_nao_agir: 'A aprendizagem fica conceitual e não altera a rotina.' },
      { competencia: 'Responsabilidade sobre acordos', media_nivel: 3.1, distribuicao: { n1: 0, n2: 1, n3: 4, n4: 2 }, padrao_observado: 'Os combinados são cumpridos quando há definição clara de dono e prazo.', acao_gestor: 'Manter o fechamento das reuniões com responsável, prazo e evidência esperada.' },
    ],
    perfil_disc_equipe: {
      descricao: 'O grupo combina ritmo de execução com necessidade de clareza e estrutura. A liderança ganha tração quando antecipa prioridades e reduz ambiguidades.',
      forca_coletiva: 'Capacidade de mobilizar rapidamente diante de metas concretas.',
      risco_coletivo: 'Acelerar a ação antes de alinhar critérios e dependências entre áreas.',
    },
    acoes: {
      acao_principal: 'Escolher um comportamento prioritário e acompanhá-lo em todas as conversas individuais nas próximas duas semanas.',
      esta_semana: ['Compartilhar o foco da equipe e combinar uma evidência simples para cada pessoa.', 'Reconhecer uma aplicação concreta do comportamento esperado.'],
      proximas_semanas: ['Revisar os registros nas conversas individuais.', 'Comparar evolução, bloqueios e apoio necessário.'],
      medio_prazo: ['Consolidar o padrão que funcionou e ajustar a próxima competência do ciclo.'],
    },
    papel_do_gestor: {
      semanal: 'Fazer uma pergunta de evidência e registrar o próximo passo de cada pessoa.',
      quinzenal: 'Calibrar evolução, reconhecer avanços e remover um bloqueio recorrente.',
      proximo_ciclo: 'Escolher o novo foco com base na evidência, não apenas na percepção.',
    },
    mensagem_final: 'O relatório organiza a conversa; a mudança acontece na frequência e na qualidade do acompanhamento.',
  };
}

export function criarRelatorioRhAcmeDemo() {
  return {
    demo_fixture: true,
    resumo_executivo: {
      leitura_geral: 'A ACME Demo apresenta boa adesão ao ciclo de desenvolvimento e uma base consistente de execução. A oportunidade central está em elevar a qualidade das conversas de acompanhamento e transformar competências em evidências comparáveis entre áreas.',
      principal_forca_organizacional: 'Lideranças e equipes reconhecem prioridades e respondem bem a metas concretas.',
      principal_risco_organizacional: 'A qualidade do desenvolvimento ainda depende demais da disciplina individual de cada gestor.',
    },
    indicadores: {
      total_avaliados: ACME_DEMO_TEAM_SIZE,
      total_avaliacoes: ACME_DEMO_TEAM_SIZE * 5,
      media_geral: 2.7,
      pct_nivel_1: 12,
      pct_nivel_2: 31,
      pct_nivel_3: 39,
      pct_nivel_4: 18,
    },
    comparativo_f1_f3: {
      analise: 'As equipes com conversas semanais estruturadas avançaram mais rápido do que aquelas com acompanhamento apenas mensal.',
      destaque_positivo: 'Comercial e Operações aumentaram a clareza dos próximos passos e a qualidade dos registros.',
      destaque_atencao: 'Financeiro precisa de mais espaço para praticar comunicação de risco e negociação de prioridades.',
    },
    visao_por_cargo: [
      { cargo: 'Representante Comercial', media_nivel: 2.6, leitura: 'Boa orientação a resultado, com oportunidade de ampliar a qualidade da negociação de valor.', principais_forcas: ['Relacionamento com clientes'], principais_riscos: ['Concessões precoces sob pressão'] },
      { cargo: 'Gerente Comercial', media_nivel: 2.9, leitura: 'Lideranças próximas do time e com espaço para tornar o coaching mais sistemático.', principais_forcas: ['Mobilização para metas'], principais_riscos: ['Baixa consistência nos registros de desenvolvimento'] },
      { cargo: 'Analista Financeiro', media_nivel: 2.8, leitura: 'Base técnica confiável e oportunidade de antecipar a comunicação de riscos.', principais_forcas: ['Precisão e responsabilidade'], principais_riscos: ['Escalada tardia de dependências'] },
      { cargo: 'Coordenador de Operações', media_nivel: 2.7, leitura: 'Boa resposta a urgências, com necessidade de preservar prioridade e aprendizagem após a resolução.', principais_forcas: ['Execução e solução de problemas'], principais_riscos: ['Recorrência de gargalos'] },
    ],
    competencia_foco_por_cargo: [
      { cargo: 'Representante Comercial', competencia_recomendada: 'Negociação e Fechamento', horizonte_sugerido: 'próximo ciclo', justificativa: 'É o maior ponto de alavancagem para receita com margem e previsibilidade.', expectativa_impacto: 'Melhor conversão sem ampliar descontos.' },
      { cargo: 'Analista Financeiro', competencia_recomendada: 'Comunicação Financeira para Não Especialistas', horizonte_sugerido: '60 dias', justificativa: 'Aumenta a qualidade da decisão das áreas clientes.', expectativa_impacto: 'Riscos sinalizados mais cedo e menos retrabalho.' },
      { cargo: 'Coordenador de Operações', competencia_recomendada: 'Priorização e Gestão da Rotina Operacional', horizonte_sugerido: '30 dias', justificativa: 'Reduz urgências simultâneas e dá clareza ao time.', expectativa_impacto: 'Mais previsibilidade e menor recorrência de gargalos.' },
    ],
    competencias_criticas: [
      { competencia: 'Negociação e Fechamento', criticidade: 'ATENCAO', justificativa: 'Há repertório comercial, mas concessões ainda aparecem antes da exploração completa de valor.', impacto_organizacional: 'Pressão sobre margem e previsibilidade do forecast.' },
      { competencia: 'Priorização e Gestão da Rotina Operacional', criticidade: 'ATENCAO', justificativa: 'Mudanças de prioridade ainda consomem capacidade e reduzem a aprendizagem após incidentes.', impacto_organizacional: 'Retrabalho e menor estabilidade operacional.' },
    ],
    treinamentos_sugeridos: [
      { competencia: 'Negociação e Fechamento', titulo: 'Negociação de valor sob pressão', prioridade: 'IMPORTANTE', publico: 'Comercial', formato: 'Jornada prática', carga_horaria: '6 horas distribuídas', custo: 'Incluído no programa', justificativa: 'Conecta repertório, prática e feedback em situações reais.' },
      { competencia: 'Priorização e Gestão da Rotina Operacional', titulo: 'Prioridade visível e gestão de gargalos', prioridade: 'IMPORTANTE', publico: 'Operações', formato: 'Laboratório com casos', carga_horaria: '4 horas distribuídas', custo: 'Incluído no programa', justificativa: 'Cria critérios compartilhados para decisões sob pressão.' },
    ],
    perfil_disc_organizacional: {
      descricao: 'A organização combina orientação a resultado com atenção a processo. O melhor desempenho aparece quando velocidade e critério são tratados como complementares.',
      forca_coletiva: 'Capacidade de mobilização e compromisso com entrega.',
      risco_coletivo: 'Resolver a urgência sem registrar o aprendizado e prevenir recorrência.',
    },
    decisoes_chave: [
      { colaborador: 'Bruna Costa', situacao: 'Evolução consistente na leitura do contexto e na disciplina de preparação.', acao: 'Convidar para compartilhar o método de preparação com o time comercial.', criterio_reavaliacao: 'Aplicação por pelo menos três colegas no próximo ciclo.' },
      { colaborador: 'Mariana Lopes', situacao: 'Referência positiva em precisão e responsabilidade sobre dados.', acao: 'Usar como multiplicadora em uma prática de comunicação de risco para áreas não financeiras.', criterio_reavaliacao: 'Feedback das áreas clientes e redução de retrabalho.' },
    ],
    plano_acao: {
      curto_prazo: ['Alinhar uma competência foco por área e uma evidência simples para o próximo ciclo.', 'Garantir conversa quinzenal de desenvolvimento para todas as 30 pessoas.'],
      medio_prazo: ['Calibrar critérios entre gestores e revisar os dados por cargo.', 'Reconhecer publicamente aplicações concretas dos comportamentos esperados.'],
      longo_prazo: ['Comparar evolução por competência e decidir a próxima onda de desenvolvimento com base nas evidências.'],
    },
    mensagem_final: 'O próximo ganho não depende de aumentar o volume de iniciativas, e sim de dar cadência, evidência e qualidade às conversas que já existem.',
  };
}
