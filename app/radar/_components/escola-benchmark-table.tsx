import { BarChart3 } from 'lucide-react';
import type { EscolaBenchmarkRow } from '@/lib/radar/queries';

type IndicadorRow = {
  key: keyof Omit<EscolaBenchmarkRow, 'scope' | 'qtd_escolas'>;
  label: string;
  unit: 'ideb' | 'saeb';
  threshold?: number;
};

const INDICADORES: IndicadorRow[] = [
  { key: 'ideb_5ef',     label: 'Ideb — 5º ano EF',                 unit: 'ideb', threshold: 0.3 },
  { key: 'ideb_9ef',     label: 'Ideb — 9º ano EF',                 unit: 'ideb', threshold: 0.3 },
  { key: 'ideb_3em',     label: 'Ideb — 3º ano EM',                 unit: 'ideb', threshold: 0.3 },
  { key: 'saeb_5ef_lp',  label: 'Saeb — 5º EF · Língua Portuguesa', unit: 'saeb', threshold: 10 },
  { key: 'saeb_5ef_mat', label: 'Saeb — 5º EF · Matemática',        unit: 'saeb', threshold: 10 },
  { key: 'saeb_9ef_lp',  label: 'Saeb — 9º EF · Língua Portuguesa', unit: 'saeb', threshold: 10 },
  { key: 'saeb_9ef_mat', label: 'Saeb — 9º EF · Matemática',        unit: 'saeb', threshold: 10 },
  { key: 'saeb_3em_lp',  label: 'Saeb — 3º EM · Língua Portuguesa', unit: 'saeb', threshold: 10 },
  { key: 'saeb_3em_mat', label: 'Saeb — 3º EM · Matemática',        unit: 'saeb', threshold: 10 },
];

function fmtValue(v: number | null, unit: IndicadorRow['unit']): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return unit === 'ideb' ? v.toFixed(2) : v.toFixed(0);
}

type Sinal = 'acima' | 'abaixo' | 'neutro';

function calcSinal(escolaVal: number | null, refVal: number | null, threshold: number): Sinal {
  if (escolaVal == null || refVal == null) return 'neutro';
  const diff = escolaVal - refVal;
  if (diff >= threshold) return 'acima';
  if (diff <= -threshold) return 'abaixo';
  return 'neutro';
}

function SinalDot({ sinal }: { sinal: Sinal }) {
  const map = {
    acima:  { color: '#6EE7B7', label: 'acima da microrregião' },
    abaixo: { color: '#F97354', label: 'abaixo da microrregião' },
    neutro: { color: 'rgba(255,255,255,0.25)', label: 'na média da microrregião' },
  } as const;
  const cfg = map[sinal];
  return (
    <span
      className="inline-block w-2 h-2 rounded-full"
      style={{ background: cfg.color }}
      title={cfg.label}
    />
  );
}

export function EscolaBenchmarkTable({
  rows,
  microrregiao,
  uf,
}: {
  rows: EscolaBenchmarkRow[];
  microrregiao?: string | null;
  uf?: string | null;
}) {
  const escola = rows.find((r) => r.scope === 'escola');
  const micro  = rows.find((r) => r.scope === 'microrregiao');
  const estado = rows.find((r) => r.scope === 'estado');

  if (!escola) return null;

  const visiveis = INDICADORES.filter((ind) => escola[ind.key] != null);
  if (visiveis.length === 0) return null;

  return (
    <section className="mb-10">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 size={18} style={{ color: '#34c5cc' }} />
        <h2 className="text-white text-xl font-bold">
          Comparativo · escola vs microrregião e estado
        </h2>
      </div>
      <p className="text-xs text-white/55 mb-4 leading-relaxed">
        Indicadores desta escola ao lado da média das demais escolas da microrregião IBGE
        {microrregiao ? ` (${microrregiao}${uf ? '/' + uf : ''})` : ''}{' '}
        e do estado. Verde = acima da microrregião com folga; vermelho = abaixo.
        A microrregião é a comparação primária por agrupar escolas com perfil
        socioeconômico semelhante.
      </p>

      <div className="rounded-2xl border border-white/[0.06] overflow-x-auto"
        style={{ background: 'rgba(255,255,255,0.03)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] tracking-[0.18em] uppercase font-mono text-white/40 border-b border-white/[0.06]">
              <th className="px-4 py-3">Indicador</th>
              <th className="px-3 py-3 text-right">Esta escola</th>
              <th className="px-3 py-3 text-right">
                Microrregião
                {micro?.qtd_escolas ? <span className="text-white/30 text-[9px] ml-1">({micro.qtd_escolas} esc.)</span> : null}
              </th>
              <th className="px-3 py-3 text-right">
                Estado
                {estado?.qtd_escolas ? <span className="text-white/30 text-[9px] ml-1">({estado.qtd_escolas} esc.)</span> : null}
              </th>
              <th className="px-3 py-3 text-center w-12"></th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((ind) => {
              const ev = escola[ind.key];
              const mv = micro?.[ind.key] ?? null;
              const sinal = calcSinal(ev, mv, ind.threshold ?? 5);
              return (
                <tr key={ind.key} className="border-b border-white/[0.04] last:border-b-0">
                  <td className="px-4 py-3 text-white/85">{ind.label}</td>
                  <td className="px-3 py-3 text-right text-white font-mono font-bold">
                    {fmtValue(ev, ind.unit)}
                  </td>
                  <td className="px-3 py-3 text-right text-white/65 font-mono">
                    {fmtValue(mv, ind.unit)}
                  </td>
                  <td className="px-3 py-3 text-right text-white/55 font-mono">
                    {fmtValue(estado?.[ind.key] ?? null, ind.unit)}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <SinalDot sinal={sinal} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-white/40 mt-3">
        Fonte: INEP (Saeb, Ideb). Médias agregadas a partir de diag_mv_escola_metricas
        (médias excluem a própria escola).
      </p>
    </section>
  );
}
