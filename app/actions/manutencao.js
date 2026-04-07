'use server';

import { createSupabaseAdmin } from '@/lib/supabase';

export async function limparSessoesAntigas(dias = 30) {
  const sb = createSupabaseAdmin();
  const cutoff = new Date(Date.now() - dias * 86400000).toISOString();
  const { count, error } = await sb.from('envios_diagnostico')
    .delete({ count: 'exact' })
    .lt('created_at', cutoff)
    .is('respondido_em', null);
  if (error) return { success: false, error: error.message };
  return { success: true, message: `${count || 0} sessões antigas removidas` };
}

export async function limparSessoesTeste() {
  const sb = createSupabaseAdmin();
  const { count, error } = await sb.from('envios_diagnostico')
    .delete({ count: 'exact' })
    .ilike('email', '%@teste%');
  if (error) return { success: false, error: error.message };
  return { success: true, message: `${count || 0} sessões de teste removidas` };
}

export async function estatisticasBanco() {
  return { success: true, stats: {} };
}
