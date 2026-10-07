'use server';

import { requireRhEngagement } from '@/lib/engajamento/rh-access';
import { rollUpEngajamento } from '@/lib/engajamento/roll-up';
import { carregarEvolucaoEngajamento } from '@/lib/engajamento/evolucao';
import { anexarCoordenador } from '@/lib/engajamento/coordenadores';
import { listarTurmasParaFiltro, resolverEscopoDeLeitura } from '@/lib/turmas/escopo-leitura';
import { tenantDb } from '@/lib/tenant-db';

/**
 * No company argument: RH reads only the company resolved from its session.
 * `turmaId` vem do cliente, então a turma é validada contra a empresa da SESSÃO
 * (`resolverEscopoDeLeitura` filtra por `empresa_id`): outra empresa = erro, nunca dado.
 */
export async function getEngajamentoRh(semana?: number | null, cargo?: string | null, turmaId?: string | null) {
  const { empresaId } = await requireRhEngagement();
  const escopo = turmaId ? await resolverEscopoDeLeitura(tenantDb(empresaId).raw, empresaId, turmaId) : null;
  const result = await rollUpEngajamento(empresaId, semana, null, cargo, escopo);
  if (result.resumo && 'erro' in result.resumo && result.resumo.erro) {
    throw new Error('Não foi possível carregar os sinais de engajamento.');
  }
  const pessoas = result.colaboradores || [];
  const vinculos = pessoas.length ? await anexarCoordenador(tenantDb(empresaId), empresaId, pessoas) : [];
  return { ...result, colaboradores: vinculos ?? pessoas, coordenacaoDisponivel: vinculos !== null };
}

export async function getEvolucaoEngajamentoRh(area?: string | null, turmaId?: string | null) {
  const { empresaId } = await requireRhEngagement();
  const escopo = turmaId ? await resolverEscopoDeLeitura(tenantDb(empresaId).raw, empresaId, turmaId) : null;
  return carregarEvolucaoEngajamento(empresaId, area, escopo);
}

/** Turmas que têm gente (ativa ou encerrada), para o seletor da tela de engajamento. */
export async function listarTurmasEngajamentoRh() {
  const { empresaId } = await requireRhEngagement();
  return listarTurmasParaFiltro(tenantDb(empresaId).raw, empresaId);
}
