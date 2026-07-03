/**
 * Repositório tenant-safe de micro-conteúdos (`micro_conteudos`) — tabela
 * MISTA: linhas da empresa (empresa_id) E do catálogo GLOBAL (empresa_id
 * NULL). Por isso a disciplina aqui é o predicado "tenant DA LINHA": a
 * mutação lê o tenant da própria linha e o WHERE repete (`.eq` pra tenant,
 * `.is null` pro catálogo) — a escrita só afeta a linha no tenant em que ela
 * foi lida (elimina TOCTOU; id trocado de tenant no meio → 0 linhas).
 *
 * Substitui o helper local `mutacaoConteudo` que vivia em actions/conteudos.
 */

type Sb = any; // supabase admin client (mesmo `any` pragmático dos outros repos)

/**
 * Aplica o predicado de tenant DA LINHA num builder de mutação já filtrado
 * por id. Use quando a linha (com empresa_id) JÁ está em mãos — evita o
 * re-fetch. Reconhecido pelo guard tenant-mutation como camada sancionada.
 */
export function escopoTenantDaLinha(q: any, linha: { empresa_id?: string | null } | null | undefined) {
  return linha?.empresa_id ? q.eq('empresa_id', linha.empresa_id) : q.is('empresa_id', null);
}

/**
 * UPDATE por id com predicado de tenant da linha (re-fetch do empresa_id).
 * Devolve a linha atualizada; null quando o id não existe (ou saiu do tenant
 * entre a leitura e a escrita — 0 linhas). Erro de banco → throw.
 */
export async function updateConteudoInTenantDaLinha(sb: Sb, id: string, campos: Record<string, any>): Promise<any | null> {
  const { data: linha } = await sb.from('micro_conteudos').select('empresa_id').eq('id', id).maybeSingle();
  if (!linha) return null;
  const { data, error } = await escopoTenantDaLinha(
    sb.from('micro_conteudos').update(campos).eq('id', id),
    linha,
  ).select('id').maybeSingle();
  if (error) throw new Error(error.message);
  return data || null;
}

/**
 * DELETE por id com predicado de tenant da linha. Devolve false quando o id
 * já não existe (delete idempotente). Erro de banco → throw.
 */
export async function deleteConteudoInTenantDaLinha(sb: Sb, id: string): Promise<boolean> {
  const { data: linha } = await sb.from('micro_conteudos').select('empresa_id').eq('id', id).maybeSingle();
  if (!linha) return false;
  const { error } = await escopoTenantDaLinha(
    sb.from('micro_conteudos').delete().eq('id', id),
    linha,
  );
  if (error) throw new Error(error.message);
  return true;
}
