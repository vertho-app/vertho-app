/**
 * Pure function: dado o assessment de descritores de uma competência,
 * retorna SelectedDescriptor[] com alocação de semanas.
 *
 * Regras:
 *   - Filtra descritores com gap (nota < 3.0)
 *   - Ordena por gap decrescente
 *   - nota < 2.0 → 2 semanas; senão → 1 semana
 *   - Distribui em 9 slots de conteúdo: [1,2,3], [5,6,7], [9,10,11]
 *   - Slots contíguos por descritor (2 semanas = consecutivas)
 *   - Sobram slots: puxa descritores >= 3.0 pra elevar a Avançado (1 semana cada)
 *   - Ainda sobram slots: redistribui aos descritores com maior gap (semana extra de reforço)
 *   - Faltam slots: prioriza maior gap, demais ficam pra próxima temporada
 */

export interface DescriptorAssessment {
  descritor: string;
  nota: number | string;
}

export interface SelectedDescriptor {
  descritor: string;
  nota_atual: number;
  gap: number;
  semanas_alocadas: number;
  semanas_ids: number[];
}

interface InternalCandidate extends DescriptorAssessment {
  gap: number;
  semanas_desejadas: number;
}

export function selectDescriptors(assessment: DescriptorAssessment[] = []): SelectedDescriptor[] {
  const SLOTS = [1, 2, 3, 5, 6, 7, 9, 10, 11]; // 9 slots de conteúdo
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
