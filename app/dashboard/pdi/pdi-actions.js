'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { findColabByEmail } from '@/lib/authz';

/**
 * Carrega o PDI ativo do colaborador.
 * O campo `conteudo` é JSONB com objetivos por competência.
 */
export async function loadPDI(email) {
  if (!email) return { error: 'Nao autenticado' };

  const colab = await findColabByEmail(email, 'id, nome_completo, email, cargo, area_depto, empresa_id');
  if (!colab) return { error: 'Colaborador nao encontrado' };

  const sb = createSupabaseAdmin();

  // Buscar PDI ativo
  const { data: pdi } = await sb.from('pdis')
    .select('id, conteudo, status, created_at')
    .eq('colaborador_id', colab.id)
    .eq('status', 'ativo')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!pdi) {
    return { colaborador: colab, pdiAtivo: false };
  }

  return {
    colaborador: colab,
    pdiAtivo: true,
    conteudo: pdi.conteudo,
    pdiId: pdi.id,
    criadoEm: pdi.created_at,
  };
}
