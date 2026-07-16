/**
 * Adapter Blueprint → Trilha (Fase 1, Estágio 3).
 *
 * Converte `blueprint.trilha.semanas` nos insumos que o motor de trilha
 * (`buildSeason`) consome: `SelectedDescriptor[]` (com `semanas_ids` nas semanas
 * de conteúdo do `ProgramaConfig`) + um `bindingPorSemana` que carrega a conexão
 * com o PDI (objetivo da semana + ação do objetivo_30_dias) pra cada semana.
 *
 * PURO (sem I/O). Recebe o blueprint já lido e o assessment por competência.
 *
 * ── Pegadinha resolvida (match de nome) ──────────────────────────────────────
 * O blueprint grava os descritores com o nome LIMPO ("Protagonismo do bem-estar"),
 * mas `descriptor_assessments` pode guardar o mesmo descritor com prefixo de
 * código ("COO03_D5 — Protagonismo do bem-estar"). O match é TOLERANTE (tira o
 * prefixo `CÓDIGO —`, acentos, caixa) e o `SelectedDescriptor` sai com o nome DO
 * ASSESSMENT — assim a busca de `micro_conteudos` (por `descritor`) segue idêntica
 * ao caminho `selectDescriptorsDuo`.
 *
 * Filosofia (decidida 08/07): a trilha do blueprint é SEQUENCIAL (comp A → comp B
 * → integra), com 2 descritores da MESMA competência por semana — melhor pra
 * formação de comportamento/hábito que o paralelo (1 de cada comp/semana). O
 * `ProgramaConfig` continua autoritativo sobre QUAIS semanas são missão/avaliação
 * (protege fechamento/arguição/scoring); o blueprint dita só o conteúdo/ordem.
 */

import type { DevelopmentBlueprint } from './types';
import type { SelectedDescriptor } from '@/lib/season-engine/select-descriptors';
import type { ProgramaConfig } from '@/lib/season-engine/programa-config';

export interface AssessmentRow {
  descritor: string;
  nota: number | string;
}

export interface BlueprintBindingSemana {
  /** Objetivo pedagógico da semana (do blueprint). */
  objetivo_da_semana?: string;
  /** id(s) do(s) objetivo_30_dias que esta semana sustenta. */
  conexao_com_pdi?: string[];
  /** Texto resolvido da(s) ação(ões) do PDI que esta semana sustenta. */
  acao_pdi?: string;
}

export interface BlueprintTrilhaInputs {
  descritoresSelecionados: SelectedDescriptor[];
  /** semana (1-based) → binding com o PDI. Cobre TODAS as semanas do blueprint. */
  bindingPorSemana: Record<number, BlueprintBindingSemana>;
  /** Divergências toleradas (logadas), não fatais. */
  avisos: string[];
}

/** Normaliza um nome de descritor pra match tolerante. */
export function normDescritor(s: string): string {
  return String(s || '')
    // tira prefixo de código: "COO03_D5 — ", "ABC_D1 -", etc. (— ou -)
    .replace(/^[A-Z0-9][A-Z0-9_.-]*\s*[—-]\s*/i, '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove acentos
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Converte o blueprint nos insumos da trilha. Retorna `{ error }` quando o
 * blueprint não é aproveitável (o caller cai no `selectDescriptorsDuo`):
 *   - trilha vazia;
 *   - alguma semana de CONTEÚDO (∈ slotsConteudo) sem nenhum descritor resolvível.
 *
 * Descritores individuais sem nota casável são pulados COM AVISO (não fatal),
 * desde que a semana ainda tenha ≥1 descritor válido.
 */
export function blueprintToTrilhaInputs(
  blueprint: DevelopmentBlueprint,
  assessmentPorComp: Record<string, AssessmentRow[]>,
  programaConfig: ProgramaConfig,
): BlueprintTrilhaInputs | { error: string } {
  const semanasBp = blueprint?.trilha?.semanas;
  if (!Array.isArray(semanasBp) || semanasBp.length === 0) {
    return { error: 'blueprint sem trilha.semanas' };
  }

  // Índice de assessment por competência: nome normalizado → { original, nota }.
  const idxPorComp: Record<string, Map<string, { descritor: string; nota: number }>> = {};
  for (const [comp, rows] of Object.entries(assessmentPorComp)) {
    const m = new Map<string, { descritor: string; nota: number }>();
    for (const r of rows || []) {
      const nota = Number(r.nota);
      if (!Number.isFinite(nota)) continue;
      m.set(normDescritor(r.descritor), { descritor: r.descritor, nota });
    }
    idxPorComp[comp] = m;
  }

  // Lookup de objetivos_30_dias: id → { objetivo, acao_principal }.
  const objetivoPorId = new Map<string, { objetivo: string; acao_principal?: string }>();
  for (const c of blueprint.competencias || []) {
    for (const o of c.objetivos_30_dias || []) {
      if (o?.id) objetivoPorId.set(o.id, { objetivo: o.objetivo, acao_principal: o.acao_principal });
    }
  }

  const avisos: string[] = [];
  const slotsConteudo = new Set(programaConfig.slotsConteudo);

  // Acumula SelectedDescriptor por (competência||descritor-original), somando
  // semanas_ids na ordem de aparição (preserva a ordem sequencial do blueprint).
  const selMap = new Map<string, SelectedDescriptor>();

  const bindingPorSemana: Record<number, BlueprintBindingSemana> = {};

  for (const s of semanasBp) {
    const semana = Number(s.semana);
    if (!Number.isFinite(semana)) continue;

    // Binding do PDI (todas as semanas).
    const ids = Array.isArray(s.conexao_com_pdi) ? s.conexao_com_pdi : [];
    const acoes = ids
      .map((id) => objetivoPorId.get(id))
      .filter(Boolean)
      .map((o) => o!.acao_principal || o!.objetivo)
      .filter(Boolean);
    bindingPorSemana[semana] = {
      objetivo_da_semana: s.objetivo_da_semana,
      conexao_com_pdi: ids,
      acao_pdi: acoes.join(' · ') || undefined,
    };

    // Só as semanas de CONTEÚDO do config alimentam a seleção de descritores
    // (missão/avaliação/reflexão fora dos slots são governadas pelo motor).
    if (!slotsConteudo.has(semana)) continue;

    const compsSemana: string[] = Array.isArray(s.competencia_foco) ? s.competencia_foco : [];
    const descNomes: string[] = Array.isArray(s.descritores_foco) ? s.descritores_foco : [];
    let resolvidosNaSemana = 0;

    for (const nome of descNomes) {
      const alvo = normDescritor(nome);
      // Tenta casar em cada competência da semana (fallback: qualquer comp).
      let comp: string | undefined;
      let hit: { descritor: string; nota: number } | undefined;
      const compsBusca = compsSemana.length ? compsSemana : Object.keys(idxPorComp);
      for (const c of compsBusca) {
        const m = idxPorComp[c];
        if (m && m.has(alvo)) { comp = c; hit = m.get(alvo); break; }
      }
      if (!hit || !comp) {
        avisos.push(`sem ${semana}: descritor "${nome}" sem nota casável (comps ${JSON.stringify(compsSemana)})`);
        continue;
      }
      resolvidosNaSemana++;
      const key = `${comp}||${hit.descritor}`;
      const existente = selMap.get(key);
      if (existente) {
        if (!existente.semanas_ids.includes(semana)) {
          existente.semanas_ids.push(semana);
          existente.semanas_alocadas = existente.semanas_ids.length;
        }
      } else {
        const nota = hit.nota;
        selMap.set(key, {
          descritor: hit.descritor,
          competencia: comp,
          nota_atual: nota,
          gap: nota < 3.0 ? 3.0 - nota : 0,
          semanas_alocadas: 1,
          semanas_ids: [semana],
        });
      }
    }

    if (resolvidosNaSemana === 0) {
      return { error: `semana de conteúdo ${semana} sem nenhum descritor resolvível — blueprint não aproveitável` };
    }
  }

  // ── COBERTURA DETERMINÍSTICA DOS GAPS ─────────────────────────────────────
  // O blueprint (IA) às vezes repete descritores e deixa gaps de fora. Aqui
  // garantimos que TODO descritor com gap (nota < 3.0) apareça em ≥1 semana de
  // conteúdo: cada gap não-coberto ROUBA a vaga de um descritor REPETIDO (de
  // MENOR gap) da MESMA competência. Só age quando há repeat pra roubar (i.e.,
  // há vagas suficientes: nº semanas × 2 ≥ nº descritores da competência).
  // Mantém 2 descritores/semana e a competência da semana. Determinístico.
  const GAP_LIMITE = 3.0;
  for (const [comp, m] of Object.entries(idxPorComp)) {
    const gaps = [...m.values()].filter((d) => d.nota < GAP_LIMITE).sort((a, b) => a.nota - b.nota);
    for (const g of gaps) {
      const key = `${comp}||${g.descritor}`;
      if (selMap.has(key)) continue; // já coberto
      const repeats = [...selMap.values()]
        .filter((d) => d.competencia === comp && d.semanas_ids.length > 1)
        .sort((a, b) => b.nota_atual - a.nota_atual); // rouba do repeat de MENOR gap
      if (!repeats.length) continue; // sem repeat → sem vaga na competência (raro)
      const r = repeats[0];
      const semana = r.semanas_ids.pop() as number;
      r.semanas_alocadas = r.semanas_ids.length;
      selMap.set(key, {
        descritor: g.descritor, competencia: comp, nota_atual: g.nota,
        gap: GAP_LIMITE - g.nota, semanas_alocadas: 1, semanas_ids: [semana],
      });
      avisos.push(`cobertura: "${g.descritor}" (gap ${g.nota}) → semana ${semana} (roubou repeat de "${r.descritor}")`);
    }
  }

  const descritoresSelecionados = [...selMap.values()];
  if (descritoresSelecionados.length === 0) {
    return { error: 'nenhum descritor resolvido do blueprint' };
  }

  return { descritoresSelecionados, bindingPorSemana, avisos };
}
