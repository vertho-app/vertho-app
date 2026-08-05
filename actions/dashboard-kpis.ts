'use server';

import { findColabByEmail } from '@/lib/authz';
import { carregarHomeKpis, carregarJornada, JORNADA_COLAB_COLS } from '@/lib/home/loaders';

/**
 * KPIs da home alinhados ao ciclo SEMANAL da capacitação. São 4 dados que
 * mudam toda semana (alguns todo dia):
 *
 * 1. Pílula da semana    — título + status
 * 2. Evidência da semana — registrada / pendente / atrasada
 * 3. Fase atual           — Fase 1-5 da jornada
 * 4. Próximo marco        — countdown em dias
 *
 * Wrapper fino: auth + delega pra lib/home/loaders. A jornada (base da fase
 * atual) roda em paralelo — antes era uma action chamada de dentro desta,
 * com uma 2ª cadeia de auth completa.
 */
export async function loadHomeKpis(): Promise<any> {
  const { getAuthenticatedEmailFromAction } = await import('@/lib/auth/action-context');
  const email = await getAuthenticatedEmailFromAction();
  if (!email) return { error: 'Não autenticado' };

  const colab = await findColabByEmail(email, JORNADA_COLAB_COLS);
  if (!colab) return { error: 'Colaborador não encontrado' };

  return carregarHomeKpis(colab, carregarJornada(colab));
}
