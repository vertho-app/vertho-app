/**
 * Pure function: dado o assessment de descritores de uma competência,
 * retorna SelectedDescriptor[] com alocação de semanas.
 *
 * Regras:
 *   - Filtra descritores com gap (nota < 3.0)
 *   - Ordena por gap decrescente
 *   - nota < 2.0 → 2 semanas; senão → 1 semana
 *   - Distribui em N slots de conteúdo (default 9: [1,2,3], [5,6,7], [9,10,11])
 *   - Slots contíguos por descritor (2 semanas = consecutivas dentro do bloco)
 *   - Sobram slots: puxa descritores >= 3.0 pra elevar a Avançado (1 semana cada)
 *   - Ainda sobram slots: redistribui aos descritores com maior gap (semana extra de reforço)
 *   - Faltam slots: prioriza maior gap, demais ficam pra próxima temporada
 *
 * Os slots são parametrizáveis via `programaConfig.slotsConteudo` — qualquer
 * arranjo contíguo em blocos de 3 funciona. Default = regular 14 semanas.
 */

export interface DescriptorAssessment {
  descritor: string;
  nota: number | string;
}

export interface SelectedDescriptor {
  descritor: string;
  /** Quando multi-competência (Onboarding), indica a competência do descritor. */
  competencia?: string;
  nota_atual: number;
  gap: number;
  semanas_alocadas: number;
  semanas_ids: number[];
}

interface InternalCandidate extends DescriptorAssessment {
  gap: number;
  semanas_desejadas: number;
}

const DEFAULT_SLOTS = [1, 2, 3, 5, 6, 7, 9, 10, 11]; // 9 slots (regular 14sem)

/**
 * Núcleo de ordenação do single (fonte única, reusado pelo Piloto):
 * separa em "tem gap" (nota < 3.0, ordenado por gap DECRESCENTE = nota
 * crescente) e "já proficiente" (nota >= 3.0, mais alto primeiro — eleva
 * pra Avançado). Extraído byte-idêntico de selectDescriptors.
 */
function ordenarCandidatos(assessment: DescriptorAssessment[]): {
  comGap: InternalCandidate[];
  proficientes: InternalCandidate[];
} {
  const comGap: InternalCandidate[] = assessment
    .filter(a => Number(a.nota) < 3.0)
    .map(a => ({ ...a, gap: 3.0 - Number(a.nota), semanas_desejadas: Number(a.nota) < 2.0 ? 2 : 1 }))
    .sort((a, b) => Number(a.nota) - Number(b.nota));

  const proficientes: InternalCandidate[] = assessment
    .filter(a => Number(a.nota) >= 3.0)
    .map(a => ({ ...a, gap: Math.max(0, 4.0 - Number(a.nota)), semanas_desejadas: 1 }))
    .sort((a, b) => Number(b.nota) - Number(a.nota)); // mais alto primeiro (eleva pra Avançado)

  return { comGap, proficientes };
}

export function selectDescriptors(
  assessment: DescriptorAssessment[] = [],
  slots: number[] = DEFAULT_SLOTS,
): SelectedDescriptor[] {
  const SLOTS = slots;
  if (!Array.isArray(assessment) || assessment.length === 0) return [];

  // Separa em "tem gap" e "já proficiente" (núcleo compartilhado)
  const { comGap, proficientes } = ordenarCandidatos(assessment);

  const selecionados: SelectedDescriptor[] = [];
  let slotIdx = 0;

  // Aloca os com gap, respeitando contiguidade (2 semanas = mesmo bloco)
  for (const d of comGap) {
    if (slotIdx >= SLOTS.length) break;
    const restantesNoBloco = slotsRestantesNoBloco(slotIdx);
    const semanas = Math.min(d.semanas_desejadas, restantesNoBloco, SLOTS.length - slotIdx);
    if (semanas <= 0) break;
    const semanasIds = SLOTS.slice(slotIdx, slotIdx + semanas);
    selecionados.push({
      descritor: d.descritor,
      nota_atual: Number(d.nota),
      gap: d.gap,
      semanas_alocadas: semanas,
      semanas_ids: semanasIds,
    });
    slotIdx += semanas;
  }

  // Sobram slots → puxa proficientes (1 semana cada)
  for (const p of proficientes) {
    if (slotIdx >= SLOTS.length) break;
    selecionados.push({
      descritor: p.descritor,
      nota_atual: Number(p.nota),
      gap: 0,
      semanas_alocadas: 1,
      semanas_ids: [SLOTS[slotIdx]],
    });
    slotIdx += 1;
  }

  // Ainda sobram slots → reforço: distribui aos selecionados com maior gap
  while (slotIdx < SLOTS.length && selecionados.length > 0) {
    const candidato = selecionados
      .filter(s => s.gap > 0)
      .sort((a, b) => {
        const diff = b.gap - a.gap;
        if (diff !== 0) return diff;
        return a.semanas_alocadas - b.semanas_alocadas;
      })[0];
    if (!candidato) break;
    candidato.semanas_ids.push(SLOTS[slotIdx]);
    candidato.semanas_alocadas += 1;
    slotIdx += 1;
  }

  return selecionados;
}

function slotsRestantesNoBloco(slotIdx: number): number {
  // Blocos: 0-2 → bloco 1; 3-5 → bloco 2; 6-8 → bloco 3
  const dentroDoBloco = slotIdx % 3;
  return 3 - dentroDoBloco;
}

// ── Multi-competência (Modo Onboarding) ─────────────────────────────────────

export interface AssessmentPorCompetencia {
  competencia: string;
  assessment: DescriptorAssessment[];
}

/**
 * Multi-competência (Modo Onboarding): reparte os descritores de cada competência
 * pelas semanas dela, `porSemana` descritores DISTINTOS em cada uma, do de MAIOR
 * gap (nota mais baixa) para o de menor. Cada descritor ocupa UMA semana: a
 * primeira semana da competência recebe os de maior gap.
 *
 * `semanaParaCompetenciaIdx` mapeia semana de conteúdo → índice no array de
 * competências. O Onboarding de 12 semanas tem 2 semanas por competência
 * (`{ 2: 0, 3: 0, 4: 1, 5: 1, ... }`) e 2 conteúdos por semana, ou seja, 4
 * descritores distintos por competência. Antes (9 semanas) era 1 semana e 1
 * descritor por competência (`porSemana = 1`, o default, byte a byte como era).
 *
 * Não usa contiguidade nem reforço: se a competência tem MENOS descritores do que
 * as semanas pedem, devolve só os que existem, e quem chama valida por PRESENÇA
 * (`descritoresEsperadosNoOnboarding`): semana sem descritor é a semana vazia que
 * o R-20 tirou, e repetir descritor para encher a vaga seria decisão de produto.
 *
 * `nivelMeta` é o nível-meta do programa (`ProgramaConfig.nivelMetaAlvo`): o
 * Onboarding mira o N2, e o gap de cada descritor é medido contra ele (R-100).
 * Default 3, o comportamento de todos os outros modos.
 */
export function selectDescriptorsMulti(
  competenciasOrdenadas: AssessmentPorCompetencia[],
  semanaParaCompetenciaIdx: Record<number, number>,
  nivelMeta: number = 3.0,
  porSemana: number = 1,
): SelectedDescriptor[] {
  const selecionados: SelectedDescriptor[] = [];
  const porCompetencia = semanasPorCompetencia(semanaParaCompetenciaIdx);
  for (const [idx, semanas] of porCompetencia) {
    const comp = competenciasOrdenadas[idx];
    if (!comp) continue;
    const lista = Array.isArray(comp.assessment) ? comp.assessment : [];
    // Maior gap primeiro (nota mais baixa); empate fica na ordem do assessment.
    const ordenados = [...lista].sort((a, b) => Number(a.nota) - Number(b.nota));
    // Dedupe defensivo: o assessment deveria ser único por descritor, e a mesma
    // pílula nunca pode aparecer duas vezes na mesma competência.
    const vistos = new Set<string>();
    const unicos = ordenados.filter((d) => {
      if (vistos.has(d.descritor)) return false;
      vistos.add(d.descritor);
      return true;
    });
    semanas.forEach((semana, i) => {
      for (const escolhido of unicos.slice(i * porSemana, (i + 1) * porSemana)) {
        const nota = Number(escolhido.nota);
        selecionados.push({
          descritor: escolhido.descritor,
          competencia: comp.competencia,
          nota_atual: nota,
          gap: Math.max(0, nivelMeta - nota),
          semanas_alocadas: 1,
          semanas_ids: [semana],
        });
      }
    });
  }
  return selecionados;
}

/** Competência (índice) → suas semanas de conteúdo, em ordem crescente, e as competências em ordem. */
function semanasPorCompetencia(semanaParaCompetenciaIdx: Record<number, number>): Array<[number, number[]]> {
  const mapa = new Map<number, number[]>();
  for (const [semStr, idx] of Object.entries(semanaParaCompetenciaIdx)) {
    const lista = mapa.get(idx) ?? [];
    lista.push(Number(semStr));
    mapa.set(idx, lista);
  }
  return [...mapa.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([idx, semanas]): [number, number[]] => [idx, semanas.sort((a, b) => a - b)]);
}

/**
 * Quantos descritores distintos cada competência do Onboarding precisa para que
 * nenhuma semana saia sem conteúdo: `semanas da competência x porSemana`. Chave
 * = índice da competência. Fonte única da regra de PRESENÇA do gerador e da
 * prontidão (`gerarTemporadaOnboarding`, `verificarProntidao`).
 */
export function descritoresEsperadosNoOnboarding(
  semanaParaCompetenciaIdx: Record<number, number>,
  porSemana: number,
): Map<number, number> {
  const esperado = new Map<number, number>();
  for (const [idx, semanas] of semanasPorCompetencia(semanaParaCompetenciaIdx)) {
    esperado.set(idx, semanas.length * porSemana);
  }
  return esperado;
}

// ── Piloto (degustação 2 semanas) ───────────────────────────────────────────

/**
 * Piloto: 1 competência, top-N descritores por gap decrescente (reusa o
 * núcleo de ordenação do single — ordenarCandidatos), cada um em EXATAMENTE
 * 1 slot, SEM doubling de 2 semanas e SEM reforço. `porSemana` descritores
 * por slot de conteúdo (piloto = 2/semana em [1, 2] → 4 distintos).
 *
 * Se faltarem descritores com gap, completa com proficientes (mesma regra
 * do single: mais alto primeiro, gap 0). Se o assessment tem MENOS descritores
 * distintos que os slots pedem, retorna quantos há — o caller valida por
 * PRESENÇA (length !== esperado → erro explícito, nunca slot vazio silencioso).
 */
export function selectDescriptorsPiloto(
  competencia: string,
  assessment: DescriptorAssessment[] = [],
  slots: number[] = [1, 2],
  porSemana: number = 2,
): SelectedDescriptor[] {
  if (!Array.isArray(assessment) || assessment.length === 0) return [];

  const { comGap, proficientes } = ordenarCandidatos(assessment);

  // Prioridade: gap decrescente, depois proficientes; dedupe por descritor
  // (defensivo — o assessment deveria ser único por descritor).
  const vistos = new Set<string>();
  const fila: InternalCandidate[] = [];
  for (const c of [...comGap, ...proficientes]) {
    if (vistos.has(c.descritor)) continue;
    vistos.add(c.descritor);
    fila.push(c);
  }

  const total = slots.length * porSemana;
  return fila.slice(0, total).map((d, i) => {
    const nota = Number(d.nota);
    const semana = slots[Math.floor(i / porSemana)];
    return {
      descritor: d.descritor,
      competencia,
      nota_atual: nota,
      gap: nota < 3.0 ? 3.0 - nota : 0,
      semanas_alocadas: 1,
      semanas_ids: [semana],
    };
  });
}

// ── Multi-competência PROFUNDA (Regular DUO) ────────────────────────────────

/**
 * Regular DUO: 2 competências em "blocos paralelos", com a MESMA
 * profundidade do Regular (alocação de 2 semanas pra gaps < 2.0, puxa
 * proficientes, reforço) — diferente do `selectDescriptorsMulti`
 * (Onboarding, 1 descritor raso por competência por semana).
 *
 * Cada competência recebe a grade completa de slots de conteúdo. Assim, toda
 * semana de conteúdo do DUO pode ter duas entregas: uma da competência A e
 * outra da competência B (ex.: segunda e terça), preservando a profundidade
 * do Regular em ambas.
 */
export function selectDescriptorsDuo(
  competenciaA: string,
  assessmentA: DescriptorAssessment[] = [],
  competenciaB: string,
  assessmentB: DescriptorAssessment[] = [],
  slots: number[] = DEFAULT_SLOTS,
): SelectedDescriptor[] {
  const selA = selectDescriptors(assessmentA, slots)
    .map(d => ({ ...d, competencia: competenciaA }));
  const selB = selectDescriptors(assessmentB, slots)
    .map(d => ({ ...d, competencia: competenciaB }));

  return [...selA, ...selB];
}
