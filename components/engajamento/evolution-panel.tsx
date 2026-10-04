'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import WeeklyTrendChart from './weekly-trend-chart';
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
import type { EngagementEvolutionLoader, EngagementSurface } from '@/lib/engajamento/surface';
import { engagementDetailHref } from '@/lib/engajamento/prioridades';
import { motivoDeRisco, rotuloArea, rotuloCargo, type Traduzir } from '@/lib/engajamento/rotulos';
import { useFormatadores } from './use-formatadores';
import type {
  EngagementAreaMetric,
  EngagementEvolutionDashboard,
  EngagementTrajectory,
} from '@/lib/engagement-evolution';

/**
 * Aba "Evolução semanal" do Engajamento. Todo texto vem de `EngagementWorkspace`
 * nos quatro idiomas (R-67): aqui ficam só a cor e a regra de cada trajetória, e
 * o rótulo mora em `trajectory.<chave>`. O motivo de cada pessoa chega como
 * código (`motivoCodigo`) e a área e o cargo de reserva viram rótulo traduzido
 * em `lib/engajamento/rotulos.ts`.
 */
const TRAJECTORY_META: Record<EngagementTrajectory, {
  bar: string;
  text: string;
}> = {
  accelerating: { bar: 'bg-emerald-400', text: 'text-emerald-300' },
  on_track: { bar: 'bg-cyan-400', text: 'text-cyan-300' },
  attention: { bar: 'bg-amber-400', text: 'text-amber-300' },
  critical: { bar: 'bg-rose-400', text: 'text-rose-300' },
};

function pctDelta(t: Traduzir, current: number, previous?: number): string {
  if (previous == null) return t('evolution.delta.first');
  const delta = current - previous;
  if (delta === 0) return t('evolution.delta.stable');
  return t(delta > 0 ? 'evolution.delta.up' : 'evolution.delta.down', { n: Math.abs(delta) });
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

export function TrajectoriesCard({
  trajectories,
  recovered,
}: {
  trajectories: EngagementEvolutionDashboard['trajetorias'];
  recovered: number;
}) {
  const t = useTranslations('EngagementWorkspace');
  const { num, pct: pctTexto } = useFormatadores();
  const total = Object.values(trajectories).reduce((sum, value) => sum + value, 0);
  const ordered: EngagementTrajectory[] = ['accelerating', 'on_track', 'attention', 'critical'];

  return (
    <aside className="rounded-[24px] border border-white/[0.08] bg-white/[0.025] p-4 sm:p-5">
      <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/30">{t('evolution.rhythm.eyebrow')}</p>
      <h3
        className="mt-1 text-[21px] leading-tight text-white"
        style={{ fontFamily: 'var(--font-serif, "Instrument Serif", serif)', fontStyle: 'italic' }}
      >
        {t('evolution.rhythm.title')}
      </h3>
      <p className="mt-1 text-[10px] text-white/30">{t('evolution.rhythm.subtitle')}</p>
      <div className="mt-5 space-y-3">
        {ordered.map((key) => {
          const value = trajectories[key];
          const percentage = total ? Math.round((value / total) * 100) : 0;
          const meta = TRAJECTORY_META[key];
          return (
            <div key={key}>
              <div className="flex items-center justify-between gap-3 text-[10px]">
                <span className="text-white/55">{t(`trajectory.${key}`)}</span>
                <span className={`${meta.text} font-mono tabular-nums`}>{num(value)} · {pctTexto(percentage)}</span>
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
          <p className="text-[10px] font-semibold text-white/70">{t('evolution.rhythm.recovered', { count: recovered })}</p>
          <p className="mt-0.5 text-[9px] leading-relaxed text-white/28">{t('evolution.rhythm.recoveredHint')}</p>
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

export function AreaHeatmap({ areas, weeks }: { areas: EngagementAreaMetric[]; weeks: number[] }) {
  const t = useTranslations('EngagementWorkspace');
  const { num } = useFormatadores();
  return (
    <section className="rounded-[24px] border border-white/[0.08] bg-white/[0.025] p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/30">{t('evolution.heatmap.eyebrow')}</p>
          <h3
            className="mt-1 text-[21px] leading-tight text-white"
            style={{ fontFamily: 'var(--font-serif, "Instrument Serif", serif)', fontStyle: 'italic' }}
          >
            {t('evolution.heatmap.title')}
          </h3>
          <p className="mt-1 text-[10px] text-white/30">{t('evolution.heatmap.hint')}</p>
        </div>
        <div className="flex items-center gap-2 text-[9px] text-white/30">
          <span className="h-2.5 w-2.5 rounded bg-rose-400/15" /> {t('evolution.heatmap.legendZero')}
          <span className="h-2.5 w-2.5 rounded bg-amber-400/15" /> {t('evolution.heatmap.legendLow')}
          <span className="h-2.5 w-2.5 rounded bg-cyan-400/15" /> {t('evolution.heatmap.legendMid')}
          <span className="h-2.5 w-2.5 rounded bg-emerald-400/15" /> {t('evolution.heatmap.legendHigh')}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-separate border-spacing-1 text-[10px]">
          <thead>
            <tr className="text-white/30">
              <th className="min-w-[170px] px-2 py-1 text-left font-semibold">{t('evolution.heatmap.area')}</th>
              {weeks.map((week) => <th key={week} className="px-1 py-1 text-center font-semibold">{t('weekShort', { week })}</th>)}
              <th className="px-2 py-1 text-right font-semibold">{t('evolution.heatmap.trend')}</th>
            </tr>
          </thead>
          <tbody>
            {areas.map((area) => (
              <tr key={area.area}>
                <td className="px-2 py-2 text-white/60">
                  <p className="font-semibold">{rotuloArea(t, area.area)}</p>
                  <p className="text-[9px] text-white/25">{t('evolution.heatmap.participants', { count: area.participantes })}</p>
                </td>
                {area.semanas.map((week) => (
                  <td key={week.semana} className="p-0.5 text-center">
                    <div
                      className={`rounded-[10px] px-2 py-2 font-mono tabular-nums ${heatCellClass(week.indice)}`}
                      title={week.indice == null
                        ? t('evolution.heatmap.cellNoEligible', { week: week.semana })
                        : t('evolution.heatmap.cell', { week: week.semana, index: week.indice, eligible: week.elegiveis })}
                    >
                      {week.indice == null ? '—' : num(week.indice)}
                    </div>
                  </td>
                ))}
                <td className={`px-2 py-2 text-right font-mono tabular-nums ${
                  (area.tendencia ?? 0) < 0 ? 'text-rose-300' : 'text-emerald-300'
                }`}>
                  {area.tendencia == null ? '—' : `${area.tendencia >= 0 ? '↑' : '↓'} ${num(Math.abs(area.tendencia))}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function RiskTable({ data, empresaId, surface }: { data: EngagementEvolutionDashboard; empresaId: string; surface: EngagementSurface }) {
  const t = useTranslations('EngagementWorkspace');
  const { num } = useFormatadores();
  return (
    <section className="overflow-hidden rounded-[24px] border border-white/[0.08] bg-white/[0.025]">
      <div className="p-4 sm:p-5">
        <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/30">{t('evolution.risk.eyebrow')}</p>
        <h3
          className="mt-1 text-[21px] leading-tight text-white"
          style={{ fontFamily: 'var(--font-serif, "Instrument Serif", serif)', fontStyle: 'italic' }}
        >
          {t('evolution.risk.title')}
        </h3>
        <p className="mt-1 text-[10px] text-white/30">{t('evolution.risk.subtitle')}</p>
      </div>
      <div className="overflow-x-auto border-t border-white/[0.07]">
        <table className="w-full min-w-[720px] text-[10px]">
          <thead>
            <tr className="text-left uppercase tracking-[0.1em] text-white/28">
              <th className="px-5 py-3 font-bold">{t('evolution.risk.participant')}</th>
              <th className="px-3 py-3 font-bold">{t('evolution.risk.area')}</th>
              <th className="px-3 py-3 text-center font-bold">{t('evolution.risk.index')}</th>
              <th className="px-3 py-3 text-center font-bold">{t('evolution.risk.variation')}</th>
              <th className="px-3 py-3 font-bold">{t('evolution.risk.rhythm')}</th>
              <th className="px-3 py-3 font-bold">{t('evolution.risk.reason')}</th>
            </tr>
          </thead>
          <tbody>
            {data.pessoasEmRisco.map((person) => {
              const meta = TRAJECTORY_META[person.trajetoria];
              return (
                <tr key={person.colaboradorId} className="border-t border-white/[0.055] transition-colors hover:bg-white/[0.025]">
                  <td className="px-5 py-3">
                    <p className="font-semibold text-white/75">{person.nome}</p>
                    <p className="text-[9px] text-white/25">{rotuloCargo(t, person.cargo)}</p>
                    <Link href={engagementDetailHref(empresaId, { id: person.colaboradorId, week: person.semanaAtual }, surface)} className="mt-1 inline-flex min-h-9 items-center text-xs text-cyan-200 hover:underline focus-visible:outline-2 focus-visible:outline-cyan-300">{t('evolution.risk.viewSignals')}</Link>
                  </td>
                  <td className="px-3 py-3 text-white/45">
                    <p>{rotuloArea(t, person.area)}</p>
                    <p className="text-[9px] text-white/25">{t('evolution.risk.week', { week: person.semanaAtual })}</p>
                  </td>
                  <td className="px-3 py-3 text-center font-mono tabular-nums text-white/75">{num(person.indiceAtual)}</td>
                  <td className={`px-3 py-3 text-center font-mono tabular-nums ${
                    person.delta < 0 ? 'text-rose-300' : person.delta > 0 ? 'text-emerald-300' : 'text-white/30'
                  }`}>
                    {person.delta > 0 ? '+' : ''}{num(person.delta)}
                  </td>
                  <td className={`px-3 py-3 font-semibold ${meta.text}`}>{t(`trajectory.${person.trajetoria}`)}</td>
                  <td className="px-3 py-3 text-white/40">{motivoDeRisco(t, person)}</td>
                </tr>
              );
            })}
            {!data.pessoasEmRisco.length && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-white/30">
                  {t('evolution.risk.empty')}
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
  loadEvolution,
  surface = 'admin',
}: {
  empresaId: string | null;
  active?: boolean;
  loadEvolution?: EngagementEvolutionLoader;
  surface?: EngagementSurface;
}) {
  const t = useTranslations('EngagementWorkspace');
  const { num, pct: pctTexto } = useFormatadores();
  const [area, setArea] = useState('');
  const [data, setData] = useState<EngagementEvolutionDashboard | null>(null);
  const [loading, setLoading] = useState(false);
  // Guarda o CÓDIGO da falha, nunca o texto do servidor: a mensagem sai do catálogo.
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
    setData(null);
    setError(null);
    try {
      const result = await (loadEvolution ? loadEvolution(area || null) : getEvolucaoEngajamentoEmpresa(empresaId, area || null));
      if (requestId !== requestCounter.current) return;
      if (result.ok === false) {
        // `in` em vez de ler direto: o tsconfig roda com `strict: false`, e sem
        // ele a união discriminada por booleano não estreita.
        setError(String(('codigo' in result && (result as any).codigo) || 'generic'));
        return;
      }
      setData(result.data);
    } catch {
      if (requestId === requestCounter.current) setError('generic');
    } finally {
      if (requestId === requestCounter.current) setLoading(false);
    }
  }, [area, empresaId, loadEvolution]);

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
          <p className="text-[10px] font-semibold text-white/55">{t('evolution.toolbar.title')}</p>
          <p className="mt-0.5 text-[9px] text-white/28">{t('evolution.toolbar.hint')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={area}
            onChange={(event) => setArea(event.target.value)}
            disabled={loading}
            aria-label={t('evolution.toolbar.areaAria')}
            className="min-h-8 max-w-[220px] rounded-[10px] border border-white/[0.09] bg-[#081a2f] px-2.5 text-[10px] font-semibold text-white/65 outline-none focus:border-cyan-300/35 disabled:opacity-40"
          >
            <option value="">{t('evolution.toolbar.allAreas')}</option>
            {(data?.areasDisponiveis || []).map((item) => <option key={item} value={item}>{rotuloArea(t, item)}</option>)}
          </select>
          <button
            type="button"
            onClick={carregar}
            disabled={loading}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-[10px] border border-white/[0.09] bg-white/[0.035] px-3 text-[10px] font-bold text-white/55 transition-colors hover:bg-white/[0.07] hover:text-white disabled:opacity-40"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            {t('evolution.toolbar.refresh')}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-[16px] border border-rose-300/20 bg-rose-300/[0.07] p-4 text-[11px] text-rose-200">
          {t(error === 'empresa_ausente' ? 'evolution.errors.noCompany' : 'evolution.errors.generic')}
        </div>
      )}

      {loading && !data && (
        <div className="flex items-center gap-2 rounded-[24px] border border-white/[0.07] bg-white/[0.025] p-6 text-[11px] text-white/35">
          <Loader2 size={15} className="animate-spin" /> {t('evolution.loading')}
        </div>
      )}

      {data && current && (
        <div className={`space-y-5 transition-opacity ${loading ? 'pointer-events-none opacity-55' : 'opacity-100'}`} aria-busy={loading}>
          <section aria-label={t('evolution.metrics.aria')} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard
              icon={Activity}
              label={t('evolution.metrics.activation')}
              value={pctTexto(current.ativacaoPct)}
              detail={pctDelta(t, current.ativacaoPct, previous?.ativacaoPct)}
              color="text-cyan-300"
            />
            <MetricCard
              icon={CheckCircle2}
              label={t('evolution.metrics.consumption')}
              value={pctTexto(current.consumoPct)}
              detail={pctDelta(t, current.consumoPct, previous?.consumoPct)}
              color="text-emerald-300"
            />
            <MetricCard
              icon={ClipboardCheck}
              label={t('evolution.metrics.practicalEvidence')}
              value={pctTexto(current.evidenciaPct)}
              detail={pctDelta(t, current.evidenciaPct, previous?.evidenciaPct)}
              color="text-amber-300"
            />
            <MetricCard
              icon={TriangleAlert}
              label={t('evolution.metrics.toFollow')}
              value={num(data.emRisco)}
              detail={t('evolution.metrics.toFollowDetail')}
              color="text-rose-300"
            />
          </section>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,2.2fr)_minmax(250px,0.8fr)]">
            <WeeklyTrendChart weeks={data.historicoIlustrativo ?? data.semanas} illustrative={!!data.historicoIlustrativo} />
            <TrajectoriesCard trajectories={data.trajetorias} recovered={data.recuperados} />
          </div>

          <AreaHeatmap areas={data.areas} weeks={weekNumbers} />
          <RiskTable data={data} empresaId={empresaId!} surface={surface} />

          <p className="px-1 text-[9px] leading-relaxed text-white/25">
            {t('evolution.footnote')}
          </p>
        </div>
      )}

      {data && !current && !loading && (
        <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.025] p-9 text-center text-[11px] text-white/35">
          {t('evolution.empty')}
        </div>
      )}
    </div>
  );
}
