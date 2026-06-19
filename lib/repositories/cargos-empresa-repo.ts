/**
 * Repositório tenant-safe de cargos da empresa (`cargos_empresa`) — corte estreito,
 * só o que o módulo `gerenciar` usa.
 *
 * Mesma disciplina do colaboradores-repo: toda operação embute
 * `.eq('empresa_id', empresaId)` no WHERE (e o insert embute o empresa_id). Um id
 * de OUTRO tenant não casa → afeta 0 linhas (retorna null), sem depender de
 * `assertTenantAccess` manual.
 */

type Sb = any; // supabase admin client (mesmo `any` pragmático do módulo)

export async function findCargoInTenant(sb: Sb, empresaId: string, id: string): Promise<any | null> {
  const { data } = await sb
    .from('cargos_empresa')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('id', id)
    .maybeSingle();
  return data || null;
}

export async function listCargosInTenant(sb: Sb, empresaId: string): Promise<any[]> {
  const { data } = await sb
    .from('cargos_empresa')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('nome');
  return data || [];
}

/**
 * Cria (sem `cargo.id`) ou atualiza (com `cargo.id`) SEMPRE no tenant `empresaId`.
 * Devolve o registro; null quando o `id` não pertence a `empresaId` (update de 0 linhas).
 */
export async function upsertCargoInTenant(sb: Sb, empresaId: string, cargo: { id?: string } & Record<string, any>): Promise<any | null> {
  const { id, ...campos } = cargo;
  if (id) {
    const { data, error } = await sb
      .from('cargos_empresa')
      .update(campos)
      .eq('empresa_id', empresaId)
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data || null;
  }
  const { data, error } = await sb
    .from('cargos_empresa')
    .insert({ ...campos, empresa_id: empresaId })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/** Exclui e devolve o registro removido; null quando o id não pertence a `empresaId`. */
export async function deleteCargoInTenant(sb: Sb, empresaId: string, id: string): Promise<any | null> {
  const { data, error } = await sb
    .from('cargos_empresa')
    .delete()
    .eq('empresa_id', empresaId)
    .eq('id', id)
    .select('id, nome')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data || null;
}
