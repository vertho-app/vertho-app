/**
 * Fila da IA4 — núcleo HEADLESS (fora de 'use server'), usado pela tela (`listarPendentesIA4`, `rodarIA4`)
 * e pela prévia/orquestração do fluxo completo (`lib/pipeline-fluxo`). Uma fila só: duas escritas da mesma
 * regra divergem na primeira correção (a base já pagou por isso com a fila do PDI e a do blueprint).
 * Movida de `actions/fase3.ts` sem mudar uma linha da regra.
 */

/**
 * Fila da IA4 = pendentes clássicas (avaliacao_ia IS NULL) + PRESAS: respostas
 * com avaliacao_ia gravado mas ZERO linhas em descriptor_assessments para o
 * mesmo (colaborador, competencia) — legado do bug em que a avaliação era
 * gravada antes do upsert de notas (achado 1.4 do FMEA-PIPELINE). Incluir as
 * presas na fila é o reparo self-service: o admin roda a IA4 normal e elas são
 * reprocessadas (rodarIA4Uma também deixou de recusá-las).
 *
 * Custo: 2 queries extras por chamada (avaliadas da empresa + assessments dos
 * colaboradores envolvidos, ambas com poucas colunas) — aceitável para a tela
 * admin e evita um NOT EXISTS por resposta via RPC/PostgREST.
 */
export async function buscarFilaIA4(tdb: any): Promise<{ data?: any[]; error?: string }> {
  const { data: pendentes, error } = await tdb.from('respostas')
    .select('id, colaborador_id, competencia_id, competencia_nome')
    .is('avaliacao_ia', null)
    .not('r1', 'is', null);
  if (error) return { error: error.message };

  const { data: avaliadas, error: errAv } = await tdb.from('respostas')
    .select('id, colaborador_id, competencia_id, competencia_nome')
    .not('avaliacao_ia', 'is', null)
    .not('r1', 'is', null);
  if (errAv) return { error: errAv.message };

  let presas: any[] = [];
  const colabIds = [...new Set((avaliadas || []).map((r: any) => r.colaborador_id).filter(Boolean))] as string[];
  if (colabIds.length) {
    // Só nota com origem 'ia4' "desprende" a resposta: uma nota MANUAL na mesma
    // competência não significa que a IA4 persistiu — sem o filtro, a presa saía
    // da fila e o reparo self-service não a alcançava mais.
    const { data: assessments, error: errAss } = await tdb.from('descriptor_assessments')
      .select('colaborador_id, competencia')
      .eq('origem', 'ia4')
      .in('colaborador_id', colabIds);
    if (errAss) return { error: errAss.message };
    const comNotas = new Set((assessments || []).map((a: any) => `${a.colaborador_id}|${a.competencia}`));
    presas = (avaliadas || [])
      .filter((r: any) => r.colaborador_id && r.competencia_nome && !comNotas.has(`${r.colaborador_id}|${r.competencia_nome}`))
      .map((r: any) => ({ ...r, presa_sem_notas: true }));
  }
  return { data: [...(pendentes || []), ...presas] };
}
