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
 * Resolve a config a partir do `sys_config` JSONB de uma empresa.
 * Fase 1: sempre devolve REGULAR — nenhum tenant ainda usa modo onboarding.
 * Fase 2 vai estender pra ler `sys_config.programa_modo === 'onboarding'` e
 * devolver o template ONBOARDING.
 */
export function getProgramaConfig(sysConfig?: { programa_modo?: string } | null): ProgramaConfig {
  // Fase 1: ignora sys_config — sempre regular. Documentado em ARQUITETURA.md.
  return PROGRAMA_REGULAR;
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
