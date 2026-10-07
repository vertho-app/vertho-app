'use server';

import { requireAdminAction } from '@/lib/auth/action-context';
import { tenantDb } from '@/lib/tenant-db';
import { listarTurmasParaFiltro, resolverEscopoDeLeitura } from '@/lib/turmas/escopo-leitura';
import { serializarEscopo } from '@/lib/turmas/escopo-tela';

/**
 * Escopo de turma das telas de ADMIN que recortam listas no cliente (Fase 2, temporadas).
 *
 * `turmaId` vem do cliente: `resolverEscopoDeLeitura` filtra por `empresa_id`, então turma de
 * outra empresa é erro, nunca dado. Falha de leitura lança (não vira "turma sem ninguém").
 */
export async function listarTurmasDaEmpresa(empresaId: string) {
  await requireAdminAction();
  if (!empresaId) return [];
  return listarTurmasParaFiltro(tenantDb(empresaId).raw, empresaId);
}

export async function carregarEscopoDaTurma(empresaId: string, turmaId: string) {
  await requireAdminAction();
  if (!empresaId || !turmaId) throw new Error('empresa e turma são obrigatórias');
  const escopo = await resolverEscopoDeLeitura(tenantDb(empresaId).raw, empresaId, turmaId);
  return serializarEscopo(escopo);
}
