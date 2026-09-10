'use server';

import { requireRhEngagement } from '@/lib/engajamento/rh-access';
import { rollUpEngajamento } from '@/lib/engajamento/roll-up';
import { carregarEvolucaoEngajamento } from '@/lib/engajamento/evolucao';
import { anexarCoordenador } from '@/lib/engajamento/coordenadores';
import { tenantDb } from '@/lib/tenant-db';

/** No company argument: RH reads only the company resolved from its session. */
export async function getEngajamentoRh(semana?: number | null, cargo?: string | null) {
  const { empresaId } = await requireRhEngagement();
  const result = await rollUpEngajamento(empresaId, semana, null, cargo);
  if (result.resumo && 'erro' in result.resumo && result.resumo.erro) {
    throw new Error('Não foi possível carregar os sinais de engajamento.');
  }
  const pessoas = result.colaboradores || [];
  const vinculos = pessoas.length ? await anexarCoordenador(tenantDb(empresaId), empresaId, pessoas) : [];
  return { ...result, colaboradores: vinculos ?? pessoas, coordenacaoDisponivel: vinculos !== null };
}

export async function getEvolucaoEngajamentoRh(area?: string | null) {
  const { empresaId } = await requireRhEngagement();
  return carregarEvolucaoEngajamento(empresaId, area);
}
