/**
 * Repositório tenant-safe de trilhas (`trilhas`) e do progresso semanal
 * (`temporada_semana_progresso`) — corte estreito: o que as actions de
 * ADMINISTRAÇÃO de temporada usam (pausar/antecipar/arquivar/regerar).
 *
 * Mesma disciplina do colaboradores-repo/cargos-empresa-repo: toda MUTAÇÃO
 * embute `.eq('empresa_id', empresaId)` no WHERE — um id de outro tenant não
 * casa → afeta 0 linhas (retorna null), sem depender de checagem manual.
 *
 * Exceção documentada: `findTrilhaComTenant` busca por id SEM tenant — é a
 * DESCOBERTA do tenant (trilhas é root de tenancy pra essas actions, que só
 * recebem trilhaId). O empresa_id descoberto alimenta o assertTenantAccess
 * do caller e o WHERE das mutações seguintes.
 */

type Sb = any; // supabase admin client (mesmo `any` pragmático dos outros repos)

/** Descoberta do tenant: trilha por id (leitura root — ver doc do módulo). */
export async function findTrilhaComTenant(sb: Sb, trilhaId: string, cols: string = 'id, empresa_id, status'): Promise<any | null> {
  const { data } = await sb.from('trilhas').select(cols).eq('id', trilhaId).maybeSingle();
  return data || null;
}

/**
 * Atualiza a trilha SEMPRE no tenant `empresaId`. Devolve o registro
 * atualizado; null quando o id não pertence ao tenant (0 linhas).
 */
export async function updateTrilhaInTenant(sb: Sb, empresaId: string, trilhaId: string, campos: Record<string, any>): Promise<any | null> {
  const { data, error } = await sb.from('trilhas')
    .update(campos)
    .eq('id', trilhaId)
    .eq('empresa_id', empresaId)
    .select('id, status, data_inicio')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data || null;
}

/**
 * Atualiza o progresso de UMA semana da trilha, no tenant. Usado pelo
 * "regerar semana" (reset) — devolve quantas linhas afetou (0 quando a
 * semana/trilha não pertence ao tenant).
 */
export async function updateSemanaProgressoInTenant(
  sb: Sb,
  empresaId: string,
  trilhaId: string,
  semana: number,
  campos: Record<string, any>,
): Promise<number> {
  const { data, error } = await sb.from('temporada_semana_progresso')
    .update(campos)
    .eq('trilha_id', trilhaId)
    .eq('empresa_id', empresaId)
    .eq('semana', semana)
    .select('id');
  if (error) throw new Error(error.message);
  return (data || []).length;
}
