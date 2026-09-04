/**
 * Evolução da ACME Demo — T0 (mapeamento) → T1 (fechamento da semana 14).
 *
 * POR QUE ESTE ARQUIVO EXISTE (01/09/2026): a prova de evolução do produto
 * nasce no fechamento da temporada, e em produção isso existia em **1 de 106
 * trilhas** (a única, de um piloto de 2 semanas). O painel do gestor e a tela
 * de evolução liam essa fonte e mostravam o vazio para todo mundo, então não
 * havia como demonstrar ao cliente o que ele recebe no fim da jornada.
 *
 * A MECÂNICA VIVE EM `evolucao-nucleo`; aqui fica só o que é da ACME: quais
 * competências, quais comportamentos e como as pessoas deste mundo falam. Foi
 * assim que a rede de escolas ganhou a mesma vitrine sem um segundo gerador —
 * copiar este arquivo teria criado o gêmeo que diverge no primeiro ajuste da
 * régua, com as duas telas continuando bonitas.
 *
 * TRÊS REGRAS QUE O NÚCLEO GARANTE, E O MOTIVO DE CADA UMA:
 *
 * 1. **A classificação vem da função de produção**, `classificarConvergencia`.
 *    O veredito não é escolhido, é DERIVADO das notas — se alguém recalibrar os
 *    cortes da régua, a demo se move junto. Fixture que carimba o rótulo à mão
 *    passa a mentir no dia em que a régua muda.
 *
 * 2. **A nota de partida é a MESMA linha que o mapeamento gravou.** O T0 do
 *    relatório e o T0 da tela de diagnóstico saem do mesmo gerador, então as
 *    duas telas não se contradizem. Numa apresentação, duas telas discordando
 *    sobre a mesma pessoa custa mais caro que a tela vazia.
 *
 * 3. **A forma é a que o motor grava**, campo a campo, incluindo os que hoje
 *    nenhuma tela lê. Fixture na forma canônica em vez da forma REAL é a classe
 *    de erro que já mordeu esta base: o instrumento aprova, e a entrada de
 *    verdade quebra.
 *
 * A demo não tem regressão porque a régua não tem (ninguém desaprende uma
 * competência): o mix é confirmada, parcial e **estável**. Estável é o caso
 * honesto que sustenta a conversa comercial ("a plataforma também diz quem NÃO
 * evoluiu") sem expor negativamente uma pessoa fictícia numa tela de vendas.
 */

import {
  descritoresDaVitrine,
  MINIMO_POR_COMPETENCIA,
  competenciaFocoDistribuida,
  construirEvolucao,
  construirFechamento,
  type EvolucaoDemo,
  type PerfilEvolucao,
  type ReguaDeEvolucao,
} from './evolucao-nucleo';
import { competenciasAcmeDemoPorCargo } from './acme-rh-report-fixture';

export {
  distribuicaoPorCargo,
  notaDePartida,
  type DescritorEvolucao,
  type EvolucaoDemo,
  type PerfilEvolucao,
} from './evolucao-nucleo';

export const descritoresDaVitrineAcme = descritoresDaVitrine;
export const ACME_DEMO_MINIMO_POR_COMPETENCIA = MINIMO_POR_COMPETENCIA;

/**
 * Os comportamentos da régua da ACME Demo, na grafia exata de
 * `competencias.nome_curto` do tenant. Escrever qualquer outra coisa aqui
 * produz um relatório que fala de um comportamento que o mapeamento da pessoa
 * não tem — e o casamento entre as duas pontas é por NOME, não por id.
 */
export const ACME_DEMO_DESCRITORES = [
  'Leitura do contexto e identificação do problema',
  'Critério de priorização e tomada de decisão',
  'Execução com método e acompanhamento',
  'Comunicação com stakeholders',
  'Colaboração e negociação de dependências',
  'Aprendizado, ética e melhoria contínua',
] as const;

export const ACME_DEMO_EVOLUTION_MIX: readonly PerfilEvolucao[] = [
  'confirmada', 'confirmada', 'parcial', 'confirmada',
  'estavel', 'confirmada', 'confirmada', 'parcial',
  'confirmada', 'estavel', 'confirmada', 'parcial',
  'confirmada', 'confirmada', 'estavel',
] as const;

/**
 * 9 confirmadas, 3 parciais, 3 estáveis. Conferido pelo teste da régua da demo.
 *
 * Era 16/9/4/3 até 04/09/2026, quando o Rafael saiu das concluídas para os
 * atrasados — o card "Ação esta semana" do gestor precisava de alguém parado no
 * time da persona navegável. Saiu uma PARCIAL de propósito: as três leituras
 * (confirmada · parcial · estável) continuam representadas no painel de
 * evolução, que é o que a apresentação mostra.
 */
export const ACME_DEMO_EVOLUTION_TARGETS = Object.freeze({
  concluded: 15,
  confirmadas: 9,
  parciais: 3,
  estaveis: 3,
});

const ANTES: Record<string, string> = {
  'Leitura do contexto e identificação do problema': 'Eu partia direto para a solução. Quando o problema voltava, era porque eu tinha resolvido o sintoma.',
  'Critério de priorização e tomada de decisão': 'Priorizava pelo que gritava mais alto no dia. Quase sempre o urgente comia o importante.',
  'Execução com método e acompanhamento': 'Combinava as ações na reunião e não voltava para verificar. O acompanhamento ficava na memória.',
  'Comunicação com stakeholders': 'Comunicava o resultado, não o caminho. As pessoas ficavam sabendo tarde e reagiam tarde.',
  'Colaboração e negociação de dependências': 'Quando dependia de outra área, eu esperava. Só cobrava quando o prazo já estava perdido.',
  'Aprendizado, ética e melhoria contínua': 'Tratava erro como algo a ser explicado, não como material de aprendizado do time.',
};

const DEPOIS: Record<string, string> = {
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

const JUSTIFICATIVA: Record<PerfilEvolucao, string> = {
  confirmada: 'No cenário de fechamento, aplicou o comportamento sem ser induzido pela pergunta, e sustentou a escolha quando o cenário apresentou uma restrição nova.',
  parcial: 'Aplicou o comportamento no cenário de fechamento, mas apoiado na estrutura oferecida pela pergunta. Ainda não aparece de forma espontânea.',
  estavel: 'Reconheceu o que deveria ser feito e descreveu o caminho, sem apresentar uma situação real em que isso já tenha acontecido.',
};

/** A régua da ACME: competências do cargo, comportamentos e a voz do elenco. */
export const REGUA_ACME: ReguaDeEvolucao = {
  competenciasPorCargo: (cargo) => competenciasAcmeDemoPorCargo(cargo),
  // Na ACME os mesmos comportamentos valem para toda competência — é a régua
  // genérica do tenant de demonstração comercial.
  descritoresPorCompetencia: () => [...ACME_DEMO_DESCRITORES],
  textos: {
    antes: (_cargo, _competencia, descritor) => ANTES[descritor] || null,
    depois: (_cargo, _competencia, descritor) => DEPOIS[descritor] || null,
    limiteEstavel: (_cargo, _competencia, descritor) => LIMITE_ESTAVEL[descritor] || null,
    justificativa: (perfil) => JUSTIFICATIVA[perfil],
    insight: (perfil, { primeiroNome, maiorAvanco, menorAvanco }) => ({
      confirmada: `${primeiroNome} sustentou no cenário de fechamento o que vinha praticando durante a jornada. O avanço mais claro está em ${maiorAvanco.toLowerCase()}, e apareceu tanto na avaliação quanto no relato da própria pessoa.`,
      parcial: `${primeiroNome} avançou em ${maiorAvanco.toLowerCase()}, com o comportamento ainda apoiado na estrutura da conversa. O próximo ciclo precisa verificar se ele aparece sem ajuda.`,
      estavel: `${primeiroNome} manteve o patamar de partida. Reconhece o que precisa mudar e descreve o caminho, mas o fechamento não trouxe uma situação real em que isso já tenha acontecido. ${menorAvanco} é onde a lacuna segue mais visível.`,
    }[perfil]),
    proximoPasso: (perfil, { maiorAvanco, menorAvanco }) => ({
      confirmada: `Levar ${menorAvanco.toLowerCase()} para o próximo ciclo, elevando a exigência: aplicar em uma situação com conflito real, não só em rotina.`,
      parcial: `Repetir ${maiorAvanco.toLowerCase()} em duas situações sem apoio do gestor, registrando o que foi decidido e por quê.`,
      estavel: `Combinar com o gestor uma situação concreta nas próximas duas semanas para exercitar ${menorAvanco.toLowerCase()}, com data marcada para a devolutiva.`,
    }[perfil]),
  },
};

export function competenciaFocoDaDemo(cargo: string, indiceNoCargo: number, totalNoCargo: number): string {
  return competenciaFocoDistribuida(competenciasAcmeDemoPorCargo(cargo), indiceNoCargo, totalNoCargo);
}

export function construirEvolucaoAcmeDemo(
  pessoa: { email: string; nome_completo: string; cargo: string },
  perfil: PerfilEvolucao,
  distribuicao?: { indice: number; total: number },
): EvolucaoDemo {
  return construirEvolucao(pessoa, perfil, REGUA_ACME, distribuicao);
}

/** O DUO fecha na 13 (qualitativa) e na 14 (cenário). */
export function construirFechamentoAcmeDemo(evolucao: EvolucaoDemo, concluidoEm: string) {
  return construirFechamento(evolucao, concluidoEm, { qualitativa: 13, cenario: 14 });
}
