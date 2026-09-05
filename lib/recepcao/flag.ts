import 'server-only';
import { createSupabaseAdmin } from '@/lib/supabase';
export async function recepcaoHabilitada(empresaId?: string | null) {
  if (!empresaId) return false;
  try {
    const { data, error } = await createSupabaseAdmin().from('recepcao_config').select('habilitado').eq('empresa_id', empresaId).maybeSingle();
    return !error && data?.habilitado === true;
  } catch { return false; }
}
