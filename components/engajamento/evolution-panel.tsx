'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  RefreshCw,
  RotateCcw,
  TriangleAlert,
} from 'lucide-react';
import { getEvolucaoEngajamentoEmpresa } from '@/actions/engajamento';
import type {
  EngagementAreaMetric,
  EngagementEvolutionDashboard,
  EngagementTrajectory,
  EngagementWeekMetric,
} from '@/lib/engagement-evolution';

const TRAJECTORY_META: Record<EngagementTrajectory, {
  label: string;
  bar: string;
  text: string;
}> = {
  accelerating: { label: 'Acelerando', bar: 'bg-emerald-400', text: 'text-emerald-300' },
  on_track: { label: 'No ritmo', bar: 'bg-cyan-400', text: 'text-cyan-300' },
  attention: { label: 'Atenção', bar: 'bg-amber-400', text: 'text-amber-300' },
  critical: { label: 'Crítico', bar: 'bg-rose-400', text: 'text-rose-300' },
};

function pctDelta(current: number, previous?: number): string {
  if (previous == null) return 'Primeira semana medida';
  const delta = current - previous;
  if (delta === 0) return 'Estável desde a semana anterior';
  return `${delta > 0 ? 'Subiu' : 'Caiu'} ${Math.abs(delta)} pp na semana`;
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  color,
}: {
  icon: typeof Activity;
  label: string;
  value: string | number;
  detail: string;
  color: string;
}) {
  return (
    <div className="rounded-[16px] border border-white/[0.07] bg-white/[0.025] p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/35">{label}</span>
        <Icon size={14} className={color} aria-hidden="true" />
      </div>
      <p className="mt-2 font-mono text-[25px] font-semibold leading-none tabular-nums text-white">{value}</p>
      <p className="mt-2 text-[9px] leading-relaxed text-white/30">{detail}</p>
    </div>
  );
}

const CHART = {
  width: 760,
  height: 270,
  left: 46,
  right: 625,
  top: 22,
  bottom: 228,
};

function xFor(index: number, count: number): number {
  if (count <= 1) return (CHART.left + CHART.right) / 2;
  return CHART.left + (index * (CHART.right - CHART.left)) / (count - 1);
}

function yFor(value: number): number {
  return CHART.bottom - (value / 100) * (CHART.bottom - CHART.top);
}

function seriesPath(
  weeks: EngagementWeekMetric[],
  field: 'ativacaoPct' | 'consumoPct' | 'evidenciaPct',
): string {
  return weeks.map((week, index) => (
    `${index === 0 ? 'M' : 'L'} ${xFor(index, weeks.length).toFixed(1)} ${yFor(week[field]).toFixed(1)}`
  )).join(' ');
}

function WeeklyTrendChart({ weeks }: { weeks: EngagementWeekMetric[] }) {
  const series = [
    { field: 'ativacaoPct' as const, label: 'Ativação', stroke: '#22d3ee' },
    { field: 'consumoPct' as const, label: 'Consumo', stroke: '#34d399' },
    { field: 'evidenciaPct' as const, label: 'Evidência', stroke: '#fbbf24' },
  ];
  const last = weeks.at(-1);

  return (
    <section className="rounded-[24px] border border-white/[0.08] bg-white/[0.025] p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/30">Histórico</p>
          <h3
            className="mt-1 text-[21px] leading-tight text-white"
            style={{ fontFamily: 'var(--font-serif, "Instrument Serif", serif)', fontStyle: 'italic' }}
          >
            Movimento semana a semana
          </h3>
          <p className="mt-1 text-[10px] text-white/30">Percentual entre as pessoas que já alcançaram cada etapa.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[9px] text-white/40">
          {series.map((item) => (
            <span key={item.field} className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full" style={{ background: item.stroke }} />
              {item.label}
            </span>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${CHART.width} ${CHART.height}`}
          className="w-full min-w-[640px]"
          role="img"
          aria-label="Evolução semanal de ativação, consumo e envio de evidência prática"
        >
          {[0, 25, 50, 75, 100].map((tick) => {
            const y = yFor(tick);
            return (
              <g key={tick}>
                <line x1={CHART.left} y1={y} x2={CHART.right} y2={y} stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
                <text x="7" y={y + 4} fill="rgba(255,255,255,.3)" fontSize="10">{tick}%</text>
              </g>
            );
          })}

          {weeks.map((week, index) => (
            <text
              key={week.semana}
              x={xFor(index, weeks.length)}
              y="254"
              textAnchor="middle"
              fill="rgba(255,255,255,.3)"
              fontSize="10"
            >
              S{week.semana}
            </text>
          ))}

          {series.map((item) => (
            <g key={item.field}>
              <path
                d={seriesPath(weeks, item.field)}
                fill="none"
                stroke={item.stroke}
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {weeks.map((week, index) => (
                <circle
                  key={week.semana}
                  cx={xFor(index, weeks.length)}
                  cy={yFor(week[item.field])}
                  r="4"
                  fill={item.stroke}
                  stroke="#081a2f"
                  strokeWidth="2"
                >
                  <title>Semana {week.semana}: {week[item.field]}%</title>
                </circle>
              ))}
              {last && (
                <text
                  x={CHART.right + 12}
                  y={yFor(last[item.field]) + 4}
                  fill={item.stroke}
                  fontSize="10"
                  fontWeight="600"
                >
                  {item.label} {last[item.field]}%
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>
    </section>
  );
}

function TrajectoriesCard({
  trajectories,
  recovered,
}: {
  trajectories: EngagementEvolutionDashboard['trajetorias'];
  recovered: number;
}) {
  const total = Object.values(trajectories).reduce((sum, value) => sum + value, 0);
  const ordered: EngagementTrajectory[] = ['accelerating', 'on_track', 'attention', 'critical'];

  return (
    <aside className="rounded-[24px] border border-white/[0.08] bg-white/[0.025] p-4 sm:p-5">
      <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/30">Ritmo recente</p>
      <h3
        className="mt-1 text-[21px] leading-tight text-white"
        style={{ fontFamily: 'var(--font-serif, "Instrument Serif", serif)', fontStyle: 'italic' }}
      >
        Trajetórias atuais
      </h3>
      <p className="mt-1 text-[10px] text-white/30">Leitura das duas últimas semanas alcançadas.</p>
      <div className="mt-5 space-y-3">
        {ordered.map((key) => {
          const value = trajectories[key];
          const percentage = total ? Math.round((value / total) * 100) : 0;
          const meta = TRAJECTORY_META[key];
          return (
            <div key={key}>
              <div className="flex items-center justify-between gap-3 text-[10px]">
                <span className="text-white/55">{meta.label}</span>
                <span className={`${meta.text} font-mono tabular-nums`}>{value} · {percentage}%</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                <div className={`h-full rounded-full ${meta.bar}`} style={{ width: `${percentage}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-5 flex items-start gap-2 border-t border-white/[0.07] pt-4">
        <RotateCcw size={13} className="mt-0.5 shrink-0 text-emerald-300" aria-hidden="true" />
        <div>
          <p className="text-[10px] font-semibold text-white/70">{recovered} recuperado{recovered === 1 ? '' : 's'}</p>
          <p className="mt-0.5 text-[9px] leading-relaxed text-white/28">Voltaram a apresentar atividade nesta semana.</p>
        </div>
      </div>
    </aside>
  );
}

function heatCellClass(value: number | null): string {
  if (value == null) return 'bg-white/[0.02] text-white/20';
  if (value >= 70) return 'bg-emerald-400/15 text-emerald-200';
  if (value >= 40) return 'bg-cyan-400/15 text-cyan-200';
  if (value > 0) return 'bg-amber-400/15 text-amber-200';
  return 'bg-rose-400/12 text-rose-200';
}

function AreaHeatmap({ areas, weeks }: { areas: EngagementAreaMetric[]; weeks: number[] }) {
  return (
    <section className="rounded-[24px] border border-white/[0.08] bg-white/[0.025] p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/30">Comparação</p>
          <h3
            className="mt-1 text-[21px] leading-tight text-white"
            style={{ fontFamily: 'var(--font-serif, "Instrument Serif", serif)', fontStyle: 'italic' }}
          >
            Ritmo por área
          </h3>
          <p className="mt-1 text-[10px] text-white/30">Quanto mais intensa a cor, maior o movimento registrado.</p>
        </div>
        <div className="flex items-center gap-2 text-[9px] text-white/30">
          <span className="h-2.5 w-2.5 rounded bg-rose-400/15" /> 0
          <span className="h-2.5 w-2.5 rounded bg-amber-400/15" /> 1–39
          <span className="h-2.5 w-2.5 rounded bg-cyan-400/15" /> 40–69
          <span className="h-2.5 w-2.5 rounded bg-emerald-400/15" /> 70+
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-separate border-spacing-1 text-[10px]">
          <thead>
            <tr className="text-white/30">
              <th className="min-w-[170px] px-2 py-1 text-left font-semibold">Área</th>
              {weeks.map((week) => <th key={week} className="px-1 py-1 text-center font-semibold">S{week}</th>)}
              <th className="px-2 py-1 text-right font-semibold">Tendência</th>
            </tr>
          </thead>
          <tbody>
            {areas.map((area) => (
              <tr key={area.area}>
                <td className="px-2 py-2 text-white/60">
                  <p className="font-semibold">{area.area}</p>
                  <p className="text-[9px] text-white/25">{area.participantes} participante{area.participantes === 1 ? '' : 's'}</p>
                </td>
                {area.semanas.map((week) => (
                  <td key={week.semana} className="p-0.5 text-center">
                    <div
                      className={`rounded-[10px] px-2 py-2 font-mono tabular-nums ${heatCellClass(week.indice)}`}
                      title={week.indice == null
                        ? `Semana ${week.semana}: sem elegíveis`
                        : `Semana ${week.semana}: índice ${week.indice} · ${week.elegiveis} elegíveis`}
                    >
                      {week.indice ?? '—'}
                    </div>
                  </td>
                ))}
                <td className={`px-2 py-2 text-right font-mono tabular-nums ${
                  (area.tendencia ?? 0) < 0 ? 'text-rose-300' : 'text-emerald-300'
                }`}>
                  {area.tendencia == null ? '—' : `${area.tendencia >= 0 ? '↑' : '↓'} ${Math.abs(area.tendencia)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RiskTable({ data }: { data: EngagementEvolutionDashboard }) {
  return (
    <section className="overflow-hidden rounded-[24px] border border-white/[0.08] bg-white/[0.025]">
      <div className="p-4 sm:p-5">
        <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/30">Próxima ação</p>
        <h3
          className="mt-1 text-[21px] leading-tight text-white"
          style={{ fontFamily: 'var(--font-serif, "Instrument Serif", serif)', fontStyle: 'italic' }}
        >
          Pessoas para acompanhar
        </h3>
        <p className="mt-1 text-[10px] text-white/30">Participantes em atenção ou críticos no estágio atual.</p>
      </div>
      <div className="overflow-x-auto border-t border-white/[0.07]">
        <table className="w-full min-w-[720px] text-[10px]">
          <thead>
            <tr className="text-left uppercase tracking-[0.1em] text-white/28">
              <th className="px-5 py-3 font-bold">Participante</th>
              <th className="px-3 py-3 font-bold">Área</th>
              <th className="px-3 py-3 text-center font-bold">Índice</th>
              <th className="px-3 py-3 text-center font-bold">Variação</th>
              <th className="px-3 py-3 font-bold">Ritmo</th>
              <th className="px-3 py-3 font-bold">Motivo</th>
            </tr>
          </thead>
          <tbody>
            {data.pessoasEmRisco.map((person) => {
              const meta = TRAJECTORY_META[person.trajetoria];
              return (
                <tr key={person.colaboradorId} className="border-t border-white/[0.055] transition-colors hover:bg-white/[0.025]">
                  <td className="px-5 py-3">
                    <p className="font-semibold text-white/75">{person.nome}</p>
                    <p className="text-[9px] text-white/25">{person.cargo || 'Cargo não informado'}</p>
                  </td>
                  <td className="px-3 py-3 text-white/45">
                    <p>{person.area}</p>
                    <p className="text-[9px] text-white/25">Semana {person.semanaAtual}</p>
                  </td>
                  <td className="px-3 py-3 text-center font-mono tabular-nums text-white/75">{person.indiceAtual}</td>
                  <td className={`px-3 py-3 text-center font-mono tabular-nums ${
                    person.delta < 0 ? 'text-rose-300' : person.delta > 0 ? 'text-emerald-300' : 'text-white/30'
                  }`}>
                    {person.delta > 0 ? '+' : ''}{person.delta}
                  </td>
                  <td className={`px-3 py-3 font-semibold ${meta.text}`}>{meta.label}</td>
                  <td className="px-3 py-3 text-white/40">{person.motivo}</td>
                </tr>
              );
            })}
            {!data.pessoasEmRisco.length && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-white/30">
                  Ninguém pede acompanhamento neste recorte.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function EngagementEvolutionPanel({
  empresaId,
  active = true,
}: {
  empresaId: string | null;
  active?: boolean;
}) {
  const [area, setArea] = useState('');
  const [data, setData] = useState<EngagementEvolutionDashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestCounter = useRef(0);

  const carregar = useCallback(async () => {
    const requestId = ++requestCounter.current;
    if (!empresaId) {
      setData(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await getEvolucaoEngajamentoEmpresa(empresaId, area || null);
      if (requestId !== requestCounter.current) return;
      if (result.ok === false) {
        setError(result.error);
        return;
      }
      setData(result.data);
    } catch (cause) {
      if (requestId === requestCounter.current) {
        setError(cause instanceof Error ? cause.message : 'Falha inesperada ao carregar');
      }
    } finally {
      if (requestId === requestCounter.current) setLoading(false);
    }
  }, [area, empresaId]);

  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => { void carregar(); }, 0);
    return () => window.clearTimeout(timer);
  }, [active, carregar]);

  const current = data?.semanas.at(-1);
  const previous = data && data.semanas.length > 1 ? data.semanas.at(-2) : undefined;
  const weekNumbers = useMemo(() => data?.semanas.map((week) => week.semana) || [], [data]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-[16px] border border-white/[0.07] bg-black/10 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold text-white/55">Compare o ritmo ao longo das semanas</p>
          <p className="mt-0.5 text-[9px] text-white/28">O índice combina ativação, consumo, evidência e uso do tutor.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={area}
            onChange={(event) => setArea(event.target.value)}
            disabled={loading}
            aria-label="Filtrar evolução por área"
            className="min-h-8 max-w-[220px] rounded-[10px] border border-white/[0.09] bg-[#081a2f] px-2.5 text-[10px] font-semibold text-white/65 outline-none focus:border-cyan-300/35 disabled:opacity-40"
          >
            <option value="">Todas as áreas</option>
            {(data?.areasDisponiveis || []).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <button
            type="button"
            onClick={carregar}
            disabled={loading}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-[10px] border border-white/[0.09] bg-white/[0.035] px-3 text-[10px] font-bold text-white/55 transition-colors hover:bg-white/[0.07] hover:text-white disabled:opacity-40"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Atualizar
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-[16px] border border-rose-300/20 bg-rose-300/[0.07] p-4 text-[11px] text-rose-200">
          Não foi possível carregar a evolução: {error}
        </div>
      )}

      {loading && !data && (
        <div className="flex items-center gap-2 rounded-[24px] border border-white/[0.07] bg-white/[0.025] p-6 text-[11px] text-white/35">
          <Loader2 size={15} className="animate-spin" /> Montando o histórico da jornada…
        </div>
      )}

      {data && current && (
        <div className={`space-y-5 transition-opacity ${loading ? 'pointer-events-none opacity-55' : 'opacity-100'}`} aria-busy={loading}>
          <section aria-label="Indicadores da semana mais recente" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard
              icon={Activity}
              label="Ativação"
              value={`${current.ativacaoPct}%`}
              detail={pctDelta(current.ativacaoPct, previous?.ativacaoPct)}
              color="text-cyan-300"
            />
            <MetricCard
              icon={CheckCircle2}
              label="Consumo"
              value={`${current.consumoPct}%`}
              detail={pctDelta(current.consumoPct, previous?.consumoPct)}
              color="text-emerald-300"
            />
            <MetricCard
              icon={ClipboardCheck}
              label="Evidência prática"
              value={`${current.evidenciaPct}%`}
              detail={pctDelta(current.evidenciaPct, previous?.evidenciaPct)}
              color="text-amber-300"
            />
            <MetricCard
              icon={TriangleAlert}
              label="Para acompanhar"
              value={data.emRisco}
              detail="Em atenção ou críticos no estágio atual"
              color="text-rose-300"
            />
          </section>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,2.2fr)_minmax(250px,0.8fr)]">
            <WeeklyTrendChart weeks={data.semanas} />
            <TrajectoriesCard trajectories={data.trajetorias} recovered={data.recuperados} />
          </div>

          <AreaHeatmap areas={data.areas} weeks={weekNumbers} />
          <RiskTable data={data} />

          <p className="px-1 text-[9px] leading-relaxed text-white/25">
            O índice operacional distribui 20 pontos para ativação, 30 para consumo, 40 para evidência e 10 para uso do Tira-Dúvidas. Ele mede movimento na jornada, não competência ou desempenho individual.
          </p>
        </div>
      )}

      {data && !current && !loading && (
        <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.025] p-9 text-center text-[11px] text-white/35">
          Ainda não há pessoas com semanas medidas nesta jornada.
        </div>
      )}
    </div>
  );
}
