import type { SupabaseClient } from '@supabase/supabase-js';

/** O reset publica um asset pronto e pode recuperar a célula fixa após falha. */
export async function encontrarCelulaVideoDemo(sb: SupabaseClient, cfg: {
  id: string;
  moduloId: string;
  empresaId: string;
  cargo: string;
  disc: string;
}): Promise<{ id: string } | null> {
  const consultar = () => sb.from('videos_gerados')
    .select('id')
    .eq('modulo_base_id', cfg.moduloId)
    .eq('empresa_id', cfg.empresaId)
    .eq('cargo', cfg.cargo)
    .eq('disc_dominante', cfg.disc);

  // Uma tentativa nova pode coexistir com falhas antigas. Preserve a célula
  // viva para não violar a unicidade por módulo × empresa × cargo × DISC.
  const viva = await consultar().neq('status', 'error').maybeSingle();
  if (viva.error) throw new Error(`carregar célula de vídeo demo: ${viva.error.message}`);
  if (viva.data) return viva.data;

  // A célula do fixture continua ocupando sua PK mesmo em status=error.
  // Ignorá-la faria o reset tentar INSERT do mesmo ID e abortar pela metade.
  const fixa = await consultar().eq('id', cfg.id).maybeSingle();
  if (fixa.error) throw new Error(`recuperar célula de vídeo demo: ${fixa.error.message}`);
  return fixa.data;
}
