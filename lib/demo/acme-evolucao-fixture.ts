/**
 * Evolução da ACME Demo — T0 (mapeamento) → T1 (fechamento da semana 14).
 *
 * POR QUE ESTE ARQUIVO EXISTE (01/09/2026): a prova de evolução do produto
 * nasce no fechamento da temporada, e em produção isso existia em **1 de 106
 * trilhas** (a única, de um piloto de 2 semanas). O painel do gestor e a tela
 * de evolução liam essa fonte e mostravam o vazio para todo mundo, então não
 * havia como demonstrar ao cliente o que ele recebe no fim da jornada. Este
 * fixture preenche a ACME Demo com jornadas concluídas, e só a ACME Demo.
 *
 * TRÊS REGRAS QUE ESTE ARQUIVO SEGUE, E O MOTIVO DE CADA UMA:
 *
 * 1. **A classificação vem da função de produção**, `classificarConvergencia`.
 *    O veredito não é escolhido, é DERIVADO das notas — se alguém recalibrar os
 *    cortes da régua, a demo se move junto. Fixture que carimba o rótulo à mão
 *    é fixture que passa a mentir no dia em que a régua muda, e ninguém percebe
 *    porque a tela continua bonita.
 *
 * 2. **A nota de partida é a MESMA linha que o mapeamento gravou.** O T0 do
 *    relatório de evolução e o T0 da tela de diagnóstico saem do mesmo gerador
 *    (`notaDePartida`), então as duas telas da demo não se contradizem. Numa
 *    apresentação, duas telas discordando sobre a mesma pessoa custa mais caro
 *    que a tela vazia.
 *
 * 3. **A forma é a que o motor grava**, campo a campo, incluindo os que hoje
 *    nenhuma tela lê (`antes`, `depois`, `justificativa_cenario`). Fixture na
 *    forma canônica em vez da forma REAL é a classe de erro que já mordeu esta
 *    base: o instrumento aprova, e a entrada de verdade quebra.
 *
 * A demo não tem regressão por decisão do dono (01/09/2026): o mix é evolução
 * confirmada, parcial e **estável**. Estável é o caso honesto que sustenta a
 * conversa comercial ("a plataforma também diz quem NÃO evoluiu") sem colocar
 * uma pessoa fictícia em situação de exposição negativa numa tela de vendas.
 */

import { classificarConvergencia, type Convergencia } from '@/lib/season-engine/convergencia';
import { competenciasAcmeDemoPorCargo } from './acme-rh-report-fixture';

/**
 * Os descritores da régua da ACME Demo, na grafia exata de `competencias.nome_curto`
 * do tenant. Escrever qualquer outra coisa aqui produz um relatório de evolução
 * que fala de um descritor que o mapeamento da pessoa não tem — e o casamento
 * entre as duas pontas é por NOME, não por id.
 */
export const ACME_DEMO_DESCRITORES = [
  'Leitura do contexto e identificação do problema',
  'Critério de priorização e tomada de decisão',
  'Execução com método e acompanhamento',
  'Comunicação com stakeholders',
  'Colaboração e negociação de dependências',
  'Aprendizado, ética e melhoria contínua',
] as const;

/** Quantos descritores a trilha de vitrine trabalha. */
export const ACME_DEMO_DESCRITORES_POR_TRILHA = 4;

/**
 * Perfil de resultado de cada jornada concluída. A ordem é estável e o reset
 * distribui na ordem das chaves concluídas, então a fotografia da demo é a
 * mesma em toda execução.
 */
export type PerfilEvolucao = 'confirmada' | 'parcial' | 'estavel';

export const ACME_DEMO_EVOLUTION_MIX: readonly PerfilEvolucao[] = [
  'confirmada', 'confirmada', 'parcial', 'confirmada',
  'estavel', 'confirmada', 'confirmada', 'parcial',
  'confirmada', 'estavel', 'confirmada', 'parcial',
  'confirmada', 'confirmada', 'estavel', 'parcial',
] as const;

/** 9 confirmadas, 4 parciais, 3 estáveis. Conferido pelo teste da régua da demo. */
export const ACME_DEMO_EVOLUTION_TARGETS = Object.freeze({
  concluded: 16,
  confirmadas: 9,
  parciais: 4,
  estaveis: 3,
  regressoes: 0,
});

function seedOf(value: string): number {
  return [...value].reduce((total, char) => total + char.charCodeAt(0), 0);
}

function arredondar(valor: number): number {
  return Number(Math.max(1, Math.min(4, valor)).toFixed(1));
}

/**
 * Nota de partida (T0) de um descritor. Determinística por (email, descritor) e
 * deliberadamente baixa: a trilha seleciona lacuna, então um T0 alto tornaria a
 * evolução impossível de mostrar sem estourar o teto da escala.
 */
export function notaDePartida(email: string, descritor: string): number {
  const seed = seedOf(`${email}:${descritor}`);
  return arredondar(1.5 + ((seed % 7) / 10));
}

/**
 * Ganho aplicado no fechamento. Os intervalos são escolhidos para cair com
 * folga de cada lado dos cortes da régua (0,5 e 0,2), e não em cima deles: uma
 * demo cujo veredito depende do arredondamento é uma demo que muda de resultado
 * quando alguém ajustar a régua em um centésimo.
 */
function ganhoDoPerfil(perfil: PerfilEvolucao, seed: number): number {
  if (perfil === 'confirmada') return 0.7 + ((seed % 4) / 10);
  if (perfil === 'parcial') return 0.25 + ((seed % 3) / 20);
  return ((seed % 3) - 1) / 20;
}

/**
 * Leitura qualitativa da semana 13. Só o perfil "confirmada" percebe avanço
 * acima da nota de partida — é o que a régua exige para promover de parcial a
 * confirmada, e é o que separa "o número subiu" de "a pessoa e o entorno viram
 * a mudança acontecer".
 */
function nivelPercebido(perfil: PerfilEvolucao, notaPre: number, notaPos: number): number | null {
  if (perfil === 'confirmada') return arredondar(Math.max(notaPre + 0.5, notaPos - 0.2));
  if (perfil === 'parcial') return arredondar(notaPre);
  return null;
}

const ANTES_POR_DESCRITOR: Record<string, string> = {
  'Leitura do contexto e identificação do problema': 'Eu partia direto para a solução. Quando o problema voltava, era porque eu tinha resolvido o sintoma.',
  'Critério de priorização e tomada de decisão': 'Priorizava pelo que gritava mais alto no dia. Quase sempre o urgente comia o importante.',
  'Execução com método e acompanhamento': 'Combinava as ações na reunião e não voltava para verificar. O acompanhamento ficava na memória.',
  'Comunicação com stakeholders': 'Comunicava o resultado, não o caminho. As pessoas ficavam sabendo tarde e reagiam tarde.',
  'Colaboração e negociação de dependências': 'Quando dependia de outra área, eu esperava. Só cobrava quando o prazo já estava perdido.',
  'Aprendizado, ética e melhoria contínua': 'Tratava erro como algo a ser explicado, não como material de aprendizado do time.',
};

const DEPOIS_POR_DESCRITOR: Record<string, string> = {
  'Leitura do contexto e identificação do problema': 'Passei a levantar o contexto antes de propor. Na última vez, o problema real era outro, e teria custado duas semanas.',
  'Critério de priorização e tomada de decisão': 'Comecei a escrever o critério antes de decidir. Quando alguém discorda, a conversa é sobre o critério, não sobre a pessoa.',
  'Execução com método e acompanhamento': 'Toda combinação agora sai com responsável, prazo e o momento em que eu volto. É a parte que mais mudou.',
  'Comunicação com stakeholders': 'Passei a antecipar o que ainda não está resolvido. Recebi menos cobrança e mais ajuda.',
  'Colaboração e negociação de dependências': 'Negocio a dependência no início, com data acordada. Deixei de descobrir o atraso pelo resultado.',
  'Aprendizado, ética e melhoria contínua': 'Levei um erro meu para a reunião de equipe. Duas pessoas trouxeram o mesmo caso depois.',
};

const LIMITE_ESTAVEL: Record<string, string> = {
  'Leitura do contexto e identificação do problema': 'O levantamento de contexto aconteceu, mas a partir de uma única fonte. A leitura ainda não cruza informação de quem opera.',
  'Critério de priorização e tomada de decisão': 'O critério foi verbalizado no momento da decisão, sem registro. Fora daquela conversa, ninguém consegue reconstruir por que aquilo veio primeiro.',
  'Execução com método e acompanhamento': 'As ações têm responsável e prazo, mas o retorno ainda depende de alguém lembrar de cobrar.',
  'Comunicação com stakeholders': 'A comunicação melhorou no tom, não na antecedência. O aviso continua chegando junto com o fato.',
  'Colaboração e negociação de dependências': 'A dependência foi mapeada, mas não houve acordo de data com a outra área.',
  'Aprendizado, ética e melhoria contínua': 'O aprendizado ficou individual. Não chegou a virar prática compartilhada com o time.',
};

const JUSTIFICATIVA_POR_PERFIL: Record<PerfilEvolucao, string> = {
  confirmada: 'No cenário de fechamento, aplicou o comportamento sem ser induzido pela pergunta, e sustentou a escolha quando o cenário apresentou uma restrição nova.',
  parcial: 'Aplicou o comportamento no cenário de fechamento, mas apoiado na estrutura oferecida pela pergunta. Ainda não aparece de forma espontânea.',
  estavel: 'Reconheceu o que deveria ser feito e descreveu o caminho, sem apresentar uma situação real em que isso já tenha acontecido.',
};

export type DescritorEvolucao = {
  competencia: string;
  descritor: string;
  nota_pre: number;
  nota_pos: number;
  nivel_percebido: number | null;
  antes: string | null;
  depois: string | null;
  justificativa_cenario: string;
  convergencia: Convergencia;
};

export type EvolucaoDemo = {
  competencia: string;
  descritores: DescritorEvolucao[];
  /** Na forma exata de `trilhas.evolution_report` do modo regular. */
  evolution_report: {
    descritores: DescritorEvolucao[];
    insight_geral: string;
    proximo_passo: string;
    resumo_avaliacao: string;
    nota_media_pos: number;
    resumo: { confirmadas: number; parciais: number; estagnacoes: number; regressoes: number };
    demo_fixture: true;
  };
};

/**
 * Monta a evolução de uma pessoa. `perfil` decide a magnitude do ganho; o
 * VEREDITO continua saindo da régua de produção, aplicada sobre as notas.
 */
export function construirEvolucaoAcmeDemo(
  pessoa: { email: string; nome_completo: string; cargo: string },
  perfil: PerfilEvolucao,
): EvolucaoDemo {
  const competencia = competenciasAcmeDemoPorCargo(pessoa.cargo)[0];
  if (!competencia) {
    throw new Error(`cargo sem competência na régua da ACME Demo: ${pessoa.cargo}`);
  }

  const descritores: DescritorEvolucao[] = ACME_DEMO_DESCRITORES
    .slice(0, ACME_DEMO_DESCRITORES_POR_TRILHA)
    .map((descritor) => {
      const seed = seedOf(`${pessoa.email}:${descritor}:${perfil}`);
      const nota_pre = notaDePartida(pessoa.email, descritor);
      const nota_pos = arredondar(nota_pre + ganhoDoPerfil(perfil, seed));
      const nivel_percebido = nivelPercebido(perfil, nota_pre, nota_pos);
      return {
        competencia,
        descritor,
        nota_pre,
        nota_pos,
        nivel_percebido,
        antes: perfil === 'estavel' ? null : ANTES_POR_DESCRITOR[descritor] || null,
        depois: perfil === 'estavel'
          ? LIMITE_ESTAVEL[descritor] || null
          : DEPOIS_POR_DESCRITOR[descritor] || null,
        justificativa_cenario: JUSTIFICATIVA_POR_PERFIL[perfil],
        // A régua de produção decide. Nunca carimbar o veredito à mão aqui.
        convergencia: classificarConvergencia({ nota_pre, nota_pos, nivel_percebido }),
      };
    });

  const notaMediaPos = Number(
    (descritores.reduce((total, d) => total + d.nota_pos, 0) / descritores.length).toFixed(2),
  );
  const primeiroNome = pessoa.nome_completo.split(' ')[0];
  const maiorAvanco = [...descritores].sort((a, b) => (b.nota_pos - b.nota_pre) - (a.nota_pos - a.nota_pre))[0];
  const menorAvanco = [...descritores].sort((a, b) => (a.nota_pos - a.nota_pre) - (b.nota_pos - b.nota_pre))[0];

  const resumoPorPerfil: Record<PerfilEvolucao, string> = {
    confirmada: `${primeiroNome} sustentou no cenário de fechamento o que vinha praticando durante a jornada. O avanço mais claro está em ${maiorAvanco.descritor.toLowerCase()}, e apareceu tanto na avaliação quanto no relato da própria pessoa.`,
    parcial: `${primeiroNome} avançou em ${maiorAvanco.descritor.toLowerCase()}, com o comportamento ainda apoiado na estrutura da conversa. O próximo ciclo precisa verificar se ele aparece sem ajuda.`,
    estavel: `${primeiroNome} manteve o patamar de partida. Reconhece o que precisa mudar e descreve o caminho, mas o fechamento não trouxe uma situação real em que isso já tenha acontecido. ${menorAvanco.descritor} é onde a lacuna segue mais visível.`,
  };

  const proximoPassoPorPerfil: Record<PerfilEvolucao, string> = {
    confirmada: `Levar ${menorAvanco.descritor.toLowerCase()} para o próximo ciclo, elevando a exigência: aplicar em uma situação com conflito real, não só em rotina.`,
    parcial: `Repetir ${maiorAvanco.descritor.toLowerCase()} em duas situações sem apoio do gestor, registrando o que foi decidido e por quê.`,
    estavel: `Combinar com o gestor uma situação concreta nas próximas duas semanas para exercitar ${menorAvanco.descritor.toLowerCase()}, com data marcada para a devolutiva.`,
  };

  return {
    competencia,
    descritores,
    evolution_report: {
      descritores,
      insight_geral: resumoPorPerfil[perfil],
      proximo_passo: proximoPassoPorPerfil[perfil],
      resumo_avaliacao: JUSTIFICATIVA_POR_PERFIL[perfil],
      nota_media_pos: notaMediaPos,
      resumo: {
        confirmadas: descritores.filter((d) => d.convergencia === 'evolucao_confirmada').length,
        parciais: descritores.filter((d) => d.convergencia === 'evolucao_parcial').length,
        estagnacoes: descritores.filter((d) => d.convergencia === 'estagnacao').length,
        regressoes: descritores.filter((d) => d.convergencia === 'regressao').length,
      },
      // Marca de origem: qualquer leitura que precise separar vitrine de dado
      // real tem um campo para isso, em vez de inferir pelo slug do tenant.
      demo_fixture: true,
    },
  };
}

/**
 * Linhas de `temporada_semana_progresso` do fechamento (semanas 13 e 14), na
 * forma que `gerarEvolutionReportCore` espera encontrar. Sem elas a jornada
 * concluída fica sem lastro: o relatório existiria e a semana que o produziu
 * apareceria em branco na tela da pessoa.
 */
export function construirFechamentoAcmeDemo(evolucao: EvolucaoDemo, concluidoEm: string) {
  return [
    {
      semana: 13,
      tipo: 'avaliacao',
      status: 'concluido',
      conteudo_consumido: true,
      iniciado_em: concluidoEm,
      concluido_em: concluidoEm,
      reflexao: {
        evolucao_percebida: evolucao.descritores.map((d) => ({
          descritor: d.descritor,
          nivel_percebido: d.nivel_percebido,
          antes: d.antes,
          depois: d.depois,
        })),
        insight_geral: evolucao.evolution_report.insight_geral,
        proximo_passo: evolucao.evolution_report.proximo_passo,
        demo_fixture: true,
      },
      feedback: null,
    },
    {
      semana: 14,
      tipo: 'avaliacao',
      status: 'concluido',
      conteudo_consumido: true,
      iniciado_em: concluidoEm,
      concluido_em: concluidoEm,
      reflexao: null,
      feedback: {
        avaliacao_por_descritor: evolucao.descritores.map((d) => ({
          descritor: d.descritor,
          nota_pre: d.nota_pre,
          nota_pos: d.nota_pos,
          justificativa: d.justificativa_cenario,
        })),
        nota_media_pos: evolucao.evolution_report.nota_media_pos,
        resumo_avaliacao: evolucao.evolution_report.resumo_avaliacao,
        demo_fixture: true,
      },
    },
  ];
}
