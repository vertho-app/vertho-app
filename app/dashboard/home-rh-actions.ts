'use server';

import { requireRhEngagement } from '@/lib/engajamento/rh-access';
import { carregarPanoramaRH } from '@/lib/home/loaders';
import { listarTurmasParaFiltro, resolverEscopoDeLeitura } from '@/lib/turmas/escopo-leitura';
import { tenantDb } from '@/lib/tenant-db';

/**
 * Seletor de turma da home do RH (07/10/2026).
 *
 * A empresa vem SEMPRE da sessão do RH; o `turmaId` vem do cliente, então é validado contra
 * essa empresa (`resolverEscopoDeLeitura` filtra por `empresa_id`): turma de outra empresa é
 * erro, nunca dado. O panorama usa a mesma função da home e do Andamento, com o escopo da turma.
 */
export async function listarTurmasDaHomeRH() {
  const { empresaId } = await requireRhEngagement();
  return listarTurmasParaFiltro(tenantDb(empresaId).raw, empresaId);
}

export async function carregarPanoramaRHDaTurma(turmaId: string) {
  const { empresaId } = await requireRhEngagement();
  const escopoTurma = await resolverEscopoDeLeitura(tenantDb(empresaId).raw, empresaId, turmaId);
  return carregarPanoramaRH(empresaId, { escopoTurma });
}
