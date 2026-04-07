'use server';

import { createSupabaseAdmin } from '@/lib/supabase';

/**
 * Salva os resultados do mapeamento comportamental DISC no Supabase.
 * @param {string} email - Email do colaborador
 * @param {object} resultados - { disc, dA, lead, comp, profile, learnPrefs, rawData }
 */
export async function salvarPerfilComportamental(email, resultados) {
  if (!email || !resultados) {
    return { success: false, error: 'Dados incompletos' };
  }

  const sb = createSupabaseAdmin();
  const normalizedEmail = email.trim().toLowerCase();

  const { error } = await sb.from('colaboradores')
    .update({
      perfil_dominante: resultados.profile,
      d_natural: Math.round(resultados.disc.D),
      i_natural: Math.round(resultados.disc.I),
      s_natural: Math.round(resultados.disc.S),
      c_natural: Math.round(resultados.disc.C),
      d_adaptado: Math.round(resultados.dA.D),
      i_adaptado: Math.round(resultados.dA.I),
      s_adaptado: Math.round(resultados.dA.S),
      c_adaptado: Math.round(resultados.dA.C),
      disc_resultados: JSON.stringify({
        lead: resultados.lead,
        comp: resultados.comp,
        learnPrefs: resultados.learnPrefs,
        rawData: resultados.rawData,
      }),
    })
    .eq('email', normalizedEmail);

  if (error) return { success: false, error: error.message };
  return { success: true };
}
