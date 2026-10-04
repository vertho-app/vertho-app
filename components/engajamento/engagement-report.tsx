'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import {
  Activity,
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Download,
  Eye,
  Loader2,
  MessageSquareText,
  Printer,
  RotateCcw,
  ShieldCheck,
  TrendingUp,
  Users,
} from 'lucide-react';
import { engagementLinks, appendEngagementQuery, type EngagementPanelProps, type EngagementSurface } from '@/lib/engajamento/surface';
import ReportPriorities from '@/components/engajamento/report-priorities';
import { useFormatadores } from '@/components/engajamento/use-formatadores';
import { engagementDetailHref } from '@/lib/engajamento/prioridades';
import { rotuloCargo, type Traduzir } from '@/lib/engajamento/rotulos';
import type { EngagementEvolutionDashboard } from '@/lib/engagement-evolution';
import { buildViews, type Audience, type Signal, type TrendPoint, type ReportView } from '@/lib/engajamento/relatorio-model';

/**
 * Relatório semanal do Engajamento na tela. Todo texto vem de
 * `EngagementWorkspace` (`report.*` e `model.*`) nos quatro idiomas (R-67): o
 * `buildViews` recebe o `t` do idioma de quem lê e devolve as frases prontas,
 * as mesmas que o PDF recebe do tradutor do servidor.
 */
const SIGNAL_STYLES: Record<Signal, { dot: string; text: string; bg: string; border: string }> = {
  critical: {
    dot: 'bg-rose-400',
    text: 'text-rose-200',
    bg: 'bg-rose-400/[0.08]',
    border: 'border-rose-400/20',
  },
  attention: {
    dot: 'bg-amber-300',
    text: 'text-amber-200',
    bg: 'bg-amber-300/[0.08]',
    border: 'border-amber-300/20',
  },
  positive: {
    dot: 'bg-emerald-300',
    text: 'text-emerald-200',
    bg: 'bg-emerald-300/[0.08]',
    border: 'border-emerald-300/20',
  },
};

// O rótulo de cada série mora em `EngagementWorkspace.trend.series.<chave>`.
const SERIES = [
  { key: 'activation' as const, chave: 'activation', color: '#34c5cc' },
  { key: 'consumption' as const, chave: 'consumption', color: '#55d6a0' },
  { key: 'evidence' as const, chave: 'evidence', color: '#f4b740' },
];

function signedDelta(t: Traduzir, value: number) {
  if (value === 0) return t('report.stable');
  return t(value > 0 ? 'report.deltaUp' : 'report.deltaDown', { n: Math.abs(value) });
}

function MetricDelta({ value }: { value: number }) {
  const t = useTranslations('EngagementWorkspace');
  const positive = value >= 0;
  const Icon = positive ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${positive ? 'text-emerald-300' : 'text-rose-300'}`}>
      <Icon size={12} aria-hidden="true" />
      {signedDelta(t, value)}
    </span>
  );
}

export function EngagementThread({ data }: { data: ReportView }) {
  const t = useTranslations('EngagementWorkspace');
  const { num, pct: pctTexto } = useFormatadores();
  const steps = [
    { chave: 'eligible', count: data.eligible, pct: data.eligible ? 100 : 0, delta: null as number | null, color: '#77e7ee' },
    { chave: 'activated', count: data.activation.count, pct: data.activation.pct, delta: data.activation.delta, color: '#34c5cc' },
    { chave: 'consumed', count: data.consumption.count, pct: data.consumption.pct, delta: data.consumption.delta, color: '#55d6a0' },
    { chave: 'evidenced', count: data.evidence.count, pct: data.evidence.pct, delta: data.evidence.delta, color: '#f4b740' },
  ];

  const perdas = [
    { de: 'eligible', para: 'activation', perda: data.eligible - data.activation.count },
    { de: 'activation', para: 'consumption', perda: data.activation.count - data.consumption.count },
    { de: 'consumption', para: 'evidence', perda: data.consumption.count - data.evidence.count },
  ].filter((p) => p.perda > 0);
  const maior = perdas.length ? [...perdas].sort((a, b) => b.perda - a.perda)[0] : null;

  return (
    <section aria-labelledby="engagement-thread-title" className="border-y border-white/[0.08] py-7 md:py-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-[var(--font-manrope)] text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300/70">
            {t('report.thread.eyebrow')}
          </p>
          <h3 id="engagement-thread-title" className="mt-1 font-[var(--font-manrope)] text-lg font-semibold text-white">
            {t('report.thread.title')}
          </h3>
        </div>
        <p className="text-xs text-white/40">{t('report.thread.basis')}</p>
      </div>

      <div className="mt-6 hidden sm:block">
        <div className="grid grid-cols-4">
          {steps.map((step, index) => (
            <div key={step.chave} className={`min-w-0 px-3 first:pl-0 last:pr-0 ${index ? 'border-l border-white/[0.07]' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-[var(--font-manrope)] text-[30px] font-semibold leading-none text-white tabular-nums">
                    {num(step.count)}
                  </div>
                  <div className="mt-1 text-xs text-white/50">{t(`report.thread.steps.${step.chave}`)}</div>
                </div>
                <div className="text-right">
                  <div className="font-[var(--font-manrope)] text-base font-semibold tabular-nums" style={{ color: step.color }}>
                    {pctTexto(step.pct)}
                  </div>
                  {step.delta != null && data.canCompare && <MetricDelta value={step.delta} />}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-4 gap-3" aria-hidden="true">
          {steps.map((step) => <div key={step.chave} className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full" style={{ width: `${step.pct}%`, background: step.color }} /></div>)}
        </div>

        {maior && (
          <div className="mt-2 flex items-center gap-2 text-xs text-rose-200/80">
            <CircleAlert size={14} aria-hidden="true" />
            {t('report.thread.biggestLoss', { count: maior.perda, from: t(`report.thread.stage.${maior.de}`), to: t(`report.thread.stage.${maior.para}`) })}
          </div>
        )}
      </div>

      <div className="mt-5 space-y-4 sm:hidden">
        {steps.map((step) => (
          <div key={step.chave}>
            <div className="flex items-end justify-between gap-3">
              <div>
                <span className="font-[var(--font-manrope)] text-xl font-semibold text-white tabular-nums">{num(step.count)}</span>
                <span className="ml-2 text-xs text-white/50">{t(`report.thread.steps.${step.chave}`)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-[var(--font-manrope)] text-sm font-semibold tabular-nums" style={{ color: step.color }}>{pctTexto(step.pct)}</span>
                {step.delta != null && data.canCompare && <MetricDelta value={step.delta} />}
              </div>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-[10px] bg-white/[0.06]">
              <div className="h-full rounded-[10px]" style={{ width: `${step.pct}%`, background: step.color }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function TrendChart({ points }: { points: TrendPoint[] }) {
  const t = useTranslations('EngagementWorkspace');
  const { pct: pctTexto } = useFormatadores();
  const width = 620;
  const height = 232;
  const left = 38;
  const right = 548;
  const top = 18;
  const bottom = 184;
  const x = (index: number) => left + (index * (right - left)) / Math.max(1, points.length - 1);
  const y = (value: number) => bottom - (value / 100) * (bottom - top);
  const path = (key: keyof Pick<TrendPoint, 'activation' | 'consumption' | 'evidence'>) => (
    points.map((point, index) => `${index ? 'L' : 'M'} ${x(index).toFixed(1)} ${y(point[key]).toFixed(1)}`).join(' ')
  );

  if (!points.length) {
    return <p className="mt-5 text-xs text-white/40">{t('report.trend.empty')}</p>;
  }

  // Valores iguais (inclusive todos em zero) precisam de rótulos separados.
  const labels = SERIES.map((series) => ({
    key: series.key,
    y: y(points.at(-1)?.[series.key] ?? 0) + 4,
  })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) {
    labels[i].y = Math.max(labels[i].y, labels[i - 1].y + 14);
  }
  const overflow = Math.max(0, labels.at(-1)!.y - (bottom + 4));
  const labelY = new Map(labels.map((label) => [label.key, label.y - overflow]));

  return (
    <>
      <div className="mt-5 hidden sm:block">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label={t('report.trend.aria')}>
          {[25, 50, 75, 100].map((tick) => (
            <g key={tick}>
              <line x1={left} x2={right} y1={y(tick)} y2={y(tick)} stroke="rgba(255,255,255,.07)" strokeWidth="1" />
              <text x="3" y={y(tick) + 4} fill="rgba(255,255,255,.35)" fontSize="10">{pctTexto(tick)}</text>
            </g>
          ))}
          {SERIES.map((series) => (
            <g key={series.key}>
              <path d={path(series.key)} fill="none" stroke={series.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              {points.map((point, index) => (
                <circle key={point.label} cx={x(index)} cy={y(point[series.key])} r="4" fill="#07192f" stroke={series.color} strokeWidth="2" />
              ))}
              <text x={right + 12} y={labelY.get(series.key)} fill={series.color} fontSize="10" fontWeight="600">
                {t(`trend.series.${series.chave}`)} {pctTexto(points.at(-1)?.[series.key] ?? 0)}
              </text>
            </g>
          ))}
          {points.map((point, index) => (
            <text key={point.label} x={x(index)} y="218" fill="rgba(255,255,255,.38)" fontSize="10" textAnchor="middle">{point.label}</text>
          ))}
        </svg>
      </div>

      <div className="mt-5 space-y-4 sm:hidden">
        {SERIES.map((series) => {
          const current = points.at(-1)?.[series.key] ?? 0;
          const previous = points.at(-2)?.[series.key] ?? current;
          return (
            <div key={series.key}>
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="flex items-center gap-2 text-white/60">
                  <span className="h-2 w-2 rounded-full" style={{ background: series.color }} />
                  {t(`trend.series.${series.chave}`)}
                </span>
                <span className="font-[var(--font-manrope)] font-semibold text-white tabular-nums">
                  {pctTexto(current)} <span className={current >= previous ? 'text-emerald-300' : 'text-rose-300'}>({points.length > 1 ? signedDelta(t, current - previous) : t('report.trend.noPrevious')})</span>
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-[10px] bg-white/[0.06]">
                <div className="h-full rounded-[10px]" style={{ width: `${current}%`, background: series.color }} />
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

export function FocusList({ data, empresaId, surface }: { data: ReportView; empresaId: string; surface: EngagementSurface }) {
  const t = useTranslations('EngagementWorkspace');
  return (
    <section id="trajetorias-prioritarias" aria-labelledby="focus-title" className="h-full border-l border-white/[0.08] pl-0 lg:pl-7">
      <p className="font-[var(--font-manrope)] text-[10px] font-bold uppercase tracking-[0.2em] text-amber-200/70">
        {t('report.focus.eyebrow')}
      </p>
      <h3 id="focus-title" className="mt-1 font-[var(--font-manrope)] text-lg font-semibold text-white">{data.focusTitle}</h3>
      <p className="mt-1 max-w-md text-xs leading-relaxed text-white/40">{data.focusSubtitle}</p>

      {data.focusItems.length === 0 ? (
        <p className="mt-5 text-xs leading-relaxed text-white/40">{t('report.focus.empty')}</p>
      ) : (
        <div className="mt-5 divide-y divide-white/[0.07]">
          {data.focusItems.map((item, index) => {
            const style = SIGNAL_STYLES[item.signal];
            return (
              <div key={`${item.name}-${index}`} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3 py-4 first:pt-0">
                <div className="pt-0.5 font-[var(--font-manrope)] text-xs text-white/25 tabular-nums">0{index + 1}</div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-[var(--font-manrope)] text-sm font-semibold text-white">{item.name}</div>
                      <div className="mt-0.5 text-[11px] text-white/40">{item.context}</div>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 rounded-[10px] border px-2 py-1 text-[10px] font-semibold ${style.bg} ${style.border} ${style.text}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                      {item.label}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-white/60">{item.reason}</p>
                  {item.id && <Link href={engagementDetailHref(empresaId, item, surface)} className="mt-2 inline-flex min-h-10 items-center gap-1 text-xs text-cyan-200 hover:underline">{t('report.focus.viewSignals')} <ArrowUpRight size={13} /></Link>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function CargoBreakdown({ data, semana }: { data: ReportView; semana: number }) {
  const t = useTranslations('EngagementWorkspace');
  const { num, pct: pctTexto } = useFormatadores();
  return <section aria-labelledby="cargo-title" className="engagement-report-cargos py-7">
    <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-300">{t('report.cargo.eyebrow')}</p>
    <h3 id="cargo-title" className="mt-1 font-[var(--font-manrope)] text-lg font-semibold text-white">{t('report.cargo.title')}</h3>
    <p className="mt-2 text-xs leading-relaxed text-white/60">
      {t('report.cargo.description', { week: semana })}
    </p>
    {data.cargos.length ? <div className="mt-5 space-y-3">
      {data.cargos.map((cargo) => <div key={cargo.cargo} className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h4 className="text-sm font-semibold text-white">{rotuloCargo(t, cargo.cargo)}</h4>
          <p className="text-xs text-white/55">{t('report.cargo.counts', { enrolled: cargo.participantes, eligible: cargo.elegiveis })}</p>
        </div>
        <dl className="my-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { chave: 'activated', value: cargo.ativados, pct: cargo.ativacaoPct },
            { chave: 'consumed', value: cargo.consumiram, pct: cargo.consumoPct },
            { chave: 'evidenced', value: cargo.evidencias, pct: cargo.evidenciaPct },
          ].map((metric) => <div key={metric.chave}>
            <dt className="text-[11px] text-white/50">{t(`report.thread.steps.${metric.chave}`)}</dt>
            <dd className="mt-1 text-sm text-white tabular-nums">{cargo.elegiveis ? <>{num(metric.value)} <span className="text-white/55">· {pctTexto(metric.pct)}</span></> : <span className="text-xs text-white/50">{t('report.cargo.noEligible')}</span>}</dd>
          </div>)}
          <div>
            <dt className="text-[11px] text-white/50">{t('report.cargo.atRisk')}</dt>
            <dd className={`mt-1 text-sm tabular-nums ${cargo.emRisco ? 'text-amber-200' : 'text-emerald-200'}`}>{num(cargo.emRisco)} · {pctTexto(cargo.riscoPct)}</dd>
            <dd className="mt-1 text-[10px] text-white/50">{t('report.cargo.riskSplit', { critical: cargo.criticos, attention: cargo.atencao })}</dd>
          </div>
        </dl>
        <p className="border-t border-white/10 pt-3 text-xs leading-relaxed text-white/65"><span className="font-semibold text-cyan-200">{t('report.cargo.suggestedAction')} </span>{cargo.acao}</p>
      </div>)}
    </div> : <p className="mt-4 text-sm text-white/60">{t('report.cargo.empty')}</p>}
  </section>;
}

export default function EngagementReport({ empresaId, empresaNome, surface, loadRollup, loadEvolution }: EngagementPanelProps) {
  const t = useTranslations('EngagementWorkspace');
  const locale = useLocale();
  const { num } = useFormatadores();
  const links = engagementLinks(empresaId, surface);
  const [audience, setAudience] = useState<Audience>(surface === 'rh' ? 'rh' : 'gestor');
  const [loading, setLoading] = useState(true);
  // Guarda só que falhou, nunca o texto do servidor: a mensagem sai do catálogo.
  const [erro, setErro] = useState<string | null>(null);
  const [rollup, setRollup] = useState<any>(null);
  const [evolucao, setEvolucao] = useState<EngagementEvolutionDashboard | null>(null);

  useEffect(() => {
    if (!empresaId) { setLoading(false); setRollup(null); setEvolucao(null); return; }
    let vivo = true;
    setLoading(true);
    setErro(null);
    Promise.all([loadRollup(), loadEvolution()])
      .then(([r, e]) => {
        if (!vivo) return;
        setRollup(r);
        if (r.resumo && 'erro' in r.resumo && r.resumo.erro) throw new Error(String(r.resumo.erro));
        if (e.ok) {
          setEvolucao(e.data);
        } else {
          setEvolucao(null);
          setErro('evolution');
        }
      })
      .catch(() => {
        if (!vivo) return;
        setErro('load');
      })
      .finally(() => {
        if (vivo) setLoading(false);
      });
    return () => { vivo = false; };
  }, [empresaId, loadRollup, loadEvolution]);

  const companyName = empresaNome || t('report.companyFallback');
  const hoje = useMemo(
    () => new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date()),
    [locale],
  );
  const semanaAtual = evolucao?.semanaAtual || evolucao?.semanas?.at(-1)?.semana || 0;

  const views = useMemo(() => {
    if (loading || erro || !evolucao) return null;
    return buildViews({ empresaNome: companyName, rollup, evolucao, t, locale });
  }, [loading, erro, rollup, evolucao, companyName, t, locale]);

  const data = views?.[audience] || null;

  const detailHref = appendEngagementQuery(links.dashboard, 'view', 'evolucao');

  const periodo = semanaAtual ? t('report.period', { week: semanaAtual, date: hoje }) : hoje;
  const ritmoAtencao = Boolean(data?.priorities.length);
  const pdfHref = empresaId
    ? appendEngagementQuery(links.pdf, 'publico', audience)
    : null;

  return (
    <div className="p-4 md:p-8">
      <div className="mx-auto max-w-[1320px]">
        <div className="engagement-report-toolbar mb-5 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <Link href={links.dashboard} className="inline-flex items-center gap-1.5 text-xs text-white/45 transition-colors hover:text-cyan-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300">
              <ArrowLeft size={13} aria-hidden="true" /> {t('report.back')}
            </Link>
            <h1 className="mt-3 font-[var(--font-manrope)] text-2xl font-semibold text-white">{t('report.title')}</h1>
            <p className="mt-1 text-xs text-white/40">{semanaAtual ? t('report.subtitleWeek', { company: companyName, week: semanaAtual }) : t('report.subtitle', { company: companyName })}</p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {surface === 'admin' && <div className="inline-flex rounded-[10px] border border-white/[0.08] bg-white/[0.035] p-1" role="group" aria-label={t('report.audienceAria')}>
              {([
                { key: 'gestor' as const, label: t('report.audience.gestor'), Icon: Users },
                { key: 'rh' as const, label: t('report.audience.rh'), Icon: Building2 },
              ]).map(({ key, label, Icon }) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={audience === key}
                  onClick={() => setAudience(key)}
                  className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-[10px] px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 sm:min-h-10 sm:flex-none ${
                    audience === key ? 'bg-cyan-300 text-[#06172c]' : 'text-white/50 hover:text-white'
                  }`}
                >
                  <Icon size={13} aria-hidden="true" /> {label}
                </button>
              ))}
            </div>}
            <button
              type="button"
              onClick={() => pdfHref && window.open(`${pdfHref}&view=inline`, '_blank', 'noopener,noreferrer')}
              disabled={!pdfHref || loading || !data}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] border border-white/[0.1] px-3 text-xs font-semibold text-white/65 transition-colors hover:border-cyan-300/30 hover:text-cyan-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 sm:min-h-10"
            >
              <Printer size={14} aria-hidden="true" /> {t('report.openPdf')}
            </button>
          </div>
        </div>

        {!empresaId && (
          <div className="rounded-[24px] border border-white/[0.1] bg-[#07192f] p-8 text-sm text-white/60">
            {t('report.noCompany')}
          </div>
        )}

        {empresaId && loading && (
          <div className="flex items-center gap-3 rounded-[24px] border border-white/[0.1] bg-[#07192f] p-8 text-sm text-white/60">
            <Loader2 size={18} className="animate-spin text-cyan-300" aria-hidden="true" />
            {t('report.loading')}
          </div>
        )}

        {empresaId && !loading && erro && (
          <div className="flex items-start gap-3 rounded-[24px] border border-rose-300/20 bg-rose-400/[0.06] p-8 text-sm text-rose-100/80">
            <CircleAlert size={18} className="mt-0.5 shrink-0 text-rose-300" aria-hidden="true" />
            <div>
              <p className="font-semibold text-rose-100">{t('report.errors.title')}</p>
              <p className="mt-1 text-xs text-rose-100/60">{t(erro === 'evolution' ? 'report.errors.evolution' : 'report.errors.load')}</p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="mt-3 inline-flex items-center gap-1.5 rounded-[10px] border border-rose-300/25 px-3 py-2 text-xs font-semibold text-rose-100 transition-colors hover:bg-rose-300/10"
              >
                {t('report.errors.retry')}
              </button>
            </div>
          </div>
        )}

        {empresaId && !loading && views && data && (
          <article className="engagement-report-paper relative overflow-hidden rounded-[24px] border border-white/[0.1] bg-[#07192f] text-white shadow-[0_28px_70px_rgba(0,0,0,.28)]">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(circle_at_18%_0%,rgba(52,197,204,.16),transparent_48%),radial-gradient(circle_at_88%_10%,rgba(158,78,221,.12),transparent_42%)]" />

            <header className="relative flex flex-col gap-5 border-b border-white/[0.08] px-5 py-5 sm:flex-row sm:items-center sm:justify-between md:px-9">
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-[10px] bg-cyan-300 text-[#06172c]">
                  <TrendingUp size={18} aria-hidden="true" />
                </div>
                <div>
                  <div className="font-[var(--font-manrope)] text-xs font-bold uppercase tracking-[0.16em] text-white">{surface === 'rh' ? companyName : 'Vertho'}</div>
                  <div className="text-[11px] text-white/40">{t('report.paperTitle')}</div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-white/45">
                <span className="inline-flex items-center gap-1.5"><Building2 size={12} aria-hidden="true" /> {companyName}</span>
                <span className="inline-flex items-center gap-1.5"><CalendarDays size={12} aria-hidden="true" /> {periodo}</span>
                <span className="inline-flex items-center gap-1.5 text-cyan-200"><Eye size={12} aria-hidden="true" /> {data.eyebrow}</span>
              </div>
            </header>

            <div className="relative px-5 py-5 md:px-9 md:py-6">
              <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
                <div>
                  <p className={`text-xs font-semibold ${ritmoAtencao ? 'text-amber-200' : 'text-cyan-200'}`}>{data.hasWeeklyData ? t('report.closing.priority', { week: data.week }) : t('report.closing.unavailable')}</p>
                  <h2 className="mt-2 max-w-3xl font-[var(--font-manrope)] text-2xl font-semibold leading-tight tracking-tight text-white md:text-3xl">{data.thesis}</h2>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-white/70">{data.explanation}</p>
                  <p className="mt-3 text-xs text-white/60">{data.canCompare ? t('report.closing.baseCompare', { eligible: data.eligible, previous: data.previousEligible }) : t('report.closing.baseNoCompare', { eligible: data.eligible })}</p>
                  {data.previousEligible !== null && data.previousEligible !== data.eligible && <p className="mt-1 text-xs text-amber-200">{t('report.closing.populationChanged')}</p>}
                </div>
                <aside className="rounded-xl border border-white/10 bg-white/[0.025] p-4" aria-label={t('report.trajectories.aria')}>
                  <h3 className="text-xs font-semibold text-white/70">{t('report.trajectories.title')}</h3>
                  <p className="mt-2 text-3xl font-semibold tabular-nums text-white">{num(data.risk.total)} <span className="text-xs font-normal text-white/60">{t('report.trajectories.ofTotal', { enrolled: data.enrolled })}</span></p>
                  <p className="mt-2 text-xs text-white/70">{t('report.cargo.riskSplit', { critical: data.risk.critical, attention: data.risk.attention })}</p>
                  <p className="mt-2 text-xs leading-relaxed text-white/60">{t('report.trajectories.note')}</p>
                  <a href="#trajetorias-prioritarias" className="mt-3 inline-flex min-h-10 items-center text-xs text-cyan-200 hover:underline">{t('report.trajectories.link')}</a>
                </aside>
              </section>

              <ReportPriorities key={audience} data={data} empresaId={empresaId} surface={surface} />

              <div className="mt-1">
                <EngagementThread data={data} />
              </div>

              <div className="grid gap-8 py-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(330px,.85fr)]">
                <section aria-labelledby="trend-title">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="font-[var(--font-manrope)] text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300/70">{t('report.trend.eyebrow')}</p>
                      <h3 id="trend-title" className="mt-1 font-[var(--font-manrope)] text-lg font-semibold text-white">{t('report.trend.title')}</h3>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-2 text-[10px] text-white/45">
                      {SERIES.map((series) => (
                        <span key={series.key} className="inline-flex items-center gap-1.5">
                          <span className="h-0.5 w-4 rounded-full" style={{ background: series.color }} /> {t(`trend.series.${series.chave}`)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <TrendChart points={data.trend} />
                </section>

                <FocusList data={data} empresaId={empresaId} surface={surface} />
              </div>

              <CargoBreakdown data={data} semana={semanaAtual} />

              <section className="grid divide-y divide-white/[0.07] border-y border-white/[0.08] sm:grid-cols-3 sm:divide-x sm:divide-y-0" aria-label={t('report.secondary.aria')}>
                <div className="flex items-center gap-3 py-4 sm:pr-5">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-emerald-300/[0.09] text-emerald-200"><RotateCcw size={16} aria-hidden="true" /></div>
                  <div><div className="font-[var(--font-manrope)] text-lg font-semibold text-white tabular-nums">{num(data.recovered)}</div><div className="text-[11px] text-white/40">{t('report.secondary.recovered')}</div></div>
                </div>
                <div className="flex items-center gap-3 py-4 sm:px-5">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-violet-300/[0.09] text-violet-200"><MessageSquareText size={16} aria-hidden="true" /></div>
                  <div><div className="font-[var(--font-manrope)] text-lg font-semibold text-white tabular-nums">{data.tutor}</div><div className="text-[11px] text-white/40">{t('report.secondary.tutor')}</div></div>
                </div>
                <div className="flex items-center gap-3 py-4 sm:pl-5">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-cyan-300/[0.09] text-cyan-200"><Activity size={16} aria-hidden="true" /></div>
                  <div><div className="font-[var(--font-manrope)] text-lg font-semibold text-white">{data.preferredFormat}</div><div className="text-[11px] text-white/40">{t('report.secondary.format')}</div></div>
                </div>
              </section>

              <footer className="flex flex-col gap-5 pt-7 md:flex-row md:items-center md:justify-between">
                <div className="flex max-w-3xl items-start gap-3">
                  <ShieldCheck size={16} className="mt-0.5 shrink-0 text-cyan-200/70" aria-hidden="true" />
                  <p className="text-[11px] leading-relaxed text-white/35">
                    {t('report.footer')}
                  </p>
                </div>
                <Link
                  href={detailHref}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-[10px] bg-cyan-300 px-4 text-xs font-bold text-[#06172c] transition-colors hover:bg-cyan-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-200"
                >
                  {t('report.detailedData')} <ArrowUpRight size={14} aria-hidden="true" />
                </Link>
              </footer>
            </div>
          </article>
        )}

        {empresaId && !loading && views && data && (
          <div className="engagement-report-toolbar mt-4 flex flex-wrap items-center justify-between gap-3 text-[11px] text-white/35">
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={12} className="text-emerald-300" aria-hidden="true" /> {t('report.available')}</span>
            <a href={pdfHref || undefined} className="inline-flex items-center gap-1.5 text-white/45 transition-colors hover:text-cyan-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300"><Download size={12} aria-hidden="true" /> {t('report.downloadPdf')}</a>
          </div>
        )}
      </div>

      <style jsx global>{`
        @page { margin: 0; }
        @media print {
          html, body { background: #07192f !important; }
          /* Fora do PDF: chrome do admin + ferramentas da tela. As classes
             admin-* só têm efeito com este relatório montado, então as outras
             telas do admin imprimem como antes. */
          .admin-print-hide,
          .engagement-report-toolbar { display: none !important; }
          /* Desfaz o shell com overflow/flex, que recortaria o relatório na
             altura da viewport em vez de paginar o conteúdo inteiro. */
          .admin-shell-root { display: block !important; min-height: auto !important; }
          .admin-shell-column { display: block !important; overflow: visible !important; }
          .admin-shell-main { overflow: visible !important; }
          /* Mantém títulos junto dos gráficos e evita cortar as prioridades. */
          .engagement-report-paper section,
          .engagement-report-paper header,
          .engagement-report-paper footer { break-inside: avoid; }
          .engagement-report-paper .engagement-report-cargos { break-inside: auto; }
          .engagement-report-cargos > div > div { break-inside: avoid; }
          .engagement-report-paper {
            overflow: visible !important;
            border: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>
    </div>
  );
}
