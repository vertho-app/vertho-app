/**
 * Repositório tenant-safe de colaboradores — corte estreito (só o que o módulo
 * `gerenciar` usa hoje).
 *
 * PREVENÇÃO ESTRUTURAL DO S1: toda operação embute `.eq('empresa_id', empresaId)`
 * no WHERE. Um id de OUTRO tenant simplesmente não casa → afeta 0 linhas (retorna
 * null), em vez de depender de um `assertTenantAccess` manual que dá pra esquecer.
 * O `empresaId` vem do contexto (a empresa que o admin está gerenciando no painel).
 *
 * Mantém a responsabilidade óbvia: NÃO mistura cargos (terá repo próprio) nem
 * tenta ser uma camada genérica.
 */

// Supabase admin client (mesmo `any` pragmático do resto do módulo).
type Sb = any;

export async function findColaboradorInTenant(sb: Sb, empresaId: string, id: string): Promise<any | null> {
  const { data } = await sb
    .from('colaboradores')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('id', id)
    .maybeSingle();
  return data || null;
}

/** Atualiza e devolve o registro; null quando o id não pertence a `empresaId` (0 linhas). */
export async function updateColaboradorInTenant(sb: Sb, empresaId: string, id: string, patch: Record<string, any>): Promise<any | null> {
  const { data, error } = await sb
    .from('colaboradores')
    .update(patch)
    .eq('empresa_id', empresaId)
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data || null;
}

/** Exclui e devolve o registro removido; null quando o id não pertence a `empresaId`. */
export async function deleteColaboradorInTenant(sb: Sb, empresaId: string, id: string): Promise<any | null> {
  const { data, error } = await sb
    .from('colaboradores')
    .delete()
    .eq('empresa_id', empresaId)
    .eq('id', id)
    .select('id, nome_completo')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data || null;
}
