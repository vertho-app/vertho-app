'use server';

import { findColabByEmail } from '@/lib/authz';

/**
 * Carrega dados do perfil comportamental do colaborador.
 */
export async function loadPerfilCIS(email) {
  if (!email) return { error: 'Nao autenticado' };
  const colab = await findColabByEmail(email, 'id, nome_completo, perfil_dominante, d_natural, i_natural, s_natural, c_natural');
  if (!colab) return { error: 'Colaborador nao encontrado' };
  return { colaborador: colab };
}
