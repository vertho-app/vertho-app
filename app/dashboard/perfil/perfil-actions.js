'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { findColabByEmail } from '@/lib/authz';

/**
 * Carrega dados do perfil do colaborador.
 */
export async function loadPerfil(email) {
  if (!email) return { error: 'Nao autenticado' };

  const colab = await findColabByEmail(
    email,
    'id, nome_completo, email, cargo, area_depto, empresa_id, role, perfil_dominante, d_natural, i_natural, s_natural, c_natural'
  );
  if (!colab) return { error: 'Colaborador nao encontrado' };

  const sb = createSupabaseAdmin();
  const { data: empresa } = await sb.from('empresas')
    .select('nome')
    .eq('id', colab.empresa_id)
    .maybeSingle();

  return {
    colaborador: colab,
    empresaNome: empresa?.nome || '',
  };
}
