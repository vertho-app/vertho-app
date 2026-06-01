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

export function selectDescriptors(
  assessment: DescriptorAssessment[] = [],
  slots: number[] = DEFAULT_SLOTS,
): SelectedDescriptor[] {
  const SLOTS = slots;
  if (!Array.isArray(assessment) || assessment.length === 0) return [];

  // Separa em "tem gap" e "já proficiente"
  const comGap: InternalCandidate[] = assessment
    .filter(a => Number(a.nota) < 3.0)
    .map(a => ({ ...a, gap: 3.0 - Number(a.nota), semanas_desejadas: Number(a.nota) < 2.0 ? 2 : 1 }))
    .sort((a, b) => Number(a.nota) - Number(b.nota));

  const proficientes: InternalCandidate[] = assessment
    .filter(a => Number(a.nota) >= 3.0)
    .map(a => ({ ...a, gap: Math.max(0, 4.0 - Number(a.nota)), semanas_desejadas: 1 }))
    .sort((a, b) => Number(b.nota) - Number(a.nota)); // mais alto primeiro (eleva pra Avançado)

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
 * Multi-competência: para cada competência alocada a uma semana de fundamento,
 * pega o descritor mais relevante (maior gap, fallback 1º registrado) e gera
 * 1 SelectedDescriptor com `competencia` preenchida.
 *
 * `semanaParaCompetenciaIdx` mapeia semana de fundamento → índice no array
 * de competências. Ex: Onboarding tem { 2: 0, 3: 1, 5: 2, 6: 3, 8: 4 }.
 *
 * Não usa contiguidade — cada competência tem exatamente 1 slot. Diferente
 * do regular, que aloca 2 semanas por descritor com gap profundo.
 */
export function selectDescriptorsMulti(
  competenciasOrdenadas: AssessmentPorCompetencia[],
  semanaParaCompetenciaIdx: Record<number, number>,
): SelectedDescriptor[] {
  const selecionados: SelectedDescriptor[] = [];
  for (const [semStr, idx] of Object.entries(semanaParaCompetenciaIdx)) {
    const semana = Number(semStr);
    const comp = competenciasOrdenadas[idx];
    if (!comp) continue;
    const lista = Array.isArray(comp.assessment) ? comp.assessment : [];
    // Escolhe descritor de maior gap (nota mais baixa); fallback = primeiro
    const ordenados = [...lista].sort((a, b) => Number(a.nota) - Number(b.nota));
    const escolhido = ordenados[0];
    if (!escolhido) continue;
    const nota = Number(escolhido.nota);
    selecionados.push({
      descritor: escolhido.descritor,
      competencia: comp.competencia,
      nota_atual: nota,
      gap: Math.max(0, 3.0 - nota),
      semanas_alocadas: 1,
      semanas_ids: [semana],
    });
  }
  return selecionados;
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
