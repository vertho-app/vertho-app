/**
 * Fila do PDI (relatório individual) — núcleo HEADLESS, usado pela action `gerarRelatoriosIndividuaisLote`
 * (e, por ela, pelo lote `enqueueRelatoriosBatch`) e pela prévia/orquestração do fluxo completo.
 * Movida de `actions/relatorios.ts` com a MESMA regra; a única mudança é que erro de leitura agora FALHA
 * (antes `{ data }` ignorava o `{ error }` e uma falha virava "nenhuma avaliação encontrada").
 *
 * Duas regras que custaram caro:
 *  - pula quem JÁ TEM relatório (o upsert sobrescreveria um PDI já entregue);
 *  - PDI COMPLETO: só entra quem concluiu TODAS as competências do top5 do cargo com avaliação da IA (antes
 *    bastava 1 resposta avaliada → PDI parcial). Cargo sem top5 configurado não tem como medir "completo" e
 *    mantém a regra antiga.
 */
export type FilaPdi =
  | { error: string }
  | {
    /** Ninguém tem resposta avaliada (a action responde "Nenhuma avaliação encontrada"). */
    semAvaliacao: boolean;
    /** Elegíveis: avaliação completa e SEM relatório. */
    pendentes: string[];
    /** Sem relatório mas com avaliação incompleta (ignorados). */
    incompletos: number;
    /** Já têm relatório individual. */
    jaGerados: string[];
  };

export async function buscarFilaPdi(tdb: any): Promise<FilaPdi> {
  const { data: respostas, error: errResp } = await tdb.from('respostas')
    .select('colaborador_id')
    .not('avaliacao_ia', 'is', null);
  if (errResp) return { error: `respostas: ${errResp.message}` };

  const colabIds = [...new Set((respostas || []).map((r: any) => r.colaborador_id).filter(Boolean))] as string[];
  if (!colabIds.length) return { semAvaliacao: true, pendentes: [], incompletos: 0, jaGerados: [] };

  const { data: existentes, error: errRel } = await tdb.from('relatorios')
    .select('colaborador_id')
    .eq('tipo', 'individual');
  if (errRel) return { error: `relatorios: ${errRel.message}` };
  const jaGerados = new Set((existentes || []).map((r: any) => r.colaborador_id));

  const avaliadasPorColab = new Map<string, number>();
  for (const r of respostas || []) {
    if (!r.colaborador_id) continue;
    avaliadasPorColab.set(r.colaborador_id, (avaliadasPorColab.get(r.colaborador_id) || 0) + 1);
  }
  const { data: colabs, error: errColab } = await tdb.from('colaboradores').select('id, cargo').in('id', colabIds);
  if (errColab) return { error: `colaboradores: ${errColab.message}` };
  const { data: cargosEmp, error: errCargos } = await tdb.from('cargos_empresa').select('nome, top5_workshop');
  if (errCargos) return { error: `cargos_empresa: ${errCargos.message}` };
  const top5PorCargo = new Map<string, number>((cargosEmp || []).map((c: any) => [c.nome, (c.top5_workshop || []).length]));
  const completos = new Set(
    (colabs || [])
      .filter((c: any) => {
        const esperado = top5PorCargo.get(c.cargo) || 0;
        return esperado === 0 || (avaliadasPorColab.get(c.id) || 0) >= esperado;
      })
      .map((c: any) => c.id),
  );

  return {
    semAvaliacao: false,
    pendentes: colabIds.filter((id) => !jaGerados.has(id) && completos.has(id)),
    incompletos: colabIds.filter((id) => !jaGerados.has(id) && !completos.has(id)).length,
    jaGerados: [...jaGerados] as string[],
  };
}
