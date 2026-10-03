/**
 * Modo PERSONALIZADO: uma Jornada de duração ajustável (decisão do dono,
 * 03/10/2026). Deriva uma ProgramaConfig completa e validada a partir de 3
 * inputs (tela Configurações → Programa), gravados em
 * `sys_config.programa_custom` no MESMO formato de antes:
 *
 *   { semanas, numCompetencias, fechamento }
 *
 * - `semanas`: de 1 a 6 semanas de CONTEÚDO POR COMPETÊNCIA. Uma semana é a da
 *   Jornada: 2 conteúdos e 1 desafio.
 * - `numCompetencias`: 1 ou 2, EM SEQUÊNCIA (não em paralelo). Cada competência
 *   é uma trilha própria, como as jornadas encadeadas: terminou a primeira, a
 *   segunda nasce sozinha (`encadear-jornada.ts`). Com 2 competências e 6
 *   semanas são 12 semanas de conteúdo, mais os fechamentos.
 * - `fechamento`: opcional, e a escolha vale para as duas competências.
 *
 * O formato gravado não mudou, só o SENTIDO de `semanas` com 2 competências
 * (antes eram semanas em paralelo, uma pílula de cada; agora são semanas de
 * cada competência). A config gravada em produção em 03/10 (unianchieta,
 * `{"semanas":1,"fechamento":false,"numCompetencias":1}`) tem 1 competência e
 * continua válida com o mesmo sentido.
 *
 * Regras de PROGRAMA COMPLETO, não de degustação: a config derivada é
 * `modo: 'regular'`, como a Jornada. Antes era `modo: 'piloto'`, e isso ligava
 * a trava de piso, o spec 'piloto-v1', o relatório sem nível e avanço e a
 * recusa do certificado. "Não temos mais degustação de jornada."
 *
 * O snapshot em `trilhas.programa_config` (mig 182) congela as regras na
 * geração: editar a tela não afeta trilha em andamento. Trilha `custom` gerada
 * antes de 03/10 (snapshot com `modo: 'piloto'`) segue rodando pelo snapshot
 * dela, com a maquinaria da degustação, que continua no motor.
 *
 * Sem fechamento (`semanasAvaliacao: []`): não existe slot de avaliação no
 * plano; a trilha conclui ao concluir a última semana de conteúdo (rota
 * /reflection → `montarReportSemFechamento`). Sem Cenário B não há medição de
 * chegada: o relatório mostra o ponto de partida e diz que o avanço não foi
 * medido, em vez de inventar um.
 */

import type { ProgramaConfig, SequenciaPersonalizado } from './programa-config';

export interface ProgramaCustomInputs {
  /** Semanas de CONTEÚDO por competência (o fechamento, se houver, é uma semana a mais). */
  semanas: number;
  /** 1 ou 2 competências, em sequência. */
  numCompetencias: number;
  /** Fechamento (Cenário B, arguição e relatório de evolução) ao fim de cada competência. */
  fechamento: boolean;
}

export const CUSTOM_LIMITES = Object.freeze({
  semanasMin: 1,
  semanasMax: 6,
  compsMin: 1,
  compsMax: 2,
});

/**
 * Valida/normaliza o JSONB `sys_config.programa_custom`. Retorna null quando
 * o shape não sustenta uma derivação segura; o caller decide o erro (geração
 * explode explícito; UI cai no default do builder).
 */
export function parseProgramaCustom(raw: unknown): ProgramaCustomInputs | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as any;
  const semanas = Number(r.semanas);
  const numCompetencias = Number(r.numCompetencias);
  if (!Number.isInteger(semanas) || semanas < CUSTOM_LIMITES.semanasMin || semanas > CUSTOM_LIMITES.semanasMax) return null;
  if (!Number.isInteger(numCompetencias) || numCompetencias < CUSTOM_LIMITES.compsMin || numCompetencias > CUSTOM_LIMITES.compsMax) return null;
  return { semanas, numCompetencias, fechamento: !!r.fechamento };
}

/**
 * Deriva a ProgramaConfig de UMA competência (uma trilha). Lança em input fora
 * dos limites (defesa contra chamada sem parse): nunca degrada silenciosamente.
 *
 * É a Jornada (`PROGRAMA_JORNADA`) com a duração escolhida: `modo: 'regular'`,
 * 2 conteúdos por semana, um desafio por competência, sem semana de missão,
 * sem checkpoint do gestor (a Jornada não tem, por desenho do produto em
 * 04/09/2026), acumulada na última semana de conteúdo e arguição de 6 turnos.
 * O fechamento, quando existe, é uma semana própria no calendário, como a
 * semana 7 da Jornada (sem o espelho de calendário da degustação).
 *
 * A sequência de competências NÃO entra aqui: ela é decidida na geração
 * (`planejarTrilhaPersonalizada`, em trilha-core), que conhece o cargo e o
 * mapeamento da pessoa.
 */
export function derivarConfigCustom(inputs: ProgramaCustomInputs): ProgramaConfig {
  const valido = parseProgramaCustom(inputs);
  if (!valido) {
    throw new Error(
      `programa_custom inválido: semanas de ${CUSTOM_LIMITES.semanasMin} a ${CUSTOM_LIMITES.semanasMax}, ` +
      `competências de ${CUSTOM_LIMITES.compsMin} a ${CUSTOM_LIMITES.compsMax} (recebido: ${JSON.stringify(inputs)})`,
    );
  }
  const { semanas, fechamento } = valido;
  const slotsConteudo = Array.from({ length: semanas }, (_, i) => i + 1);

  const base = {
    modo: 'regular' as const,
    semanasMissao: [],
    semanasCheckpoint: [],
    slotsConteudo,
    blocosCobertos: {},
    complexidadeMap: {},
    nivelMetaAlvo: 3 as const,
    // Por TRILHA. A segunda competência do programa é outra trilha, encadeada.
    numCompetencias: 1,
    conteudosPorSemana: 2,
    desafioUnicoPorCompetencia: true,
  };

  if (fechamento) {
    const semanaFech = semanas + 1;
    return {
      ...base,
      semanas: semanaFech,
      semanasAvaliacao: [semanaFech],
      semanaCenarioB: semanaFech,
      // Como na Jornada: sem semana de conversa qualitativa, a acumulada é a
      // última semana de conteúdo (as evidências do fechamento vão até ela).
      semanaAcumulada: semanas,
      arguicao: { ativa: true, maxTurnos: 6 },
    };
  }

  return {
    ...base,
    semanas,
    semanasAvaliacao: [],
    // 0 = inalcançável (semana >= 1): sem slot de Cenário B e sem acumulada;
    // não há fechamento para consumi-la.
    semanaCenarioB: 0,
    semanaAcumulada: 0,
    arguicao: { ativa: false, maxTurnos: 0 },
  };
}

/**
 * O programa Personalizado INTEIRO, para quem precifica (orçamento e proposta).
 * `derivarConfigCustom` descreve UMA trilha, e cada competência é uma trilha
 * própria em sequência: com 2 competências o programa dura e custa o dobro de
 * uma. Ler `derivarConfigCustom(...).semanas` como duração do programa contaria
 * só a primeira competência.
 */
export function resumoProgramaPersonalizado(inputs: ProgramaCustomInputs): {
  porTrilha: ProgramaConfig;
  trilhas: number;
  semanasTotais: number;
} {
  const porTrilha = derivarConfigCustom(inputs);
  const trilhas = inputs.numCompetencias;
  return { porTrilha, trilhas, semanasTotais: porTrilha.semanas * trilhas };
}

/**
 * Lê a sequência gravada no snapshot (JSONB é dado, não código). Competências
 * distintas, de 1 a `CUSTOM_LIMITES.compsMax`, e posição dentro delas; fora
 * disso, null (o caller trata como programa de uma competência só).
 */
export function parseSequenciaPersonalizado(raw: unknown): SequenciaPersonalizado | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as any;
  if (!Array.isArray(r.competencias)) return null;
  const competencias = r.competencias.filter((c: unknown) => typeof c === 'string' && c.trim().length > 0);
  if (competencias.length !== r.competencias.length) return null;
  if (competencias.length < 1 || competencias.length > CUSTOM_LIMITES.compsMax) return null;
  if (new Set(competencias.map((c: string) => c.trim().toLowerCase())).size !== competencias.length) return null;
  const posicao = Number(r.posicao);
  if (!Number.isInteger(posicao) || posicao < 1 || posicao > competencias.length) return null;
  return { competencias, posicao };
}

/**
 * A config da PRÓXIMA competência do programa, a partir do snapshot da trilha
 * que acabou de concluir: as mesmas regras (duração, fechamento) e a posição
 * seguinte. null quando a trilha é a última (ou o programa tem uma só).
 *
 * As regras vêm do SNAPSHOT, e não da tela no dia do encadeamento: o programa
 * está em andamento, e trocar a duração no meio dele seria reinterpretá-lo.
 */
export function configDaProximaCompetencia(snapshot: ProgramaConfig): ProgramaConfig | null {
  const seq = parseSequenciaPersonalizado(snapshot?.sequenciaPersonalizado);
  if (!seq || seq.posicao >= seq.competencias.length) return null;
  return { ...snapshot, sequenciaPersonalizado: { competencias: seq.competencias, posicao: seq.posicao + 1 } };
}

/** Config SEM fechamento (encerra na última semana de conteúdo). */
export function ehConfigSemFechamento(config: Pick<ProgramaConfig, 'semanasAvaliacao'>): boolean {
  return !config.semanasAvaliacao || config.semanasAvaliacao.length === 0;
}

/**
 * Encerramento sem fechamento: dispara quando a semana concluída é a última do
 * plano E o modo não tem slot de avaliação. Falso pra TODOS os presets
 * (semanasAvaliacao não-vazia); por construção só o Personalizado sem
 * fechamento entra.
 */
export function deveEncerrarSemFechamento(
  config: Pick<ProgramaConfig, 'semanas' | 'semanasAvaliacao'>,
  semanaConcluida: number,
): boolean {
  return ehConfigSemFechamento(config) && Number(semanaConcluida) === config.semanas;
}

/** Rótulo do relatório de quem concluiu SEM fechamento (não é piloto). */
export const REPORT_MODO_SEM_FECHAMENTO = 'sem_fechamento';
export const SEM_FECHAMENTO_SPEC_VERSION = 'personalizado-sem-fechamento-v1';

/**
 * Relatório de encerramento do Personalizado SEM fechamento.
 *
 * Programa completo, então NÃO usa o shape da degustação (`modo: 'piloto'`,
 * que a tela rotula "Piloto concluído" e o certificado recusa). Também não usa
 * o shape do relatório regular: sem Cenário B não existe nota de chegada, e
 * `nota_pos` igual à de partida seria "estável" afirmado sem medição. O que
 * há é o ponto de partida (`baseline`, do diagnóstico), e `sem_fechamento:
 * true` diz a quem lê que o avanço não foi medido.
 *
 * Quem agrega evolução exclui este relatório pela mesma régua que exclui o do
 * piloto (`relatorioMedeEvolucao`); o certificado não o recusa.
 */
export function montarReportSemFechamento(trilha: {
  competencia_foco?: string | null;
  descritores_selecionados?: any;
}): Record<string, any> {
  const descritores = Array.isArray(trilha.descritores_selecionados) ? trilha.descritores_selecionados : [];
  return {
    modo: REPORT_MODO_SEM_FECHAMENTO,
    sem_fechamento: true,
    spec_version: SEM_FECHAMENTO_SPEC_VERSION,
    descritores: descritores.map((d: any) => ({
      competencia: d.competencia || trilha.competencia_foco || null,
      descritor: d.descritor,
      baseline: d.nota_atual ?? null,
    })),
    resumo_avaliacao: null,
    nota_media_pos: null,
  };
}

/**
 * Sanidade de um snapshot lido de `trilhas.programa_config` (JSONB é dado, não
 * código). Checa o esqueleto que o runtime consome; qualquer coisa fora →
 * null (o caller decide o fallback, nunca uso cego).
 */
export function parseConfigSnapshot(raw: unknown): ProgramaConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as any;
  if (typeof c.modo !== 'string') return null;
  if (!Number.isInteger(c.semanas) || c.semanas < 1) return null;
  if (!Array.isArray(c.slotsConteudo) || !Array.isArray(c.semanasAvaliacao) || !Array.isArray(c.semanasMissao)) return null;
  if (typeof c.semanaCenarioB !== 'number' || typeof c.semanaAcumulada !== 'number') return null;
  return c as ProgramaConfig;
}
