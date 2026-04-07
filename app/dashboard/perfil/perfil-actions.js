'use server';

import { createSupabaseAdmin } from '@/lib/supabase';

/**
 * Carrega dados do perfil do colaborador.
 */
export async function loadPerfil(email) {
  if (!email) return { error: 'Nao autenticado' };

  const sb = createSupabaseAdmin();
  const normalizedEmail = email.trim().toLowerCase();

  const { data: colab } = await sb.from('colaboradores')
    .select('id, nome_completo, email, cargo, area_depto, empresa_id, role, perfil_dominante, d_natural, i_natural, s_natural, c_natural')
    .eq('email', normalizedEmail)
    .single();

  if (!colab) return { error: 'Colaborador nao encontrado' };

  // Buscar nome da empresa
  const { data: empresa } = await sb.from('empresas')
    .select('nome')
    .eq('id', colab.empresa_id)
    .single();

  return {
    colaborador: colab,
    empresaNome: empresa?.nome || '',
  };
}
