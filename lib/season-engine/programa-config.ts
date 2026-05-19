/**
 * ProgramaConfig — parâmetros que diferenciam um "modo" do programa (regular x onboarding).
 *
 * Lido de `empresas.sys_config` (JSONB livre, sem CHECK no DB). Default = regular.
 * Fase 1 do Modo Onboarding: extrai hardcodes da engine para esta config. Nesta
 * fase NÃO existe ainda o template `onboarding` — toda empresa cai em regular.
 * O template Onboarding entra na Fase 2.
 */

export type ProgramaModo = 'regular' | 'onboarding';
export type ComplexidadeMissao = 'simples' | 'intermediario' | 'completo';
export type FaseCarreira = 'junior' | 'pleno' | 'senior';

export interface ProgramaConfig {
  modo: ProgramaModo;
  /** Duração total da trilha em semanas. Regular=14, Onboarding=10. */
  semanas: number;
  /** Semanas em que ocorre missão prática (aplicação). Regular=[4,8,12], Onboarding=[4,7,9]. */
  semanasMissao: number[];
  /** Semanas reservadas para avaliação final. Regular=[13,14], Onboarding=[10]. */
  semanasAvaliacao: number[];
  /** Semana do wizard Cenário B / avaliação final. Regular=14, Onboarding=10. */
  semanaCenarioB: number;
  /** Semana em que a Avaliação Acumulada é disparada. Regular=13. Em Onboarding, fica embutida nas missões. */
  semanaAcumulada: number;
  /** Slots de conteúdo (semanas que NÃO são missão nem avaliação). Regular=9 slots. */
  slotsConteudo: number[];
  /**
   * Quantos descritores cada semana de missão cobre.
   * -1 = todos os descritores selecionados.
   * Regular: { 4: 3, 8: 6, 12: -1 } (cumulativo).
   */
  blocosCobertos: Record<number, number>;
  /** Complexidade do cenário/missão por semana de aplicação. */
  complexidadeMap: Record<number, ComplexidadeMissao>;
  /** Nível-meta na régua de maturidade. Regular=3 (meta proficiente), Onboarding=2 (em desenvolvimento). */
  nivelMetaAlvo: 2 | 3;
  /** Quantas competências cabem em uma trilha. Regular=1 (aprofundada), Onboarding=5 (espiral). */
  numCompetencias: number;
  /** Default usado pela IA1 quando nenhum override por cargo é dado. */
  faseCarreiraDefault?: FaseCarreira;
  /**
   * Multi-competência (Onboarding): mapeia semana de fundamento → índice no
   * array de competências da trilha. Quando undefined, engine usa modo
   * single-competência (regular).
   */
  semanaParaCompetenciaIdx?: Record<number, number>;
  /**
   * Multi-competência (Onboarding): para cada semana de missão, lista os
   * índices das competências já trabalhadas até ali (acumulativo).
   * -1 (em qualquer posição) = todas. Default regular: undefined.
   */
  competenciasNaMissao?: Record<number, number[]>;
}

/**
 * Default: programa regular de 14 semanas, uma competência aprofundada,
 * missões 4/8/12, avaliação 13/14, nível-meta 3. ESTE é o comportamento
 * preservado byte-exact após a Fase 1.
 */
export const PROGRAMA_REGULAR: ProgramaConfig = Object.freeze({
  modo: 'regular',
  semanas: 14,
  semanasMissao: [4, 8, 12],
  semanasAvaliacao: [13, 14],
  semanaCenarioB: 14,
  semanaAcumulada: 13,
  slotsConteudo: [1, 2, 3, 5, 6, 7, 9, 10, 11],
  blocosCobertos: { 4: 3, 8: 6, 12: -1 },
  complexidadeMap: { 4: 'simples', 8: 'intermediario', 12: 'completo' },
  nivelMetaAlvo: 3,
  numCompetencias: 1,
}) as ProgramaConfig;

/**
 * Onboarding: trilha de 10 semanas em espiral cobrindo 5 competências.
 * Missões integradoras nas semanas 4 (Comps 1+2), 7 (1+2+3+4) e 9 (todas).
 * Cenário B na semana 10. Nível-meta 2 (funcional / autonomia supervisionada).
 *
 * Cadência detalhada:
 *   1   — Calibragem (DISC + diagnóstico + onboarding institucional)
 *   2,3 — Fundamento Comp 1 e 2
 *   4   — Missão Integradora 1 (Comp 1+2)
 *   5,6 — Fundamento Comp 3 e 4
 *   7   — Missão Integradora 2 (Comp 1..4)
 *   8   — Fundamento Comp 5
 *   9   — Missão Integradora 3 (todas) + acumulada embutida
 *   10  — Cenário B + Evolution Report
 *
 * NOTA Fase 2: o template existe e é selecionado por sys_config.programa_modo,
 * mas `actions/temporadas.gerarTemporada` bloqueia geração em modo onboarding
 * até a Fase 3 (que refatora `selectDescriptors` para multi-competência e
 * adiciona prompts integradores no IA3).
 */
export const PROGRAMA_ONBOARDING: ProgramaConfig = Object.freeze({
  modo: 'onboarding',
  semanas: 10,
  semanasMissao: [4, 7, 9],
  semanasAvaliacao: [10],
  semanaCenarioB: 10,
  semanaAcumulada: 9, // embutida na última missão integradora
  slotsConteudo: [2, 3, 5, 6, 8], // 5 fundamentos; sem 1 = calibragem
  blocosCobertos: { 4: 2, 7: 4, 9: -1 }, // 2 comps, 4 comps, todas as 5
  complexidadeMap: { 4: 'simples', 7: 'intermediario', 9: 'completo' },
  nivelMetaAlvo: 2,
  numCompetencias: 5,
  // Sem 2 = Comp[0], Sem 3 = Comp[1], Sem 5 = Comp[2], Sem 6 = Comp[3], Sem 8 = Comp[4]
  semanaParaCompetenciaIdx: { 2: 0, 3: 1, 5: 2, 6: 3, 8: 4 },
  // Missão 1 (sem 4) = Comps 0+1; Missão 2 (sem 7) = 0..3; Missão 3 (sem 9) = todas
  competenciasNaMissao: { 4: [0, 1], 7: [0, 1, 2, 3], 9: [-1] },
}) as ProgramaConfig;

/**
 * Regular DUO: mesma profundidade do Regular (14 semanas, nível-meta 3,
 * alocação profunda de descritores) cobrindo 2 competências em paralelo.
 *
 * Modelo "blocos paralelos": os 9 slots de conteúdo são divididos entre as
 * 2 competências (selectDescriptorsDuo aloca profundo por comp, com blocos
 * de 2 semanas pra gaps grandes); as missões 4/8/12 são INTEGRADORAS das
 * duas (complexidade crescente: simples → intermediário → completo).
 *
 * Estrutura idêntica ao Regular (slots/missões/avaliação) — só a alocação
 * de descritores e as missões viram multi-competência. Isso mantém intactos
 * week-gating, progresso, dashboard week-view e Cenário B (sem 14).
 *
 * Default GLOBAL: toda empresa sem `programa_modo` cai aqui. Trilhas já
 * persistidas (single-comp) não são regeradas — o plano salvo é servido
 * como está; só nova geração usa DUO.
 */
export const PROGRAMA_REGULAR_DUO: ProgramaConfig = Object.freeze({
  modo: 'regular',
  semanas: 14,
  semanasMissao: [4, 8, 12],
  semanasAvaliacao: [13, 14],
  semanaCenarioB: 14,
  semanaAcumulada: 13,
  slotsConteudo: [1, 2, 3, 5, 6, 7, 9, 10, 11],
  blocosCobertos: { 4: 3, 8: 6, 12: -1 },
  complexidadeMap: { 4: 'simples', 8: 'intermediario', 12: 'completo' },
  nivelMetaAlvo: 3,
  numCompetencias: 2,
  // 2 comps ativas desde o início → toda missão integra as duas.
  // (-1 = todas as comps da trilha; complexidade cresce via complexidadeMap.)
  competenciasNaMissao: { 4: [-1], 8: [-1], 12: [-1] },
  // SEM semanaParaCompetenciaIdx: a competência de cada semana de conteúdo
  // vem do descritor (selectDescriptorsDuo grava .competencia). O mapa
  // semana→comp é exclusivo do onboarding (espiral raso).
}) as ProgramaConfig;

/**
 * Resolve a config a partir do `sys_config` JSONB de uma empresa.
 *
 * Default GLOBAL = Regular DUO (2 competências). Escape hatches por
 * `sys_config.programa_modo`:
 *   - 'onboarding'      → PROGRAMA_ONBOARDING (10 sem, 5 comps, espiral)
 *   - 'regular_single'  → PROGRAMA_REGULAR (1 comp aprofundada — rollback
 *                         sem mexer em código, caso um cliente precise)
 *   - ausente / outro   → PROGRAMA_REGULAR_DUO
 */
export function getProgramaConfig(sysConfig?: { programa_modo?: string } | null): ProgramaConfig {
  if (sysConfig?.programa_modo === 'onboarding') return PROGRAMA_ONBOARDING;
  if (sysConfig?.programa_modo === 'regular_single') return PROGRAMA_REGULAR;
  return PROGRAMA_REGULAR_DUO;
}

/**
 * Conveniência: dados os descritores selecionados, retorna a lista de
 * descritores cobertos por uma semana de missão. Centraliza a lógica de
 * `blocosCobertos[semana] = N | -1`.
 */
export function descritoresCobertosNaMissao<T>(
  descritoresSelecionados: T[],
  semana: number,
  config: ProgramaConfig,
): T[] {
  const n = config.blocosCobertos[semana];
  if (n === undefined) return [];
  if (n === -1) return [...descritoresSelecionados];
  return descritoresSelecionados.slice(0, n);
}
