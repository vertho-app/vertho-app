import type { TabelaRevisao } from './revisao';
import type { Parecer } from './revisao-tipos';
export type ResumoRevisoes = {
  total: number;
  pendentes: number;
  concordo: number;
  parcialmente: number;
  discordo: number;
};
/** Uma situação por devolutiva/jornada: último parecer do recorte atual. */
export async function resumoRevisoes(
  tdb: { from: (t: string) => any },
  destino: TabelaRevisao,
  alvos: Array<{ id: string; referencia?: string }>,
): Promise<ResumoRevisoes | null> {
  const ultimas = new Map<string, Parecer>();
  for (let i = 0; i < alvos.length; i += 100) {
    const lote = alvos.slice(i, i + 100);
    const referencias = new Map(lote.map((a) => [a.id, a.referencia]));
    for (let de = 0; ; de += 500) {
      const { data, error } = await tdb
        .from(destino.tabela)
        .select(
          destino.alvo +
            ',parecer' +
            (destino.tabela === 'sim_lideranca_revisoes' ? ',contexto' : ''),
        )
        .in(
          destino.alvo,
          lote.map((a) => a.id),
        )
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(de, de + 499);
      if (error) return null;
      for (const r of data || []) {
        const id = r[destino.alvo];
        if (!referencias.has(id) || ultimas.has(id)) continue;
        if (
          referencias.get(id) &&
          referencias.get(id) !== r.contexto?.referencia
        )
          continue;
        ultimas.set(id, r.parecer);
      }
      if ((data || []).length < 500) break;
    }
  }
  const resumo: ResumoRevisoes = {
    total: alvos.length,
    pendentes: alvos.length - ultimas.size,
    concordo: 0,
    parcialmente: 0,
    discordo: 0,
  };
  for (const p of ultimas.values()) resumo[p]++;
  return resumo;
}
