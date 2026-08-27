/**
 * Modo PERSONALIZADO (builder de degustação) — deriva uma ProgramaConfig
 * completa e validada a partir de 3 inputs (tela Configurações → Programa):
 *
 *   { semanas, numCompetencias, fechamento }
 *
 * Família "degustação": 1–4 semanas de conteúdo, 1–2 competências, com ou sem
 * fechamento — SEM missões, mapeamentos (DISC + técnico) sempre ativos. Regular
 * e Onboarding continuam presets de código; este builder cobre a variabilidade
 * real (demos/pilotos curtos por lead), sem expor campos livres da config.
 *
 * A config derivada usa `modo: 'piloto'` — ela HERDA a maquinaria da
 * degustação (seleção top-N por gap, entrega dupla por semana, acumulada +
 * trava + espelho quando há fechamento). O que distingue é o RÓTULO carimbado
 * ('custom') + o snapshot em `trilhas.programa_config` (mig 182), que congela
 * as regras na geração — editar o builder não afeta trilha em andamento.
 *
 * Sem fechamento (`semanasAvaliacao: []`): não existe slot de avaliação no
 * plano; o encerramento acontece ao concluir a última semana de conteúdo
 * (rota /reflection → montarReportDegustacao), único caminho de conclusão que
 * não passa pelo Evolution Report do fechamento.
 */

import type { ProgramaConfig } from './programa-config';

export interface ProgramaCustomInputs {
  /** Semanas de CONTEÚDO (o fechamento, se houver, é um slot extra espelhado). */
  semanas: number;
  numCompetencias: number;
  fechamento: boolean;
}

export const CUSTOM_LIMITES = Object.freeze({
  semanasMin: 1,
  semanasMax: 4,
  compsMin: 1,
  compsMax: 2,
});

export const DEGUSTACAO_SPEC_VERSION = 'degustacao-v1';

/**
 * Valida/normaliza o JSONB `sys_config.programa_custom`. Retorna null quando
 * o shape não sustenta uma derivação segura — o caller decide o erro (geração
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
 * Deriva a ProgramaConfig completa dos inputs. Lança em input fora dos
 * limites (defesa contra chamada sem parse) — nunca degrada silenciosamente.
 */
export function derivarConfigCustom(inputs: ProgramaCustomInputs): ProgramaConfig {
  const valido = parseProgramaCustom(inputs);
  if (!valido) {
    throw new Error(
      `programa_custom inválido: semanas ${CUSTOM_LIMITES.semanasMin}–${CUSTOM_LIMITES.semanasMax}, ` +
      `competências ${CUSTOM_LIMITES.compsMin}–${CUSTOM_LIMITES.compsMax} (recebido: ${JSON.stringify(inputs)})`,
    );
  }
  const { semanas, numCompetencias, fechamento } = valido;
  const slotsConteudo = Array.from({ length: semanas }, (_, i) => i + 1);

  if (fechamento) {
    const semanaFech = semanas + 1;
    return {
      modo: 'piloto',
      semanas: semanaFech,
      semanasMissao: [],
      semanasAvaliacao: [semanaFech],
      semanaCenarioB: semanaFech,
      // Acumulada dispara ao concluir a ÚLTIMA semana de conteúdo (mesma
      // maquinaria do piloto: task Trigger + gate no fechamento).
      semanaAcumulada: semanas,
      slotsConteudo,
      blocosCobertos: {},
      complexidadeMap: {},
      nivelMetaAlvo: 3,
      numCompetencias,
      conteudosPorSemana: 2,
      // Uma tarefa por competência por semana (27/08/2026), como no piloto e na
      // jornada. Com `numCompetencias >= 2` a régua devolve uma tarefa CADA —
      // ela unifica por competência, não por semana (ver `manterUmDesafio`).
      desafioUnicoPorCompetencia: true,
      // Fechamento libera no CALENDÁRIO da última semana de conteúdo; o gate
      // real é a progressão ("anterior concluída") — nunca espera semana extra.
      semanaEspelhoCalendario: { [semanaFech]: semanas },
      arguicao: { ativa: true, maxTurnos: 4 },
    };
  }

  return {
    modo: 'piloto',
    semanas,
    semanasMissao: [],
    semanasAvaliacao: [],
    // 0 = inalcançável (semana >= 1): sem slot de Cenário B e a acumulada
    // nunca dispara — não há fechamento pra consumi-la.
    semanaCenarioB: 0,
    semanaAcumulada: 0,
    slotsConteudo,
    blocosCobertos: {},
    complexidadeMap: {},
    nivelMetaAlvo: 3,
    numCompetencias,
    conteudosPorSemana: 2,
    desafioUnicoPorCompetencia: true,
    arguicao: { ativa: false, maxTurnos: 0 },
  };
}

/** Config de degustação SEM fechamento (encerra na última semana de conteúdo). */
export function ehConfigSemFechamento(config: Pick<ProgramaConfig, 'semanasAvaliacao'>): boolean {
  return !config.semanasAvaliacao || config.semanasAvaliacao.length === 0;
}

/**
 * Encerramento sem fechamento: dispara quando a semana concluída é a última do
 * plano E o modo não tem slot de avaliação. Falso pra TODOS os presets
 * (semanasAvaliacao não-vazia) — por construção só o custom sem fechamento entra.
 */
export function deveEncerrarSemFechamento(
  config: Pick<ProgramaConfig, 'semanas' | 'semanasAvaliacao'>,
  semanaConcluida: number,
): boolean {
  return ehConfigSemFechamento(config) && Number(semanaConcluida) === config.semanas;
}

/**
 * Report de encerramento da degustação SEM fechamento. Usa o shape do report
 * piloto (`modo:'piloto'`) de propósito: a tela de conclusão já tem a variante
 * sem delta e a agregação do gestor já EXCLUI esse modo. `sem_fechamento:true`
 * esconde o que não existe (PDF/avaliação); baseline = diagnóstico.
 */
export function montarReportDegustacao(trilha: {
  competencia_foco?: string | null;
  descritores_selecionados?: any;
}): Record<string, any> {
  const descritores = Array.isArray(trilha.descritores_selecionados) ? trilha.descritores_selecionados : [];
  return {
    modo: 'piloto',
    sem_fechamento: true,
    spec_version: DEGUSTACAO_SPEC_VERSION,
    descritores: descritores.map((d: any) => ({
      competencia: d.competencia || trilha.competencia_foco || null,
      descritor: d.descritor,
      baseline: d.nota_atual ?? null,
      nota_avaliacao: null,
      nota_avaliacao_bruta: null,
      piso_aplicado: false,
      justificativa_cenario: null,
    })),
    resumo_avaliacao: null,
    nota_media_pos: null,
    piso_aplicado: false,
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
