'use server';

import { findColabByEmail } from '@/lib/authz';
import { carregarJornada, JORNADA_COLAB_COLS } from '@/lib/home/loaders';

/**
 * Carrega a jornada do colaborador — status de cada fase.
 * Fases: Diagnóstico → Avaliação → PDI → Capacitação → Reavaliação
 * Wrapper fino: auth + delega pra `carregarJornada` (lib/home/loaders).
 */
export async function loadJornada(): Promise<any> {
  const { getAuthenticatedEmailFromAction } = await import('@/lib/auth/action-context');
  const email = await getAuthenticatedEmailFromAction();
  if (!email) return { error: 'Não autenticado' };

  const colab: any = await findColabByEmail(email, JORNADA_COLAB_COLS);
  if (!colab) return { error: 'Colaborador nao encontrado' };

  return carregarJornada(colab);
}
