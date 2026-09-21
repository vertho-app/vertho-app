import type { EngagementWeekMetric } from '@/lib/engagement-evolution';

export type WeeklyTrendPoint = Pick<EngagementWeekMetric,
  'semana' | 'ativacaoPct' | 'consumoPct' | 'evidenciaPct'>;

/** Série editorial da vitrine, identificada como ilustrativa na tela.
 * Não substitui métricas, pendências nem evidências individuais do banco.
 * O gate exige tenant de demonstração E um dos três ambientes conhecidos.
 */
export function historicoIlustrativoDemo(
  empresa: { is_demo?: boolean; slug?: string } | null,
  semanas: readonly { semana: number }[],
): WeeklyTrendPoint[] | undefined {
  if (empresa?.is_demo !== true || !['acme-demo', 'gruposinal', 'escolas-acme'].includes(empresa.slug || '')) return;
  const serie = [
    [84, 79, 73], [87, 82, 76], [90, 86, 80], [89, 85, 79],
    [93, 89, 84], [95, 92, 88], [97, 94, 91],
  ];
  return semanas.map(({ semana }, index) => {
    const pos = semanas.length <= 1 ? 0 : index * (serie.length - 1) / (semanas.length - 1);
    const lo = Math.floor(pos), hi = Math.ceil(pos), mix = pos - lo;
    const [ativacaoPct, consumoPct, evidenciaPct] = serie[lo].map((v, i) => Math.round(v + (serie[hi][i] - v) * mix));
    return { semana, ativacaoPct, consumoPct, evidenciaPct };
  });
}
