/**
 * Monta o plano de N semanas (default 14) a partir dos descritores selecionados,
 * resolvendo o conteúdo (formato_core conforme prioridade do colaborador)
 * e gerando desafios + cenários via Claude.
 *
 * Duração, semanas de missão, semanas de avaliação e complexidade vêm de
 * `ProgramaConfig` (default = PROGRAMA_REGULAR — comportamento de 14 sem).
 */

import { createSupabaseAdmin } from '@/lib/supabase';
import { callAI } from '@/actions/ai-client';
import { promptDesafio, parseDesafioResponse } from '@/lib/season-engine/prompts/challenge';
import { promptCenario, parseCenarioResponse, cenarioToMarkdown } from '@/lib/season-engine/prompts/scenario';
import { promptMissao, parseMissaoResponse, missaoToMarkdown } from '@/lib/season-engine/prompts/missao';
import type { SelectedDescriptor } from './select-descriptors';
import { PROGRAMA_REGULAR, descritoresCobertosNaMissao, type ProgramaConfig } from './programa-config';
import type { BlueprintBindingSemana } from '@/lib/blueprint/to-descriptors';

interface MicroConteudo {
  id: string;
  titulo: string;
  url?: string | null;
  formato: string;
  competencia: string;
  descritor?: string;
  cargo?: string | null;
  empresa_id?: string | null;
  /** Preenchido = conteúdo de KIT (escrito p/ UM DISC) → entregue só pelo overlay. */
  kit_id?: string | null;
  /** 1ª letra do DISC do kit de origem (denormalização da mig 142) — sobrevive ao SET NULL de kit_id (F-I4). */
  disc?: string | null;
  ativo: boolean;
  versao?: number;
  taxa_conclusao?: number | null;
  impacto_amostras?: number | null;
  impacto_medio_delta?: number | null;
}

interface SemanaConteudo {
  semana: number;
  tipo: 'conteudo';
  competencia?: string;
  descritor: string | null;
  descritores_cobertos: string[];
  nivel_alvo?: number;
  nivel_atual?: number;
  conteudo?: {
    formato_core: string | null;
    core_id: string | null;
    core_reuso: boolean;
    core_titulo: string;
    core_url: string | null;
    desafio_texto: string;
    acao_observavel?: string;
    criterio_de_execucao?: string;
    por_que_cabe_na_semana?: string;
    formatos_disponiveis: Record<string, { id: string; url: string | null | undefined; titulo: string }>;
    fallback_gerado: boolean;
  };
  conteudos_dia?: Array<{
    dia: 'segunda' | 'terca';
    label: string;
    competencia?: string;
    descritor: string | null;
    nivel_alvo?: number;
    nivel_atual?: number;
    conteudo?: SemanaConteudo['conteudo'];
  }>;
  status: 'disponivel' | 'bloqueada';
}

interface SemanaAplicacao {
  semana: number;
  tipo: 'aplicacao';
  competencias_cobertas?: string[];
  descritor: null;
  descritores_cobertos: string[];
  missao?: {
    texto: string;
    acao_principal?: string;
    contexto_de_aplicacao?: string;
    criterio_de_execucao?: string;
    integracao_descritores?: { descritor: string; como_aparece: string }[];
  };
  cenario?: {
    texto: string;
    complexidade: string;
    tensao_central?: string;
    tradeoff_testado?: string;
    armadilha_resposta_generica?: string;
    stakeholders?: string[];
  };
  status: 'disponivel' | 'bloqueada';
}

interface SemanaAvaliacao {
  semana: number;
  tipo: 'avaliacao';
  descritor: null;
  descritores_cobertos: string[];
  /**
   * Piloto: semana cujo CALENDÁRIO governa a liberação deste slot (espelho).
   * Fica gravado NO PLANO (snapshot = contrato) pra UI e rotas não dependerem
   * de re-resolver a config. Ausente nos demais modos.
   */
  calendario_semana?: number;
  status: 'disponivel' | 'bloqueada';
}

/**
 * Binding com o PDI (Fase 1, Estágio 3): quando a trilha é dirigida pelo
 * blueprint, cada semana carrega o objetivo pedagógico e a ação do PDI que ela
 * sustenta. Opcional/aditivo — ausente no caminho legado (backward-compat).
 */
export type SemanaPlan = (SemanaConteudo | SemanaAplicacao | SemanaAvaliacao) & BlueprintBindingSemana;

export interface AIConfigOpt {
  model?: string;
}

export interface BuildSeasonInput {
  descritoresSelecionados: SelectedDescriptor[];
  /** Competência principal (regular) ou competência "âncora" (onboarding). */
  competencia: string;
  /** Multi-competência: array ordenado (Onboarding tem 5 itens). */
  competencias?: string[];
  cargo: string;
  contexto?: string;
  prioridadeFormatos?: string[];
  empresaId?: string | null;
  aiConfig?: AIConfigOpt;
  programaConfig?: ProgramaConfig;
  /**
   * Fase 1, Estágio 3: quando presente, a trilha é DIRIGIDA pelo blueprint —
   * cada semana recebe o binding com o PDI, e as semanas de conteúdo renderizam
   * as N entregas dos descritores da semana (mesma OU 2 competências), sem o
   * agrupamento por competência do caminho DUO paralelo. Ausente = comportamento
   * legado (paralelo/single), byte-igual ao atual.
   */
  blueprintBinding?: Record<number, BlueprintBindingSemana>;
}

/**
 * Score composto de um micro-conteúdo pra ranking de recomendação.
 *   - 70% impacto_medio_delta (normalizado 0-1 em escala 0-1.5 de delta)
 *   - 30% taxa_conclusao
 * Com menos de 5 amostras de impacto, usa só taxa_conclusao (dado insuficiente).
 */
const normCargoStr = (s?: string | null) => String(s || '').trim().toLowerCase();

/** True se o conteúdo é do CARGO alvo (comparação normalizada). */
export function ehMesmoCargo(cargoConteudo?: string | null, cargoAlvo?: string | null): boolean {
  return normCargoStr(cargoConteudo) === normCargoStr(cargoAlvo);
}

/**
 * REGRA DE ISOLAMENTO POR CARGO: competência é ÚNICA POR CARGO (Autocuidado de
 * Coordenação ≠ de Gestão Escolar). Retorna só os conteúdos SERVÍVEIS a `cargoAlvo`
 * — os do próprio cargo + os genéricos (cargo null/''/'todos') — descartando os de
 * QUALQUER outro cargo específico. É o que impede vazamento de conteúdo entre cargos.
 */
/**
 * SELEÇÃO do conteúdo de uma semana — PURA (recebe os candidatos já buscados).
 *
 * Extraída de `montarSemanaConteudo` para ter UMA implementação só: scripts de
 * manutenção (ex.: reparar `core_id` órfão num plano gravado) precisam escolher o
 * MESMO conteúdo que o motor escolheria. Reimplementar o scoring num script é a
 * origem da classe de bug "título ≠ blocos" (campos derivados dessincronizados).
 *
 * Aplica, nesta ordem: (1) fora conteúdo de KIT (`conteudosDoBuild` — é DISC-específico,
 * entregue só pelo overlay), (2) fora cargo alheio (`conteudosServiveisPorCargo`),
 * (3) prefere match do descritor e ids não usados, (4) dentro de cada formato escolhe
 * MESMO CARGO > score > versão. `formatoCore` segue `prioridadeFormatos` do colaborador.
 */
export function selecionarConteudoDaSemana(
  candidatos: MicroConteudo[],
  opts: { cargo: string; descritor: string; prioridadeFormatos: string[]; idsJaUsados?: Set<string> },
): { pool: MicroConteudo[]; formatosDisponiveis: Record<string, MicroConteudo>; formatoCore: string | null; coreContent: MicroConteudo | null } {
  const { cargo, descritor, prioridadeFormatos } = opts;
  const idsJaUsados = opts.idsJaUsados ?? new Set<string>();

  // REGRA: competência é ÚNICA POR CARGO — nunca servir conteúdo de OUTRO cargo
  // específico (Autocuidado de Coordenação ≠ de Gestão Escolar, mesmo nome).
  // + REGRA: conteúdo de KIT nunca sai daqui (é de UM DISC; quem entrega é o overlay).
  const permitidos = conteudosServiveisPorCargo(conteudosDoBuild(candidatos || []), cargo);
  const mesmoCargo = (c: MicroConteudo) => ehMesmoCargo(c.cargo, cargo);

  const matchDescritor = permitidos.filter((c) => c.descritor === descritor);
  const poolDescDisp = matchDescritor.filter((c) => !idsJaUsados.has(c.id));
  const poolCompDisp = permitidos.filter((c) => !idsJaUsados.has(c.id));
  const pool: MicroConteudo[] = poolDescDisp.length > 0
    ? poolDescDisp
    : (poolCompDisp.length > 0 ? poolCompDisp : (matchDescritor.length > 0 ? matchDescritor : permitidos));

  // Dentro de cada formato, escolhe o melhor: MESMO CARGO antes de genérico, depois SCORE.
  const formatosDisponiveis: Record<string, MicroConteudo> = {};
  const ordenadoPorQualidade = [...pool].sort((a, b) => {
    const ca = mesmoCargo(a) ? 0 : 1;
    const cb = mesmoCargo(b) ? 0 : 1;
    if (ca !== cb) return ca - cb;
    const scoreA = computarScoreConteudo(a);
    const scoreB = computarScoreConteudo(b);
    if (scoreB !== scoreA) return scoreB - scoreA;
    return (b.versao || 0) - (a.versao || 0);
  });
  for (const c of ordenadoPorQualidade) {
    if (!formatosDisponiveis[c.formato]) formatosDisponiveis[c.formato] = c;
  }

  const formatoCore: string | null = prioridadeFormatos.find((f) => formatosDisponiveis[f]) || null;
  const coreContent: MicroConteudo | null = formatoCore ? formatosDisponiveis[formatoCore] : null;
  return { pool, formatosDisponiveis, formatoCore: coreContent ? formatoCore : 'texto', coreContent };
}

/**
 * REPARO de core órfão/stale num slot de conteúdo JÁ GRAVADO no plano
 * (F-I2 do docs/FMEA-PIPELINE.md). Usado por `regerarSemana`.
 *
 * Critério de órfão/stale, por entrega da semana: `core_id` ausente
 * (fallback_gerado — o build não achou conteúdo na época) OU apontando pra um
 * micro_conteudo que saiu do pool servível (dedup/delete/desativação — o motor
 * não serviria mais aquele id). SÓ nesse caso re-seleciona — e sempre por
 * `selecionarConteudoDaSemana`, a MESMA função do motor: reimplementar o
 * scoring aqui recria a classe de bug "título ≠ blocos". Core ainda válido
 * NUNCA é trocado — regerar não pode trocar o conteúdo que a pessoa já viu.
 *
 * Os campos do desafio (desafio_texto, acao_observavel, ...) NÃO são tocados —
 * são da etapa de IA de regerarSemana. Retorna quantas entregas foram reparadas.
 */
export async function repararCoreOrfaoDaSemana(
  sb: any,
  slot: any,
  opts: { cargo: string; prioridadeFormatos: string[]; empresaId?: string | null },
): Promise<{ reparados: number }> {
  if (slot?.tipo !== 'conteudo') return { reparados: 0 };
  const { cargo, prioridadeFormatos, empresaId = null } = opts;

  // Entregas da semana: shape DUO/piloto (conteudos_dia, 1 por descritor) ou
  // single (conteudo no topo). Cada entrega tem competencia/descritor próprios.
  const entradas: any[] = Array.isArray(slot.conteudos_dia) && slot.conteudos_dia.length
    ? slot.conteudos_dia
    : (slot.conteudo ? [slot] : []);
  if (!entradas.length) return { reparados: 0 };

  // Ids que já servem a semana — o reparo não repete o mesmo conteúdo nas 2 pílulas.
  const idsEmUso = new Set<string>();
  for (const e of entradas) if (e.conteudo?.core_id) idsEmUso.add(e.conteudo.core_id);

  let reparados = 0;
  for (const e of entradas) {
    const cont = e.conteudo;
    if (!cont) continue;
    const competencia = e.competencia || slot.competencia;
    const descritor = e.descritor || slot.descritor;
    if (!competencia || !descritor) continue;

    // Pool servível HOJE (mesma query do build: ativo, fora de kit, da
    // competência, visível pra empresa). core_id presente aqui = o motor AINDA
    // o serviria → válido, não troca.
    let q = sb.from('micro_conteudos').select('*')
      .eq('ativo', true)
      .is('kit_id', null)
      .eq('competencia', competencia);
    if (empresaId) q = q.or(`empresa_id.eq.${empresaId},empresa_id.is.null`);
    else q = q.is('empresa_id', null);
    const { data: poolRows } = await q;
    const pool = (poolRows || []) as MicroConteudo[];

    const coreId = cont.core_id as string | null | undefined;
    if (coreId && pool.some((c) => c.id === coreId)) continue;

    // Recorte por nível como montarSemanaConteudo (fallback: pool inteiro).
    const nivelMedio = (Number(e.nivel_atual ?? slot.nivel_atual ?? 1.5) + 3.0) / 2;
    const comNivel = pool.filter((c: any) => (c.nivel_min ?? -Infinity) <= nivelMedio && (c.nivel_max ?? Infinity) >= nivelMedio);
    const candidatos = comNivel.length > 1 ? comNivel : pool;

    const sel = selecionarConteudoDaSemana(candidatos, {
      cargo, descritor, prioridadeFormatos,
      idsJaUsados: new Set([...idsEmUso].filter((id) => id !== coreId)),
    });
    const { formatosDisponiveis, coreContent } = sel;
    if (coreId) idsEmUso.delete(coreId);
    if (coreContent) idsEmUso.add(coreContent.id);

    e.conteudo = {
      ...cont, // desafio_* etc. são da etapa de IA — preservados
      formato_core: sel.formatoCore,
      core_id: coreContent?.id || null,
      core_reuso: false,
      core_titulo: coreContent?.titulo || cont.core_titulo,
      core_url: coreContent?.url || null,
      formatos_disponiveis: Object.fromEntries(
        Object.entries(formatosDisponiveis).map(([f, c]) => [f, { id: c.id, url: c.url, titulo: c.titulo }])
      ),
      fallback_gerado: !coreContent,
    };
    reparados++;
  }

  // Shape DUO/piloto: o conteudo do TOPO espelha a 1ª entrega (invariante do
  // build — após o round-trip JSONB são cópias independentes). Re-sincroniza SÓ
  // os campos de seleção: desafio_texto & cia no topo podem ter acabado de ser
  // regerados por IA (regerarSemana) e não podem ser sobrescritos pelo espelho.
  if (reparados > 0 && Array.isArray(slot.conteudos_dia) && slot.conteudos_dia.length && slot.conteudo) {
    const primeiro = slot.conteudos_dia[0]?.conteudo;
    if (primeiro && primeiro !== slot.conteudo) {
      for (const k of ['formato_core', 'core_id', 'core_reuso', 'core_titulo', 'core_url', 'formatos_disponiveis', 'fallback_gerado']) {
        slot.conteudo[k] = primeiro[k];
      }
    }
  }
  return { reparados };
}

/**
 * INVARIANTE: conteúdo de KIT (`kit_id` preenchido) é escrito para UM perfil DISC e é
 * entregue EXCLUSIVAMENTE pelo overlay (`overlayKitNaSemana`), que resolve por
 * (DISC × cargo) na LEITURA. O buildSeason é CEGO A DISC — se servir conteúdo de kit,
 * entrega o perfil de outra pessoa. O overlay só corrige quando existe kit do DISC de
 * quem lê; com cobertura parcial de DISC, escapa (medido: 23 de 648 entregas no
 * Ibipeba, 16/07). Irmã de `conteudosServiveisPorCargo` — mesma classe de isolamento.
 *
 * F-I4: `kit_id` é FK ON DELETE SET NULL (mig 142) — deletar/regerar o kit apaga o
 * vínculo e o conteúdo DISC-específico virava "genérico" e voltava ao pool. Por isso
 * o filtro é DUPLO: `kit_id` (kit vivo) OU `disc` (denormalização gravada no insert,
 * que NÃO é FK e sobrevive ao SET NULL) preenchidos → fora do build.
 */
export function conteudosDoBuild<T extends { kit_id?: string | null; disc?: string | null }>(itens: T[]): T[] {
  return (itens || []).filter((c) => !c.kit_id && !c.disc);
}

export function conteudosServiveisPorCargo<T extends { cargo?: string | null }>(
  itens: T[], cargoAlvo?: string | null,
): T[] {
  const alvo = normCargoStr(cargoAlvo);
  return itens.filter((c) => {
    const cc = normCargoStr(c.cargo);
    return cc === alvo || cc === '' || cc === 'todos';
  });
}

function computarScoreConteudo(c: MicroConteudo): number {
  const taxa = c.taxa_conclusao ?? 0;
  const amostras = c.impacto_amostras ?? 0;
  const delta = c.impacto_medio_delta ?? null;
  if (amostras < 5 || delta == null) return taxa;
  const deltaNorm = Math.max(0, Math.min(1, delta / 1.5));
  return 0.7 * deltaNorm + 0.3 * taxa;
}

export async function buildSeason({
  descritoresSelecionados,
  competencia,
  competencias,
  cargo,
  contexto = 'generico',
  prioridadeFormatos = ['video', 'texto', 'audio', 'case'],
  empresaId = null,
  aiConfig = {},
  programaConfig = PROGRAMA_REGULAR,
  blueprintBinding,
}: BuildSeasonInput): Promise<SemanaPlan[]> {
  const semanas: SemanaPlan[] = [];
  const blueprintDriven = !!blueprintBinding;
  // Multi-comp dispara quando há mapa semana→comp (Onboarding espiral) OU
  // missões integradoras configuradas (Regular DUO) — sempre com >1 comp.
  const isMulti = (!!programaConfig.semanaParaCompetenciaIdx || !!programaConfig.competenciasNaMissao)
    && Array.isArray(competencias) && competencias.length > 1;
  const compsArray: string[] = isMulti ? competencias! : [competencia];

  // Mapeia semana → descritor (a partir de descritoresSelecionados)
  const semanaParaDescritores: Record<number, SelectedDescriptor[]> = {};
  for (const d of descritoresSelecionados) {
    for (const s of d.semanas_ids) {
      if (!semanaParaDescritores[s]) semanaParaDescritores[s] = [];
      semanaParaDescritores[s].push(d);
    }
  }

  const idsJaUsados = new Set<string>();
  for (let semana = 1; semana <= programaConfig.semanas; semana++) {
    let plan: SemanaPlan;
    if (programaConfig.semanasMissao.includes(semana)) {
      plan = await montarSemanaAplicacao(semana, descritoresSelecionados, competencia, cargo, contexto, aiConfig, programaConfig, compsArray);
    } else if (programaConfig.semanasAvaliacao.includes(semana)) {
      const espelho = programaConfig.semanaEspelhoCalendario?.[semana];
      plan = {
        semana,
        tipo: 'avaliacao',
        descritor: null,
        descritores_cobertos: descritoresSelecionados.map(d => d.descritor),
        ...(espelho != null ? { calendario_semana: espelho } : {}),
        status: 'bloqueada',
      };
    } else {
      const descritoresDaSemana = semanaParaDescritores[semana] || [];
      if (descritoresDaSemana.length === 0) {
        plan = {
          semana,
          tipo: 'conteudo',
          descritor: null,
          descritores_cobertos: [],
          status: 'bloqueada',
        };
      } else if (isPilotoContentWeek(programaConfig)) {
        // Piloto: N entregas na MESMA competência (1 descritor DISTINTO cada),
        // resolvidas pela via existente (formato-core + opcionais). Mesmo shape
        // conteudos_dia do DUO → UI/reflection/kit-overlay funcionam sem mudança.
        const ordenados = descritoresDaSemana.slice(0, programaConfig.conteudosPorSemana);
        // Invariante: cada semana de conteúdo do piloto deve ter conteudosPorSemana
        // descritores (distribuição 2+2). Se vier menos, avisa ALTO (não degrada
        // em silêncio) — a semana sai com o que há, na shape piloto.
        if (ordenados.length < (programaConfig.conteudosPorSemana || 1)) {
          console.warn(`[piloto] semana ${semana}: ${ordenados.length} descritor(es) para ${programaConfig.conteudosPorSemana} entregas esperadas — distribuição incompleta.`);
        }
        const entregas: NonNullable<SemanaConteudo['conteudos_dia']> = [];

        for (const [idx, d] of ordenados.entries()) {
          const compDaEntrega = d.competencia || competencia;
          const entrega = await montarSemanaConteudo(semana, d, compDaEntrega, cargo, contexto, prioridadeFormatos, empresaId, aiConfig, idsJaUsados);
          if (entrega.conteudo?.core_id) idsJaUsados.add(entrega.conteudo.core_id);
          entregas.push({
            dia: idx === 0 ? 'segunda' : 'terca',
            label: `Pílula ${idx + 1}`,
            competencia: compDaEntrega,
            descritor: entrega.descritor,
            nivel_alvo: entrega.nivel_alvo,
            nivel_atual: entrega.nivel_atual,
            conteudo: entrega.conteudo,
          });
        }

        const primeiro = entregas[0];
        plan = {
          semana,
          tipo: 'conteudo',
          competencia,
          descritor: primeiro?.descritor || null,
          descritores_cobertos: entregas.map(e => e.descritor).filter(Boolean) as string[],
          nivel_alvo: 3.0,
          nivel_atual: primeiro?.nivel_atual,
          conteudo: primeiro?.conteudo,
          conteudos_dia: entregas,
          status: 'bloqueada',
        };
      } else if (blueprintDriven) {
        // Semana de conteúdo DIRIGIDA pelo blueprint: renderiza as N entregas
        // dos descritores que o blueprint alocou nesta semana (mesma OU 2
        // competências, na ordem sequencial do blueprint), SEM o agrupamento
        // por competência do DUO paralelo. Mesma shape conteudos_dia → UI/kit/
        // reflection funcionam sem mudança. Descritores já vêm na ordem do
        // blueprint (semanaParaDescritores preserva a ordem de descritoresSelecionados).
        const ordenados = descritoresDaSemana.slice(0, 2);
        const entregas: NonNullable<SemanaConteudo['conteudos_dia']> = [];

        for (const [idx, d] of ordenados.entries()) {
          const compDaEntrega = d.competencia || competencia;
          const entrega = await montarSemanaConteudo(semana, d, compDaEntrega, cargo, contexto, prioridadeFormatos, empresaId, aiConfig, idsJaUsados);
          if (entrega.conteudo?.core_id) idsJaUsados.add(entrega.conteudo.core_id);
          entregas.push({
            dia: idx === 0 ? 'segunda' : 'terca',
            label: `Pílula ${idx + 1}`,
            competencia: compDaEntrega,
            descritor: entrega.descritor,
            nivel_alvo: entrega.nivel_alvo,
            nivel_atual: entrega.nivel_atual,
            conteudo: entrega.conteudo,
          });
        }

        const primeiro = entregas[0];
        // Competência da semana = comps distintas das entregas (1 → mono; 2 → duo).
        const compsDistintas = [...new Set(entregas.map(e => e.competencia).filter(Boolean))] as string[];
        plan = {
          semana,
          tipo: 'conteudo',
          competencia: compsDistintas.join(' + ') || competencia,
          descritor: primeiro?.descritor || null,
          descritores_cobertos: entregas.map(e => e.descritor).filter(Boolean) as string[],
          nivel_alvo: 3.0,
          nivel_atual: primeiro?.nivel_atual,
          conteudo: primeiro?.conteudo,
          // 1 entrega → sem conteudos_dia (shape single); 2 → conteudos_dia (shape duo).
          ...(entregas.length > 1 ? { conteudos_dia: entregas } : {}),
          status: 'bloqueada',
        };
      } else if (isRegularDuoContentWeek(programaConfig, compsArray, descritoresDaSemana)) {
        const ordenados = [...descritoresDaSemana]
          .sort((a, b) => compsArray.indexOf(a.competencia || '') - compsArray.indexOf(b.competencia || ''))
          .slice(0, 2);
        const entregas: NonNullable<SemanaConteudo['conteudos_dia']> = [];

        for (const [idx, d] of ordenados.entries()) {
          const compDaEntrega = d.competencia || competencia;
          const entrega = await montarSemanaConteudo(semana, d, compDaEntrega, cargo, contexto, prioridadeFormatos, empresaId, aiConfig, idsJaUsados);
          if (entrega.conteudo?.core_id) idsJaUsados.add(entrega.conteudo.core_id);
          entregas.push({
            dia: idx === 0 ? 'segunda' : 'terca',
            label: `Pílula ${idx + 1}`,
            competencia: compDaEntrega,
            descritor: entrega.descritor,
            nivel_alvo: entrega.nivel_alvo,
            nivel_atual: entrega.nivel_atual,
            conteudo: entrega.conteudo,
          });
        }

        const primeiro = entregas[0];
        plan = {
          semana,
          tipo: 'conteudo',
          competencia: compsArray.join(' + '),
          descritor: primeiro?.descritor || null,
          descritores_cobertos: entregas.map(e => e.descritor).filter(Boolean) as string[],
          nivel_alvo: 3.0,
          nivel_atual: primeiro?.nivel_atual,
          conteudo: primeiro?.conteudo,
          conteudos_dia: entregas,
          status: 'bloqueada',
        };
      } else {
        // Em multi-competência, cada descritor pertence a uma competência específica
        const d = descritoresDaSemana[0];
        const compDaSemana = d.competencia || competencia;
        plan = await montarSemanaConteudo(semana, d, compDaSemana, cargo, contexto, prioridadeFormatos, empresaId, aiConfig, idsJaUsados);
        if (plan.tipo === 'conteudo' && plan.conteudo?.core_id) idsJaUsados.add(plan.conteudo.core_id);
      }
    }
    // Binding com o PDI (Estágio 3): carrega objetivo da semana + ação do PDI
    // que ela sustenta. Cobre TODAS as semanas (conteúdo/missão/avaliação).
    const bind = blueprintBinding?.[semana];
    if (bind) {
      if (bind.objetivo_da_semana) plan.objetivo_da_semana = bind.objetivo_da_semana;
      if (bind.conexao_com_pdi) plan.conexao_com_pdi = bind.conexao_com_pdi;
      if (bind.acao_pdi) plan.acao_pdi = bind.acao_pdi;
    }
    plan.status = semana === 1 ? 'disponivel' : 'bloqueada';
    semanas.push(plan);
  }

  return semanas;
}

function isPilotoContentWeek(
  programaConfig: ProgramaConfig,
): boolean {
  // Só o Piloto define conteudosPorSemana > 1 — nos demais modos a chave é
  // undefined e este branch nunca dispara (garantia por construção). Chave é a
  // CONFIG, não a contagem de descritores: o caso length===0 já vira 'bloqueada'
  // antes, e uma semana com 1 descritor (redistribuição futura) segue no branch
  // piloto (mesma shape) com aviso — em vez de degradar em silêncio pro single.
  return (programaConfig.conteudosPorSemana || 1) > 1;
}

function isRegularDuoContentWeek(
  programaConfig: ProgramaConfig,
  competencias: string[],
  descritoresDaSemana: SelectedDescriptor[],
): boolean {
  return !programaConfig.semanaParaCompetenciaIdx
    && !!programaConfig.competenciasNaMissao
    && competencias.length === 2
    && new Set(descritoresDaSemana.map(d => d.competencia).filter(Boolean)).size >= 2;
}

async function montarSemanaConteudo(
  semana: number,
  descritorSel: SelectedDescriptor,
  competencia: string,
  cargo: string,
  contexto: string,
  prioridadeFormatos: string[],
  empresaId: string | null,
  aiConfig: AIConfigOpt,
  idsJaUsados: Set<string> = new Set(),
): Promise<SemanaConteudo> {
  const sb = createSupabaseAdmin();
  const nivelMedio = (descritorSel.nota_atual + 3.0) / 2;

  // Busca conteúdos pra esse descritor com fallback gradual.
  // ⚠️ `kit_id IS NULL AND disc IS NULL`: conteúdo de KIT é específico de UM DISC e
  // é entregue SÓ pelo overlay (overlayKitNaSemana, que resolve por DISC×cargo na
  // LEITURA). Este build é CEGO A DISC — sem o filtro ele enxerga os micro_conteudos
  // do kit (mesma tabela, com competencia/descritor/cargo preenchidos), escolhe por
  // score e serve o conteúdo de OUTRO perfil. O overlay só conserta quando existe kit
  // do DISC da pessoa; com cobertura parcial, escapava. Medido no Ibipeba: 23 de 648
  // entregas liam o DISC errado. Mesma classe do vazamento por CARGO
  // (conteudosServiveisPorCargo, 4faa0130).
  // F-I4: `kit_id` é FK ON DELETE SET NULL — sem o 2º filtro, o conteúdo de um kit
  // deletado/regerado (órfão) voltava ao pool; a coluna `disc` (denormalização da
  // mig 142) NÃO é FK, sobrevive ao SET NULL e denuncia a origem.
  const buildQ = (withNivel: boolean) => {
    let q = sb.from('micro_conteudos').select('*')
      .eq('ativo', true)
      .is('kit_id', null)
      .is('disc', null)
      .eq('competencia', competencia);
    if (withNivel) q = q.lte('nivel_min', nivelMedio).gte('nivel_max', nivelMedio);
    if (empresaId) q = q.or(`empresa_id.eq.${empresaId},empresa_id.is.null`);
    else q = q.is('empresa_id', null);
    return q;
  };
  let { data: candidatos } = await buildQ(true);
  if (!candidatos || candidatos.length <= 1) {
    const { data: todos } = await buildQ(false);
    candidatos = todos || candidatos || [];
  }

  const candidatosTyped = (candidatos || []) as MicroConteudo[];
  const sel = selecionarConteudoDaSemana(candidatosTyped, {
    cargo, descritor: descritorSel.descritor, prioridadeFormatos, idsJaUsados,
  });
  const { formatosDisponiveis, coreContent } = sel;
  let formatoCore = sel.formatoCore;

  // DESAFIO: a fonte canônica é o KIT (sob demanda, por DISC) — o overlayKitNaSemana
  // preenche o desafio na LEITURA da semana. Aqui só deixamos um FALLBACK templated
  // (sem custo de IA), usado nas semanas ainda sem kit. Antes, o desafio era gerado
  // por IA aqui e DESCARTADO/sobrescrito pelo kit no overlay (chamada Claude jogada
  // fora). Reative a geração por IA (fallback de alta qualidade) com BUILDSEASON_DESAFIO_IA=1.
  let desafioTexto = `Aplique ${descritorSel.descritor} em uma situação real esta semana e observe o resultado.`;
  let acaoObservavel: string | undefined;
  let criterioExecucao: string | undefined;
  let porQueCabe: string | undefined;
  if (process.env.BUILDSEASON_DESAFIO_IA === '1') {
    try {
      const { system, user } = promptDesafio({
        competencia,
        descritor: descritorSel.descritor,
        nivel: descritorSel.nota_atual,
        cargo,
        contexto,
        semana,
      });
      const rawResp = await callAI(system, user, aiConfig, 400);
      const parsed = parseDesafioResponse(rawResp);
      if (parsed) {
        desafioTexto = parsed.desafio_texto;
        acaoObservavel = parsed.acao_observavel;
        criterioExecucao = parsed.criterio_de_execucao;
        porQueCabe = parsed.por_que_cabe_na_semana;
      } else if (rawResp.trim()) {
        desafioTexto = rawResp.trim();
      }
    } catch (err: any) {
      console.warn(`[buildSeason] desafio IA sem ${semana}: ${err?.message ?? err} — usando fallback templated`);
    }
  }

  const reused = !!(coreContent && idsJaUsados.has(coreContent.id));
  return {
    semana,
    tipo: 'conteudo',
    competencia,
    descritor: descritorSel.descritor,
    descritores_cobertos: [descritorSel.descritor],
    nivel_alvo: 3.0,
    nivel_atual: descritorSel.nota_atual,
    conteudo: {
      formato_core: formatoCore,
      core_id: coreContent?.id || null,
      core_reuso: reused,
      core_titulo: (reused ? '[Continuação] ' : '') + (coreContent?.titulo || `Episódio ${semana}: ${descritorSel.descritor}`),
      core_url: coreContent?.url || null,
      desafio_texto: desafioTexto,
      acao_observavel: acaoObservavel,
      criterio_de_execucao: criterioExecucao,
      por_que_cabe_na_semana: porQueCabe,
      formatos_disponiveis: Object.fromEntries(
        Object.entries(formatosDisponiveis).map(([f, c]) => [f, { id: c.id, url: c.url, titulo: c.titulo }])
      ),
      fallback_gerado: !coreContent,
    },
    status: 'bloqueada',
  };
}

/**
 * Corte "só o já entregue" da missão (regra de 28/07, decisão de produto): a
 * semana de aplicação AVALIA — e avaliação só cobra conteúdo já entregue. São
 * os descritores alocados em semanas de conteúdo ANTERIORES à missão
 * (`semanas_ids`), dentro das competências da janela. Antes, a semana 4 cobrava
 * a competência inteira — inclusive o bloco que só começava na semana 5.
 * Pura e exportada para teste — a regra de negócio vive aqui, não no prompt.
 */
export function descritoresEntreguesNaMissao<T extends { competencia?: string | null; semanas_ids?: number[] }>(
  descritores: T[],
  semana: number,
  competenciasJanela: string[],
): T[] {
  return descritores.filter((d) =>
    d.competencia && competenciasJanela.includes(d.competencia) &&
    (d.semanas_ids ?? []).some((s) => s < semana));
}

export async function montarSemanaAplicacao(
  semana: number,
  descritores: SelectedDescriptor[],
  competencia: string,
  cargo: string,
  contexto: string,
  aiConfig: AIConfigOpt,
  programaConfig: ProgramaConfig,
  competenciasArray: string[] = [competencia],
): Promise<SemanaAplicacao> {
  const complexidade = programaConfig.complexidadeMap[semana] || 'intermediario';

  // Multi-competência: missão integradora cobre competências[indices da janela]
  const indicesNaMissao = programaConfig.competenciasNaMissao?.[semana];
  let competenciasIntegradas: string[] | undefined;
  let descritoresParaMissao: SelectedDescriptor[];
  if (indicesNaMissao && competenciasArray.length > 1) {
    // Onboarding: pega competências da janela cumulativa (-1 = todas)
    const idxs = indicesNaMissao.includes(-1)
      ? competenciasArray.map((_, i) => i)
      : indicesNaMissao;
    const naJanela = idxs.map(i => competenciasArray[i]).filter(Boolean);
    // Regra (28/07, decisão de produto): a missão AVALIA — e avaliação só cobra o
    // que já foi ENTREGUE. O corte é pelos descritores alocados em semanas de
    // conteúdo ANTERIORES à missão (`semanas_ids`), NÃO pela competência inteira:
    // antes, a semana 4 já cobrava Autocuidado cujo conteúdo só chega na semana 5.
    // As competências integradas são as do corte — semana 4 vira missão de bloco
    // (1 comp), semanas 8/12 seguem integradoras (2 comps já entregues).
    descritoresParaMissao = descritoresEntreguesNaMissao(descritores, semana, naJanela);
    competenciasIntegradas = naJanela.filter(c => descritoresParaMissao.some(d => d.competencia === c));
    // Guarda: trilha sem nada entregue antes da missão (plano degenerado) cai no
    // corte antigo em vez de gerar missão sem descritor nenhum.
    if (descritoresParaMissao.length === 0) {
      descritoresParaMissao = descritoresCobertosNaMissao(descritores, semana, programaConfig);
      competenciasIntegradas = naJanela;
    }
  } else {
    // Regular: corte por blocosCobertos (3 → 6 → todos)
    descritoresParaMissao = descritoresCobertosNaMissao(descritores, semana, programaConfig);
  }

  const cobertos = descritoresParaMissao.map(d => d.descritor);
  const usaIntegrador = !!(competenciasIntegradas && competenciasIntegradas.length > 1);

  let missaoObj: SemanaAplicacao['missao'] = { texto: '' };
  let cenarioObj: SemanaAplicacao['cenario'] = { texto: '', complexidade };
  try {
    const m = promptMissao({
      competencia, descritores: cobertos, cargo, contexto,
      missaoTipo: usaIntegrador ? 'integradora' : 'unica',
      competenciasIntegradas: usaIntegrador ? competenciasIntegradas : undefined,
    });
    const c = promptCenario({
      competencia, descritores: cobertos, cargo, contexto, complexidade,
      cenarioTipo: usaIntegrador ? 'integrador' : 'unico',
      competenciasIntegradas: usaIntegrador ? competenciasIntegradas : undefined,
    });
    const [mResp, cResp] = await Promise.all([
      callAI(m.system, m.user, aiConfig, 600),
      callAI(c.system, c.user, aiConfig, 800),
    ]);

    const missaoParsed = parseMissaoResponse(mResp);
    if (missaoParsed) {
      missaoObj = {
        texto: missaoToMarkdown(missaoParsed),
        acao_principal: missaoParsed.acao_principal,
        contexto_de_aplicacao: missaoParsed.contexto_de_aplicacao,
        criterio_de_execucao: missaoParsed.criterio_de_execucao,
        integracao_descritores: missaoParsed.integracao_descritores,
      };
    } else {
      missaoObj = { texto: (mResp || '').trim() };
    }

    const cenarioParsed = parseCenarioResponse(cResp);
    if (cenarioParsed) {
      cenarioObj = {
        texto: cenarioToMarkdown(cenarioParsed),
        complexidade,
        tensao_central: cenarioParsed.tensao_central,
        tradeoff_testado: cenarioParsed.tradeoff_testado,
        armadilha_resposta_generica: cenarioParsed.armadilha_resposta_generica,
        stakeholders: cenarioParsed.stakeholders,
      };
    } else {
      cenarioObj = { texto: (cResp || '').trim(), complexidade };
    }
  } catch (err: any) {
    console.warn(`[buildSeason] missao/cenario sem ${semana}: ${err?.message ?? err}`);
    if (!missaoObj.texto) missaoObj.texto = `Missão pendente. Aplique os descritores ${cobertos.join(', ')} em uma situação real do seu cargo esta semana.`;
    if (!cenarioObj.texto) cenarioObj.texto = `Cenário pendente. Descreva como você aplicaria os descritores ${cobertos.join(', ')} em uma situação típica do seu cargo.`;
  }

  return {
    semana,
    tipo: 'aplicacao',
    competencias_cobertas: competenciasIntegradas,
    descritor: null,
    descritores_cobertos: cobertos,
    missao: missaoObj,
    cenario: cenarioObj,
    status: 'bloqueada',
  };
}
