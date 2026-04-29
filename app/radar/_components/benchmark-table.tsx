import { BarChart3 } from 'lucide-react';
import type { BenchmarkRow } from '@/lib/radar/queries';

const FMT_BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL', maximumFractionDigits: 0,
});

type IndicadorRow = {
  key: keyof Omit<BenchmarkRow, 'scope' | 'qtd_munis'>;
  label: string;
  unit: 'pct' | 'ideb' | 'saeb' | 'brl';
  // limiar relativo para acender verde/vermelho. Default 5% relativo da
  // microrregião — bem suave pra evitar falsos positivos em diferenças
  // de ~1 ponto.
  threshold?: number;
};

const INDICADORES: IndicadorRow[] = [
  { key: 'ica_taxa',     label: 'ICA — Crianças alfabetizadas (%)',  unit: 'pct',  threshold: 5 },
  { key: 'ideb_5ef',     label: 'Ideb — 5º ano EF',                  unit: 'ideb', threshold: 0.3 },
  { key: 'ideb_9ef',     label: 'Ideb — 9º ano EF',                  unit: 'ideb', threshold: 0.3 },
  { key: 'ideb_3em',     label: 'Ideb — 3º ano EM',                  unit: 'ideb', threshold: 0.3 },
  { key: 'saeb_5ef_lp',  label: 'Saeb — 5º EF · Língua Portuguesa',  unit: 'saeb', threshold: 10 },
  { key: 'saeb_5ef_mat', label: 'Saeb — 5º EF · Matemática',         unit: 'saeb', threshold: 10 },
  { key: 'saeb_9ef_lp',  label: 'Saeb — 9º EF · Língua Portuguesa',  unit: 'saeb', threshold: 10 },
  { key: 'saeb_9ef_mat', label: 'Saeb — 9º EF · Matemática',         unit: 'saeb', threshold: 10 },
  { key: 'fundeb_aluno', label: 'FUNDEB R$/aluno-ano',               unit: 'brl',  threshold: 500 },
];

function fmtValue(v: number | null, unit: IndicadorRow['unit']): string {
  if (v == null || !Number.isFinite(v)) return '—';
  switch (unit) {
    case 'pct':  return `${v.toFixed(1)}%`;
    case 'ideb': return v.toFixed(2);
    case 'saeb': return v.toFixed(0);
    case 'brl':  return FMT_BRL.format(v);
  }
}

type Sinal = 'acima' | 'abaixo' | 'neutro';

function calcSinal(cidadeVal: number | null, refVal: number | null, threshold: number): Sinal {
  if (cidadeVal == null || refVal == null) return 'neutro';
  const diff = cidadeVal - refVal;
  if (diff >= threshold) return 'acima';
  if (diff <= -threshold) return 'abaixo';
  return 'neutro';
}

function SinalDot({ sinal }: { sinal: Sinal }) {
  const map = {
    acima:  { color: '#6EE7B7', label: 'acima' },
    abaixo: { color: '#F97354', label: 'abaixo' },
    neutro: { color: 'rgba(255,255,255,0.25)', label: 'na média' },
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

export function BenchmarkTable({
  rows,
  microrregiao,
  uf,
}: {
  rows: BenchmarkRow[];
  microrregiao?: string | null;
  uf?: string | null;
}) {
  const cidade = rows.find((r) => r.scope === 'cidade');
  const micro  = rows.find((r) => r.scope === 'microrregiao');
  const estado = rows.find((r) => r.scope === 'estado');
  const brasil = rows.find((r) => r.scope === 'brasil');

  if (!cidade) return null;

  // Filtra só os indicadores que a cidade tem algum dado
  const visiveis = INDICADORES.filter((ind) => cidade[ind.key] != null);
  if (visiveis.length === 0) return null;

  return (
    <section className="mb-10">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 size={18} style={{ color: '#34c5cc' }} />
        <h2 className="text-white text-xl font-bold">
          Comparativo · cidade vs região
        </h2>
      </div>
      <p className="text-xs text-white/55 mb-4 leading-relaxed">
        Cada indicador da cidade ao lado da média da microrregião IBGE
        {microrregiao ? ` (${microrregiao}${uf ? '/' + uf : ''})` : ''},
        do estado e do Brasil. Verde = acima da microrregião com folga; vermelho = abaixo.
        Microrregião é a comparação mais justa porque agrupa municípios
        contíguos com perfil socioeconômico similar.
      </p>

      <div className="rounded-2xl border border-white/[0.06] overflow-x-auto"
        style={{ background: 'rgba(255,255,255,0.03)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] tracking-[0.18em] uppercase font-mono text-white/40 border-b border-white/[0.06]">
              <th className="px-4 py-3">Indicador</th>
              <th className="px-3 py-3 text-right">Cidade</th>
              <th className="px-3 py-3 text-right">
                Microrregião
                {micro?.qtd_munis ? <span className="text-white/30 text-[9px] ml-1">({micro.qtd_munis} mun.)</span> : null}
              </th>
              <th className="px-3 py-3 text-right">Estado</th>
              <th className="px-3 py-3 text-right">Brasil</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((ind) => {
              const cv = cidade[ind.key];
              const mv = micro?.[ind.key] ?? null;
              const sinal = calcSinal(cv, mv, ind.threshold ?? 5);
              return (
                <tr key={ind.key} className="border-b border-white/[0.04] last:border-b-0">
                  <td className="px-4 py-3 text-white/85">{ind.label}</td>
                  <td className="px-3 py-3 text-right text-white font-mono font-bold whitespace-nowrap">
                    <span className="inline-flex items-center gap-2 justify-end">
                      <SinalDot sinal={sinal} />
                      {fmtValue(cv, ind.unit)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right text-white/65 font-mono">
                    {fmtValue(mv, ind.unit)}
                  </td>
                  <td className="px-3 py-3 text-right text-white/55 font-mono">
                    {fmtValue(estado?.[ind.key] ?? null, ind.unit)}
                  </td>
                  <td className="px-3 py-3 text-right text-white/45 font-mono">
                    {fmtValue(brasil?.[ind.key] ?? null, ind.unit)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-white/40 mt-3">
        Fonte: INEP (Saeb, Ideb, ICA), Tesouro Nacional (FUNDEB). Médias agregadas a partir de
        diag_mv_municipio_metricas.
      </p>
    </section>
  );
}
