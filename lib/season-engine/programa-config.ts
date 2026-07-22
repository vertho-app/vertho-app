/**
 * ProgramaConfig — parâmetros que diferenciam um "modo" do programa (regular x onboarding).
 *
 * Lido de `empresas.sys_config` (JSONB livre, sem CHECK no DB). Default = regular.
 * Fase 1 do Modo Onboarding: extrai hardcodes da engine para esta config. Nesta
 * fase NÃO existe ainda o template `onboarding` — toda empresa cai em regular.
 * O template Onboarding entra na Fase 2.
 */

export type ProgramaModo = 'regular' | 'onboarding' | 'piloto';
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
  /**
   * Piloto: quantos conteúdos (entregas) cada semana de conteúdo recebe.
   * Piloto=2 (1 descritor distinto por entrega, MESMA competência).
   * undefined = 1 entrega (regular/single) ou derivado por competência (DUO).
   */
  conteudosPorSemana?: number;
  /**
   * Piloto: mapeia semana → semana cujo CALENDÁRIO ela herda. Ex.: {3: 2}
   * faz o slot de fechamento (sem 3) liberar junto com a sem 2 (dia 7) —
   * o gate real vira a PROGRESSÃO ("anterior concluída"), não o calendário.
   * undefined (todos os outros modos) = calendário vanilla, zero mudança.
   */
  semanaEspelhoCalendario?: Record<number, number>;
  /**
   * Arguição conversacional no fechamento (a "defesa oral" da resposta ao
   * Cenário B). Depois das 4 perguntas fixas, a IA sonda a resposta por até
   * `maxTurnos` turnos — expõe profundidade ou fragilidade que o escrito não
   * captura. `ativa:false` (ou undefined) = fechamento SEM arguição, byte-igual
   * ao atual. Fusão da nota (Fase B) e UI (Fase C) vêm depois; aqui só o motor.
   */
  arguicao?: { ativa: boolean; maxTurnos: number };
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
  // Fase D+ (03/07): arguição LIGADA no regular (single) — validada no piloto.
  arguicao: { ativa: true, maxTurnos: 8 },
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
  // Fase D+ (03/07): arguição LIGADA no onboarding (maxTurnos 6, janela mais
  // curta pra recém-formados). Todos os modos agora ON.
  arguicao: { ativa: true, maxTurnos: 6 },
}) as ProgramaConfig;

/**
 * Regular DUO: mesma profundidade do Regular (14 semanas, nível-meta 3),
 * com 2 competências em paralelo nas semanas de conteúdo.
 *
 * Modelo "entrega dupla": cada semana de conteúdo recebe duas entregas
 * (segunda e terça), uma por competência. As missões 4/8/12 são
 * INTEGRADORAS das duas (complexidade crescente: simples → intermediário
 * → completo).
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
  // Fase D+ (03/07): arguição LIGADA no Regular DUO (default global) — validada
  // no piloto. Onboarding segue OFF (modo à parte; ligar sob demanda).
  arguicao: { ativa: true, maxTurnos: 8 },
}) as ProgramaConfig;

/**
 * Piloto: degustação de 2 semanas, 1 competência, 4 conteúdos (2/semana,
 * cada um sobre 1 descritor DISTINTO — top-4 por gap). Objetivo é rodar o
 * FLUXO inteiro (diagnóstico completo → conteúdo → fechamento com cenário
 * + avaliação IA), NÃO demonstrar evolução na competência.
 *
 * Estrutura do plano (3 entradas, "2 semanas" de calendário):
 *   1, 2 — conteúdo, 2 entregas cada (conteudosPorSemana=2), resolvidas
 *          pela via EXISTENTE (formato-core por preferência×taxa + opcionais)
 *   3    — fechamento (Cenário B + scorer). CALENDÁRIO espelhado na sem 2
 *          (semanaEspelhoCalendario {3:2}): libera assim que os 2 conteúdos
 *          da sem 2 concluem (gate de progressão), sem esperar dia 14.
 *
 * Acumulada (single-comp) roda em background ao concluir a sem 2 e persiste
 * na row da sem 2 (semanaAcumulada=2) — NÃO há semana de conversa qualitativa.
 * Sem missões. O fechamento do piloto carimba spec_version 'piloto-v1' e
 * aplica a trava de piso (nota_pos_exibido ≥ baseline) SÓ nesse caminho.
 */
export const PROGRAMA_PILOTO: ProgramaConfig = Object.freeze({
  modo: 'piloto',
  semanas: 3,
  semanasMissao: [],
  semanasAvaliacao: [3],
  semanaCenarioB: 3,
  semanaAcumulada: 2, // persistência do acumulado; NÃO é semana de conversa
  slotsConteudo: [1, 2],
  blocosCobertos: {},
  complexidadeMap: {},
  nivelMetaAlvo: 3,
  numCompetencias: 1,
  conteudosPorSemana: 2,
  semanaEspelhoCalendario: { 3: 2 },
  // Fase D (03/07): arguição LIGADA no piloto — testbed de degustação (2 sem).
  // Regular/DUO/onboarding seguem OFF até validar aqui. 4 turnos (janela curta).
  arguicao: { ativa: true, maxTurnos: 4 },
}) as ProgramaConfig;

/**
 * Rótulos persistíveis de modo (colaboradores.programa_modo e
 * trilhas.programa_modo — migrations 154/182). Distintos de ProgramaModo:
 * 'regular' ambíguo vira 'regular_duo' | 'regular_single'. 'custom' = builder
 * de degustação — a config NÃO vem de constante: geração deriva de
 * `sys_config.programa_custom` e o runtime lê o snapshot
 * `trilhas.programa_config` (ver lib/season-engine/programa-custom.ts).
 */
export type ProgramaModoLabel = 'regular_duo' | 'regular_single' | 'onboarding' | 'piloto' | 'custom';

/**
 * Mapeia um rótulo de modo → template. Desconhecido/ausente → DUO
 * (fail-safe do default global, mesmo contrato do sys_config).
 * ⚠️ 'custom' NÃO resolve aqui (não há constante) — geração e runtime tratam
 * o label ANTES de chamar esta função (trilha-core / resolverConfigDaTrilha).
 */
export function getProgramaConfigByModo(modo?: string | null): ProgramaConfig {
  if (modo === 'onboarding') return PROGRAMA_ONBOARDING;
  if (modo === 'regular_single') return PROGRAMA_REGULAR;
  if (modo === 'piloto') return PROGRAMA_PILOTO;
  return PROGRAMA_REGULAR_DUO;
}

/**
 * Resolve a config a partir do `sys_config` JSONB de uma empresa.
 *
 * Default GLOBAL = Regular DUO (2 competências). Escape hatches por
 * `sys_config.programa_modo`:
 *   - 'onboarding'      → PROGRAMA_ONBOARDING (10 sem, 5 comps, espiral)
 *   - 'regular_single'  → PROGRAMA_REGULAR (1 comp aprofundada — rollback
 *                         sem mexer em código, caso um cliente precise)
 *   - 'piloto'          → PROGRAMA_PILOTO (degustação 2 sem, 1 comp, 4 conteúdos)
 *   - ausente / outro   → PROGRAMA_REGULAR_DUO
 */
export function getProgramaConfig(sysConfig?: { programa_modo?: string } | null): ProgramaConfig {
  return getProgramaConfigByModo(sysConfig?.programa_modo);
}

/**
 * FONTE ÚNICA da precedência de GERAÇÃO: override do colaborador →
 * default da empresa → 'regular_duo'. Retorna o RÓTULO resolvido (o que
 * a geração carimba em trilhas.programa_modo) — nunca resolva o modo de
 * outro jeito, senão o carimbo e o plano podem divergir.
 */
export function resolverModoColab(
  colab?: { programa_modo?: string | null } | null,
  sysConfig?: { programa_modo?: string } | null,
): ProgramaModoLabel {
  const bruto = colab?.programa_modo || sysConfig?.programa_modo;
  if (bruto === 'onboarding' || bruto === 'regular_single' || bruto === 'piloto' || bruto === 'custom') return bruto;
  if (bruto === 'regular_duo' || bruto === 'regular') return 'regular_duo';
  return 'regular_duo';
}

/**
 * FONTE ÚNICA do RUNTIME: config da trilha pelo CARIMBO (trilhas.programa_modo,
 * gravado na geração — congela as regras). Trilha legada sem carimbo →
 * fallback pro sys_config da empresa (comportamento pré-154).
 */
export function getProgramaConfigDaTrilha(
  trilha?: { programa_modo?: string | null } | null,
  sysConfig?: { programa_modo?: string } | null,
): ProgramaConfig {
  if (trilha?.programa_modo) return getProgramaConfigByModo(trilha.programa_modo);
  return getProgramaConfig(sysConfig);
}

/**
 * Semana cujo CALENDÁRIO governa a liberação de `semana`. Nos modos sem
 * espelho (todos exceto piloto) devolve a própria semana — comportamento
 * vanilla inalterado. Usar SEMPRE que for chamar semanaLiberadaPorData.
 */
export function semanaCalendario(config: ProgramaConfig, semana: number): number {
  return config.semanaEspelhoCalendario?.[semana] ?? semana;
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
