/**
 * Núcleo do fixture de EVOLUÇÃO dos ambientes de demonstração.
 *
 * A mecânica (nota de partida, ganho por perfil, leitura qualitativa,
 * distribuição por cargo, forma do `evolution_report`) é a MESMA em qualquer
 * segmento. O que muda é DADO: quais competências o cargo tem, quais
 * comportamentos a régua mede e como as pessoas daquele mundo falam.
 *
 * POR QUE ISTO EXISTE (01/09/2026): a rede de escolas precisava da mesma
 * vitrine da ACME, e copiar o fixture comercial teria produzido dois geradores
 * para a mesma coisa — o gêmeo que diverge no primeiro ajuste da régua e ninguém
 * percebe, porque as duas telas continuam bonitas. Aqui a mecânica é única e
 * cada ambiente entra como `ReguaDeEvolucao`.
 *
 * ⚠️ A VOZ É DADO, e é por isso que os textos entram por parâmetro. Um professor
 * dizendo "negociei a dependência com a outra área" entrega a demo errada, e a
 * evidência textual é justamente a parte do relatório que o gestor lê em voz
 * alta numa reunião.
 */

import { classificarConvergencia, type Convergencia } from '@/lib/season-engine/convergencia';
import { PROGRESSO } from '@/lib/status';

/**
 * Quais comportamentos a trilha de vitrine trabalha: TODOS os da competência.
 *
 * Era um corte em 4 (`DESCRITORES_POR_TRILHA`), e o relatório de evolução
 * mostrava 4 de 6 comportamentos: quem lê a tela não tem como saber se os
 * outros dois não evoluíram ou não foram medidos.
 *
 * É uma FUNÇÃO, e não uma constante, de propósito. A constante virou `null`
 * para significar "todos" e os dois call-sites que faziam
 * `descritores.slice(0, CONSTANTE)` passaram a devolver LISTA VAZIA — porque
 * `slice(0, null)` é `[]`. A troca falharia calada, no reset, semeando zero
 * assessments. Uma função não tem esse modo de falhar.
 */
export function descritoresDaVitrine<T>(todos: readonly T[]): T[] {
  return [...todos];
}

/** Quantas pessoas, no mínimo, cada competência da vitrine deve ter. */
export const MINIMO_POR_COMPETENCIA = 3;

export type PerfilEvolucao = 'confirmada' | 'parcial' | 'estavel';

/**
 * O que um ambiente precisa declarar para ter evolução na vitrine.
 *
 * `textos` devolve a fala da pessoa. Recebe competência e comportamento porque
 * numa régua real o mesmo comportamento muda de sentido conforme a competência
 * em que aparece.
 */
export type ReguaDeEvolucao = {
  /** Competências do cargo, na ordem em que a vitrine deve usá-las. */
  competenciasPorCargo: (cargo: string) => string[];
  /** Comportamentos medidos naquela competência. */
  descritoresPorCompetencia: (cargo: string, competencia: string) => string[];
  textos: {
    // ⚠️ O CARGO entra junto: numa régua real a mesma competência aparece em
    // cargos diferentes, com comportamentos e vocabulário diferentes. Na rede
    // escolar, "Gestão da Aprendizagem" existe para quem dá aula e para quem
    // coordena — resolver só pelo nome daria ao coordenador a fala do professor.
    antes: (cargo: string, competencia: string, descritor: string) => string | null;
    depois: (cargo: string, competencia: string, descritor: string) => string | null;
    limiteEstavel: (cargo: string, competencia: string, descritor: string) => string | null;
    justificativa: (perfil: PerfilEvolucao) => string;
    insight: (perfil: PerfilEvolucao, ctx: { primeiroNome: string; maiorAvanco: string; menorAvanco: string }) => string;
    proximoPasso: (perfil: PerfilEvolucao, ctx: { maiorAvanco: string; menorAvanco: string }) => string;
  };
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
    resumo: { confirmadas: number; parciais: number; estagnacoes: number };
    demo_fixture: true;
  };
};

export function seedOf(value: string): number {
  return [...value].reduce((total, char) => total + char.charCodeAt(0), 0);
}

function arredondar(valor: number): number {
  return Number(Math.max(1, Math.min(4, valor)).toFixed(1));
}

/**
 * Nota de partida (T0). Determinística por (email, comportamento) e
 * deliberadamente baixa: a trilha seleciona lacuna, então um T0 alto tornaria a
 * evolução impossível de mostrar sem estourar o teto da escala.
 */
export function notaDePartida(email: string, descritor: string): number {
  const seed = seedOf(`${email}:${descritor}`);
  return arredondar(1.5 + ((seed % 7) / 10));
}

/**
 * Ganho aplicado no fechamento. Os intervalos caem com folga de cada lado dos
 * cortes da régua (0,5 e 0,2), e não em cima deles: uma demo cujo veredito
 * depende do arredondamento muda de resultado quando alguém ajusta a régua em
 * um centésimo.
 */
function ganhoDoPerfil(perfil: PerfilEvolucao, seed: number): number {
  if (perfil === 'confirmada') return 0.7 + ((seed % 4) / 10);
  if (perfil === 'parcial') return 0.25 + ((seed % 3) / 20);
  // Estavel = MANTEVE o patamar, nunca perdeu: o ganho antigo variava de -0,05
  // a +0,05 e a tela exibia "(-0.1)" — uma regressao inventada pela vitrine,
  // que numa demo soa como o programa tendo piorado a pessoa.
  return (seed % 3) / 20;
}

/**
 * Leitura qualitativa da semana anterior ao fechamento. Só o perfil
 * "confirmada" percebe avanço acima da nota de partida — é o que a régua exige
 * para promover de parcial a confirmada, e é o que separa "o número subiu" de
 * "a pessoa e o entorno viram a mudança acontecer".
 */
function nivelPercebido(perfil: PerfilEvolucao, notaPre: number, notaPos: number): number | null {
  if (perfil === 'confirmada') return arredondar(Math.max(notaPre + 0.5, notaPos - 0.2));
  if (perfil === 'parcial') return arredondar(notaPre);
  return null;
}

/**
 * Qual competência do cargo esta pessoa trabalhou.
 *
 * ⚠️ NÃO É SEMPRE A PRIMEIRA. Com todo mundo do mesmo cargo focando a mesma
 * competência, o painel mostra médias de n=1 ao lado de médias de n=9, com o
 * mesmo peso visual. A distribuição mira um PISO de pessoas por competência em
 * vez de espalhar o máximo — espalhar em cinco devolve o mesmo problema pelo
 * outro lado.
 */
export function competenciaFocoDistribuida(
  competencias: string[],
  indiceNoCargo: number,
  totalNoCargo: number,
): string {
  if (!competencias.length) throw new Error('cargo sem competência na régua da demo');
  const grupos = Math.max(
    1,
    Math.min(competencias.length, Math.floor(totalNoCargo / MINIMO_POR_COMPETENCIA)),
  );
  return competencias[indiceNoCargo % grupos];
}

/**
 * Posição de cada pessoa dentro do próprio cargo, para alimentar
 * `competenciaFocoDistribuida`.
 */
export function distribuicaoPorCargo(
  pessoas: readonly { chave: string; cargo: string }[],
): Map<string, { indice: number; total: number }> {
  const porCargo = new Map<string, string[]>();
  for (const pessoa of pessoas) {
    porCargo.set(pessoa.cargo, [...(porCargo.get(pessoa.cargo) || []), pessoa.chave]);
  }
  const saida = new Map<string, { indice: number; total: number }>();
  for (const chaves of porCargo.values()) {
    chaves.forEach((chave, indice) => saida.set(chave, { indice, total: chaves.length }));
  }
  return saida;
}

/**
 * Monta a evolução de uma pessoa. `perfil` decide a magnitude do ganho; o
 * VEREDITO continua saindo da régua de produção, aplicada sobre as notas.
 */
export function construirEvolucao(
  pessoa: { email: string; nome_completo: string; cargo: string },
  perfil: PerfilEvolucao,
  regua: ReguaDeEvolucao,
  distribuicao?: { indice: number; total: number },
): EvolucaoDemo {
  const competencia = competenciaFocoDistribuida(
    regua.competenciasPorCargo(pessoa.cargo),
    distribuicao?.indice ?? 0,
    distribuicao?.total ?? 1,
  );

  const descritores: DescritorEvolucao[] = descritoresDaVitrine(
    regua.descritoresPorCompetencia(pessoa.cargo, competencia),
  )
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
        antes: perfil === 'estavel' ? null : regua.textos.antes(pessoa.cargo, competencia, descritor),
        depois: perfil === 'estavel'
          ? regua.textos.limiteEstavel(pessoa.cargo, competencia, descritor)
          : regua.textos.depois(pessoa.cargo, competencia, descritor),
        justificativa_cenario: regua.textos.justificativa(perfil),
        // A régua de produção decide. Nunca carimbar o veredito à mão aqui.
        convergencia: classificarConvergencia({ nota_pre, nota_pos, nivel_percebido }),
      };
    });

  if (!descritores.length) {
    throw new Error(`competência sem comportamentos na régua da demo: ${competencia}`);
  }

  const notaMediaPos = Number(
    (descritores.reduce((total, d) => total + d.nota_pos, 0) / descritores.length).toFixed(2),
  );
  const ordenados = [...descritores].sort((a, b) => (b.nota_pos - b.nota_pre) - (a.nota_pos - a.nota_pre));
  const ctx = {
    primeiroNome: pessoa.nome_completo.split(' ')[0],
    maiorAvanco: ordenados[0].descritor,
    menorAvanco: ordenados[ordenados.length - 1].descritor,
  };

  return {
    competencia,
    descritores,
    evolution_report: {
      descritores,
      insight_geral: regua.textos.insight(perfil, ctx),
      proximo_passo: regua.textos.proximoPasso(perfil, ctx),
      resumo_avaliacao: regua.textos.justificativa(perfil),
      nota_media_pos: notaMediaPos,
      resumo: {
        confirmadas: descritores.filter((d) => d.convergencia === 'evolucao_confirmada').length,
        parciais: descritores.filter((d) => d.convergencia === 'evolucao_parcial').length,
        estagnacoes: descritores.filter((d) => d.convergencia === 'estagnacao').length,
      },
      // Marca de origem: qualquer leitura que precise separar vitrine de dado
      // real tem um campo para isso, em vez de inferir pelo slug do tenant.
      demo_fixture: true,
    },
  };
}

/**
 * Linhas de `temporada_semana_progresso` do fechamento, na forma que
 * `gerarEvolutionReportCore` espera encontrar. Sem elas a jornada concluída
 * fica sem lastro: o relatório existiria e a semana que o produziu apareceria
 * em branco na tela da pessoa.
 *
 * As semanas vêm por parâmetro porque o programa muda por ambiente — o DUO
 * fecha em 13/14 e a jornada escolar, de 7 semanas, em 6/7.
 */
/**
 * Esqueleto de plano e progresso das semanas ANTERIORES ao fechamento.
 *
 * Sem isto, a trilha do panorama nascia com `temporada_plano: []` e apenas as
 * duas linhas do fechamento. A tela lê `semanas.length || 14` e conta as linhas
 * concluídas: uma jornada de 7 semanas ENCERRADA aparecia como "2/14".
 *
 * O esqueleto não inventa conteúdo — carrega semana, tipo e o estado de
 * concluída, que é o que a barra de progresso mede. As duas semanas de
 * fechamento continuam vindo de `construirFechamento`, com o texto real.
 */
export function construirPercursoAnterior(
  semanas: number,
  fechamento: number[],
  concluidoEm: string,
): { plano: any[]; progresso: any[] } {
  const plano: any[] = [];
  const progresso: any[] = [];
  for (let semana = 1; semana <= semanas; semana++) {
    const ehFechamento = fechamento.includes(semana);
    plano.push({ semana, tipo: ehFechamento ? 'avaliacao' : 'conteudo' });
    if (ehFechamento) continue;
    progresso.push({
      semana,
      tipo: 'conteudo',
      status: PROGRESSO.CONCLUIDO,
      conteudo_consumido: true,
      iniciado_em: concluidoEm,
      concluido_em: concluidoEm,
      reflexao: null,
      feedback: null,
    });
  }
  return { plano, progresso };
}

export function construirFechamento(
  evolucao: EvolucaoDemo,
  concluidoEm: string,
  semanas: { qualitativa: number; cenario: number },
) {
  return [
    {
      semana: semanas.qualitativa,
      tipo: 'avaliacao',
      status: PROGRESSO.CONCLUIDO,
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
      semana: semanas.cenario,
      tipo: 'avaliacao',
      status: PROGRESSO.CONCLUIDO,
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
