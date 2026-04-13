/**
 * Pure function: dado o assessment de descritores de uma competência,
 * retorna SelectedDescriptor[] com alocação de semanas.
 *
 * Regras:
 *   - Filtra descritores com gap (nota < 3.0)
 *   - Ordena por gap decrescente
 *   - gap >= 1.5 (nota <= 1.5) → 2 semanas; senão → 1 semana
 *   - Distribui em 9 slots de conteúdo: [1,2,3], [5,6,7], [9,10,11]
 *   - Slots contíguos por descritor (2 semanas = consecutivas)
 *   - Sobram slots: puxa descritores >= 3.0 pra elevar a Avançado (1 semana cada)
 *   - Faltam slots: prioriza maior gap, demais ficam pra próxima temporada
 *
 * @param {Array<{descritor, nota}>} assessment
 * @returns {Array<SelectedDescriptor>} { descritor, nota_atual, gap, semanas_alocadas, semanas_ids }
 */
export function selectDescriptors(assessment = []) {
  const SLOTS = [1, 2, 3, 5, 6, 7, 9, 10, 11]; // 9 slots de conteúdo
  if (!Array.isArray(assessment) || assessment.length === 0) return [];

  // Separa em "tem gap" e "já proficiente"
  const comGap = assessment
    .filter(a => Number(a.nota) < 3.0)
    .map(a => ({ ...a, gap: 3.0 - Number(a.nota), semanas_desejadas: Number(a.nota) <= 1.5 ? 2 : 1 }))
    .sort((a, b) => b.gap - a.gap);

  const proficientes = assessment
    .filter(a => Number(a.nota) >= 3.0)
    .map(a => ({ ...a, gap: Math.max(0, 4.0 - Number(a.nota)), semanas_desejadas: 1 }))
    .sort((a, b) => Number(b.nota) - Number(a.nota)); // mais alto primeiro (eleva pra Avançado)

  const selecionados = [];
  let slotIdx = 0;

  // Aloca os com gap, respeitando contiguidade (2 semanas = mesmo bloco [1,2,3], [5,6,7] ou [9,10,11])
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

  return selecionados;
}

function slotsRestantesNoBloco(slotIdx) {
  // Blocos: 0-2 → bloco 1 (sem 1,2,3); 3-5 → bloco 2 (sem 5,6,7); 6-8 → bloco 3 (sem 9,10,11)
  const dentroDoBloco = slotIdx % 3;
  return 3 - dentroDoBloco;
}
