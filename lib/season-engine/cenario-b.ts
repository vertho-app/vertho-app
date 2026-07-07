/**
 * Busca do Cenário B do fechamento com FALLBACK para 'todos' (B1).
 *
 * Prioriza o cenário do CARGO específico; se não houver um cadastrado (ou vier
 * sem descrição), cai para o cenário genérico `cargo='todos'`. Alinha a rota
 * /evaluation com a prontidão (verificarProntidaoPiloto), que já aceita 'todos'
 * — antes a rota dava 424 mesmo com a prontidão aprovando. Devolve a row do
 * `banco_cenarios` (id/titulo/descricao/alternativas) ou null.
 */
export async function buscarCenarioBComFallback(sb: any, empresaId: string, cargo: string) {
  const buscar = (c: string) => sb.from('banco_cenarios')
    .select('id, titulo, descricao, alternativas')
    .eq('empresa_id', empresaId)
    .eq('cargo', c)
    .eq('tipo_cenario', 'cenario_b')
    .limit(1).maybeSingle();

  let { data: cenB } = await buscar(cargo);
  if (!cenB?.descricao && cargo !== 'todos') {
    ({ data: cenB } = await buscar('todos'));
  }
  return cenB ?? null;
}
