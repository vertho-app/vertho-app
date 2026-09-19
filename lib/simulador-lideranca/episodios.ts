/**
 * Somente o briefing público pode ser importado pelo cliente.
 *
 * Cada encontro avalia a competência em FOCO e duas SECUNDÁRIAS, escolhidas pelo
 * que o dossiê daquele encontro provoca (18/09/2026). Até então o avaliador recebia
 * os 30 descritores a cada encontro e a devolutiva mostrava quatro competências
 * "Não observado" ao redor do foco. A distribuição é equilibrada de propósito: cada
 * competência é avaliada em exatamente 3 dos 5 encontros, o que dá à síntese da
 * jornada evidência de mais de uma situação para todas elas.
 * Competências por NOME: as duas variantes da matriz (LD0x e FL0x) têm os mesmos nomes.
 */
export const EPISODIOS = [
  {
    titulo: 'Antes de concluir',
    verbo: 'Diagnosticar',
    competencia: 'LD01',
    nome: 'Análise e Diagnóstico de Situações',
    secundarias: ['Comunicação e Conversas de Liderança', 'Priorização e Tomada de Decisão'],
    momento: 'Primeiro encontro',
    personagem: 'Ana',
    papel: 'Integrante experiente da equipe',
    objetivo:
      'Entenda por que as entregas estão atrasando e valide suas hipóteses com Ana.',
  },
  {
    titulo: 'Espaço para crescer',
    verbo: 'Desenvolver',
    competencia: 'LD02',
    nome: 'Desenvolvimento de Pessoas',
    secundarias: ['Comunicação e Conversas de Liderança', 'Priorização e Tomada de Decisão'],
    momento: 'Dois dias depois',
    personagem: 'Bruno',
    papel: 'Integrante em desenvolvimento',
    objetivo:
      'Delegue uma responsabilidade a Bruno e combine autonomia, apoio e acompanhamento.',
  },
  {
    titulo: 'A conversa necessária',
    verbo: 'Conversar',
    competencia: 'LD03',
    nome: 'Comunicação e Conversas de Liderança',
    secundarias: ['Desenvolvimento de Pessoas', 'Autoconsciência e Aprendizagem Contínua'],
    momento: 'Uma semana depois',
    personagem: 'Camila',
    papel: 'Referência técnica da equipe',
    objetivo:
      'Converse sobre um conflito na equipe e construa acordos verificáveis.',
  },
  {
    titulo: 'Nem tudo cabe',
    verbo: 'Decidir',
    competencia: 'LD04',
    nome: 'Priorização e Tomada de Decisão',
    secundarias: ['Análise e Diagnóstico de Situações', 'Autoconsciência e Aprendizagem Contínua'],
    momento: 'No dia seguinte',
    personagem: 'Rafa',
    papel: 'Responsável pelas demandas da área',
    objetivo:
      'Negocie prioridades diante de uma demanda urgente e explicite escolhas e consequências.',
  },
  {
    titulo: 'O que você muda',
    verbo: 'Aprender',
    competencia: 'LD05',
    nome: 'Autoconsciência e Aprendizagem Contínua',
    secundarias: ['Análise e Diagnóstico de Situações', 'Desenvolvimento de Pessoas'],
    momento: 'Duas semanas depois',
    personagem: 'Ana',
    papel: 'Porta-voz do feedback da equipe',
    objetivo:
      'Ouça como sua liderança foi percebida e coloque um ajuste em prática durante a conversa.',
  },
] as const;
export const CONTEXTO =
  'Você assume a liderança da equipe Horizonte, responsável por entregas internas de uma organização fictícia. Ana, Bruno e Camila trabalham com você; Rafa negocia as demandas da área. Há atrasos, expectativas diferentes e pouco tempo disponível. Você pode combinar o trabalho da equipe e negociar prioridades, mas não contratar pessoas nem prometer recursos sem aprovação.';
