'use server';

import { createSupabaseAdmin } from '@/lib/supabase';

/**
 * Carrega dados DISC/CIS do colaborador.
 */
export async function loadPerfilCIS(email) {
  if (!email) return { error: 'Nao autenticado' };

  const sb = createSupabaseAdmin();
  const normalizedEmail = email.trim().toLowerCase();

  const { data: colab } = await sb.from('colaboradores')
    .select('id, nome_completo, perfil_dominante, d_natural, i_natural, s_natural, c_natural')
    .eq('email', normalizedEmail)
    .single();

  if (!colab) return { error: 'Colaborador nao encontrado' };
  return { colaborador: colab };
}
