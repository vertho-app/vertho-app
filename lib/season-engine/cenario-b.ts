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
  /**
   * ⚠️ `.limit(1)` SEM `order` devolve o que o planner quiser.
   *
   * 🔴 MEDIDO EM 25/08/2026, e não é hipótese: **três pares (empresa × cargo)
   * têm 5 Cenários B cada** — acme/Gerente Comercial, acme/Representante
   * Comercial e acme-demo/Representante Comercial. Sem ordem, a avaliação de
   * fechamento da temporada podia servir um cenário diferente a cada leitura da
   * MESMA pessoa, e o texto que ela viu não seria reconstituível depois.
   *
   * `order('created_at', desc)` torna a escolha determinística e serve o mais
   * recente — que é o que a regeneração produz. É a mesma classe de defeito que
   * este projeto já catalogou em `ppp_escolas`: `.limit(N)` numa consulta que
   * DECIDE é conclusão sorteada.
   */
  const buscar = (c: string) => sb.from('banco_cenarios')
    .select('id, titulo, descricao, alternativas')
    .eq('empresa_id', empresaId)
    .eq('cargo', c)
    .eq('tipo_cenario', 'cenario_b')
    .order('created_at', { ascending: false })
    .limit(1).maybeSingle();

  let { data: cenB } = await buscar(cargo);
  if (!cenB?.descricao && cargo !== 'todos') {
    ({ data: cenB } = await buscar('todos'));
  }
  return cenB ?? null;
}
