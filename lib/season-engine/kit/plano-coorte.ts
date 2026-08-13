/**
 * Plano de kits da COORTE — núcleo headless (sem gate; o `'use server'` fica na action).
 *
 * Varre o `temporada_plano` de toda a coorte, deduplica os (competência × descritor ×
 * CARGO × DISC) que ela vai demandar, confere o que já existe publicado e devolve os
 * faltantes. É só LEITURA: quem enfileira é `planejarKitsCoorte` (actions/kits.ts).
 *
 * Por que virou núcleo (27/07): esta varredura é a única coisa capaz de responder
 * "o que falta nas próximas semanas?", mas vivia atrás de `requireAdminSupabase` —
 * então um CRON não podia chamá-la, e o alarme de horizonte não existia. O resultado
 * foi medido no Ibipeba: a trilha troca de bloco de competências na semana 5 e
 * NENHUM dos 3 pares (competência × cargo) novos tinha kit, com o piloto já na
 * semana 3. Ninguém dispara o que ninguém sabe que falta. Ver F-I11 do FMEA.
 */

import { TURMA_ENCERRADAS, TURMA_MEMBRO } from '@/lib/status';

export const DISC_OK = ['D', 'I', 'S', 'C'];

/** Recorte dos que TÊM trilha e nenhuma participação ativa (mig 210). */
export const SEM_TURMA = 'sem-turma';
export const ckey = (...parts: string[]) => parts.filter(Boolean).join(' ::: ');

export interface PlanoCoorteItem {
  competencia: string; descritor: string; cargo: string;
  demandadas: string[]; existentes: string[]; faltantes: string[];
  pessoas: number; jobId?: string | null; jobErro?: string | null;
  /** Parâmetros do brief — herdados do brief já existente do tema. */
  contexto: string; nivelMin: number; nivelMax: number; briefExistente: boolean;
  /** Semanas da trilha em que este tema é demandado (ordenadas). Base do horizonte. */
  semanas: number[];
  /**
   * DISC demandados EM CADA semana. Necessário porque um mesmo tema costuma aparecer
   * em semanas diferentes com públicos diferentes: agregar tudo e rotular com a semana
   * mais próxima inflava o alarme urgente (68 DISC onde eram 41 — medido 27/07).
   */
  discsPorSemana: Array<{ semana: number; discs: string[] }>;
}

export interface PlanoCoorte {
  colaboradores: number;
  plano: PlanoCoorteItem[];
  totalFaltantes: number;
  /**
   * Início mais CEDO entre as trilhas do recorte — âncora das datas de abertura.
   * ⚠️ Só é comparável DENTRO de uma turma: entre safras, o mínimo global data a
   * demanda da turma nova pelo calendário da antiga.
   */
  inicioMaisCedo: string | null;
  /** Recorte usado. `null` = empresa inteira (compat); `'sem-turma'` = órfãos. */
  turmaId?: string | null;
}

export interface OpcoesPlanoCoorte {
  contexto?: string; nivelMin?: number; nivelMax?: number;
  /** Só as primeiras N semanas (compat: `semanaMax: 1` = só a semana 1). */
  semanaMax?: number;
  /** Janela: ignora semanas ANTES desta. Com `semanaMax`, delimita o horizonte. */
  semanaMin?: number;
  /**
   * TURMA (mig 210). Restringe a varredura aos membros ATIVOS dela.
   *
   * Por que importa aqui e não é detalhe de filtro: `semanas` é um número de
   * TRILHA, e a semana 5 de duas safras que começaram em datas diferentes são
   * DATAS diferentes. Somar as duas num plano só produz um horizonte que não
   * corresponde a nenhuma das duas — e o alarme passa a datar a demanda de uma
   * pela âncora da outra.
   *
   * `'sem-turma'` = quem tem trilha e nenhuma participação ativa. Existe para o
   * alarme não ficar CEGO para essa gente: silêncio aqui é indistinguível de
   * "está tudo pronto", que foi como a semana 5 do Ibipeba passou batida.
   */
  turmaId?: string | null;
}

/**
 * @param sb client Supabase JÁ resolvido (com gate na action, service-role no cron).
 */
export async function levantarPlanoKitsCoorte(
  sb: any,
  empresaId: string,
  opts: OpcoesPlanoCoorte = {},
): Promise<{ error: string } | PlanoCoorte> {
  if (!empresaId) return { error: 'empresaId obrigatório' };

  // 1) Colaboradores + DISC dominante + cargo (cargo define o público: MEI vs
  //    Empregabilidade caem em registros diferentes — ver perfil-publico).
  const { data: colabsTodos } = await sb.from('colaboradores')
    .select('id, perfil_dominante, cargo').eq('empresa_id', empresaId);
  if (!colabsTodos?.length) return { error: 'Empresa sem colaboradores' };

  // Recorte por TURMA (mig 210). Sem `turmaId`, a empresa inteira — que é o
  // comportamento de sempre, e o resultado é byte-igual em cliente de uma turma só.
  let colabs = colabsTodos;
  if (opts.turmaId) {
    const { data: membros } = await sb.from('turma_membros')
      .select('colaborador_id, turma_id')
      .eq('empresa_id', empresaId).eq('status', TURMA_MEMBRO.ATIVO);
    if (opts.turmaId === SEM_TURMA) {
      // ⚠️ "Tem turma" = participação ativa em turma ATIVA. Arquivar a turma não
      // encerra a participação, então contar qualquer vínculo faria essa gente
      // sumir dos DOIS recortes — nem na turma (que não é mais varrida) nem
      // aqui. É o mesmo defeito que `recortesDeHorizonte` tinha do outro lado:
      // quando há dois caminhos, os dois precisam da mesma régua.
      const { data: turmas } = await sb.from('turmas')
        .select('id, status').eq('empresa_id', empresaId);
      const idsAtivas = new Set(
        (turmas || []).filter((t: any) => !TURMA_ENCERRADAS.includes(t.status)).map((t: any) => t.id),
      );
      const comTurmaAtiva = new Set(
        (membros || []).filter((m: any) => idsAtivas.has(m.turma_id)).map((m: any) => m.colaborador_id),
      );
      colabs = colabsTodos.filter((c: any) => !comTurmaAtiva.has(c.id));
    } else {
      const daTurma = new Set(
        (membros || []).filter((m: any) => m.turma_id === opts.turmaId).map((m: any) => m.colaborador_id),
      );
      colabs = colabsTodos.filter((c: any) => daTurma.has(c.id));
    }
    if (!colabs.length) return { error: 'Turma sem colaboradores' };
  }
  const discDe = new Map<string, string>();
  const cargoDe = new Map<string, string>();
  for (const c of colabs) {
    discDe.set(c.id, String(c.perfil_dominante || '').charAt(0).toUpperCase());
    cargoDe.set(c.id, c.cargo || 'todos');
  }

  // 2) Trilha mais recente por colaborador.
  const { data: trilhas } = await sb.from('trilhas')
    .select('colaborador_id, competencia_foco, temporada_plano, criado_em, data_inicio')
    .in('colaborador_id', colabs.map((c: any) => c.id))
    .order('criado_em', { ascending: false });
  const ultima = new Map<string, any>();
  for (const t of trilhas || []) if (!ultima.has(t.colaborador_id)) ultima.set(t.colaborador_id, t);

  // Âncora do horizonte: quem começou mais cedo chega primeiro às semanas futuras —
  // usar o MÍNIMO faz o alarme tocar pela pessoa mais adiantada, não pela média.
  let inicioMaisCedo: string | null = null;
  for (const t of ultima.values()) {
    const d = t?.data_inicio ? String(t.data_inicio) : null;
    if (d && (!inicioMaisCedo || d < inicioMaisCedo)) inicioMaisCedo = d;
  }

  // 3) Demanda: (comp × descritor × CARGO) → { discs, pessoas, semanas }.
  const demanda = new Map<string, {
    competencia: string; descritor: string; cargo: string;
    discs: Set<string>; pessoas: Set<string>; porSemana: Map<number, Set<string>>;
  }>();
  const add = (colabId: string, comp: any, desc: any, disc: string, semana: number) => {
    if (!comp || !desc || !DISC_OK.includes(disc)) return;
    const cargo = cargoDe.get(colabId) || 'todos';
    const key = ckey(comp, desc, cargo);
    if (!demanda.has(key)) {
      demanda.set(key, { competencia: comp, descritor: desc, cargo, discs: new Set(), pessoas: new Set(), porSemana: new Map() });
    }
    const e = demanda.get(key)!;
    e.discs.add(disc); e.pessoas.add(colabId);
    if (Number.isFinite(semana) && semana > 0) {
      if (!e.porSemana.has(semana)) e.porSemana.set(semana, new Set());
      e.porSemana.get(semana)!.add(disc);
    }
  };

  const semanaMax = Number.isFinite(opts.semanaMax) ? Number(opts.semanaMax) : null;
  const semanaMin = Number.isFinite(opts.semanaMin) ? Number(opts.semanaMin) : null;
  for (const [colabId, t] of ultima) {
    const disc = discDe.get(colabId) || '';
    for (const semana of Array.isArray(t.temporada_plano) ? t.temporada_plano : []) {
      if (semana?.tipo !== 'conteudo') continue;
      const n = Number(semana?.semana ?? 0);
      if (semanaMax != null && n > semanaMax) continue;
      if (semanaMin != null && n < semanaMin) continue;
      if (Array.isArray(semana.conteudos_dia) && semana.conteudos_dia.length) {
        for (const cd of semana.conteudos_dia) add(colabId, cd.competencia || t.competencia_foco, cd.descritor, disc, n);
      } else {
        add(colabId, t.competencia_foco, semana.descritor, disc, n);
      }
    }
  }
  if (!demanda.size) return { error: 'Nenhuma semana de conteúdo encontrada na coorte' };

  // 4) Existentes: kits PUBLICADOS por (comp × descritor × cargo × disc) — empresa OU global.
  const { data: briefs } = await sb.from('kit_briefs')
    .select('id, competencia, descritor, cargo, contexto, nivel_min, nivel_max, empresa_id')
    .or(`empresa_id.eq.${empresaId},empresa_id.is.null`);
  const briefById = new Map((briefs || []).map((b: any) => [b.id, b]));
  const existente = new Set<string>();
  if (briefs?.length) {
    const { data: kitsRows } = await sb.from('kits')
      .select('brief_id, disc, status').in('brief_id', briefs.map((b: any) => b.id)).eq('status', 'published');
    for (const k of kitsRows || []) {
      const b: any = briefById.get(k.brief_id);
      if (b) existente.add(ckey(b.competencia, b.descritor, b.cargo || 'todos', k.disc));
    }
  }

  // 5) Plano (faltantes = demandadas − existentes). Parâmetros do brief são HERDADOS
  //    do brief que já existe para o tema: `resolverOuCriarBrief` casa por
  //    (competencia, descritor, nivel_min, nivel_max, cargo, contexto, empresa_id), e
  //    completar os DISC com um `contexto` diferente do gravado cria um brief paralelo
  //    — quebra a espinha compartilhada, que é o ponto do Kit. Ver KIT-SEMANAL.md.
  const plano: PlanoCoorteItem[] = [];
  for (const e of demanda.values()) {
    const demandadas = [...e.discs].sort();
    const existentes = demandadas.filter((d) => existente.has(ckey(e.competencia, e.descritor, e.cargo, d)));
    const faltantes = demandadas.filter((d) => !existente.has(ckey(e.competencia, e.descritor, e.cargo, d)));
    const briefTema = (briefs || []).find((b: any) =>
      b.competencia === e.competencia && b.descritor === e.descritor
      && (b.cargo || 'todos') === e.cargo && b.empresa_id === empresaId) as any;
    plano.push({
      competencia: e.competencia, descritor: e.descritor, cargo: e.cargo,
      demandadas, existentes, faltantes, pessoas: e.pessoas.size,
      semanas: [...e.porSemana.keys()].sort((a, b) => a - b),
      discsPorSemana: [...e.porSemana.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([semana, ds]) => ({ semana, discs: [...ds].sort() })),
      contexto: briefTema?.contexto ?? opts.contexto ?? 'educacional',
      nivelMin: Number(briefTema?.nivel_min ?? opts.nivelMin ?? 1),
      nivelMax: Number(briefTema?.nivel_max ?? opts.nivelMax ?? 2),
      briefExistente: !!briefTema,
    });
  }
  plano.sort((a, b) => b.faltantes.length - a.faltantes.length || b.pessoas - a.pessoas);

  return {
    colaboradores: colabs.length,
    plano,
    totalFaltantes: plano.reduce((s, p) => s + p.faltantes.length, 0),
    inicioMaisCedo,
    turmaId: opts.turmaId ?? null,
  };
}
