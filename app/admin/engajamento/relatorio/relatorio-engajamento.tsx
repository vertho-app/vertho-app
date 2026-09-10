'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
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
import { useEmpresaContexto } from '@/app/admin/_shell/useEmpresaContexto';
import { getEngajamentoEmpresa, getEvolucaoEngajamentoEmpresa } from '@/actions/engajamento';
import type { EngagementEvolutionDashboard } from '@/lib/engagement-evolution';
import { buildViews, type Audience, type Signal, type TrendPoint, type ReportView } from '@/lib/engajamento/relatorio-model';

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

const SERIES = [
  { key: 'activation' as const, label: 'Ativação', color: '#34c5cc' },
  { key: 'consumption' as const, label: 'Consumo', color: '#55d6a0' },
  { key: 'evidence' as const, label: 'Evidência', color: '#f4b740' },
];

function signedDelta(value: number) {
  if (value === 0) return 'estável';
  return `${value > 0 ? '+' : '−'}${Math.abs(value)} pp`;
}

function MetricDelta({ value }: { value: number }) {
  const positive = value >= 0;
  const Icon = positive ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${positive ? 'text-emerald-300' : 'text-rose-300'}`}>
      <Icon size={12} aria-hidden="true" />
      {signedDelta(value)}
    </span>
  );
}

function EngagementThread({ data }: { data: ReportView }) {
  const steps = [
    { label: 'Elegíveis', count: data.eligible, pct: 100, delta: null as number | null, color: '#77e7ee' },
    { label: 'Ativaram', count: data.activation.count, pct: data.activation.pct, delta: data.activation.delta, color: '#34c5cc' },
    { label: 'Consumiram', count: data.consumption.count, pct: data.consumption.pct, delta: data.consumption.delta, color: '#55d6a0' },
    { label: 'Evidenciaram', count: data.evidence.count, pct: data.evidence.pct, delta: data.evidence.delta, color: '#f4b740' },
  ];

  const perdas = [
    { de: 'elegíveis', para: 'ativação', perda: data.eligible - data.activation.count },
    { de: 'ativação', para: 'consumo', perda: data.activation.count - data.consumption.count },
    { de: 'consumo', para: 'evidência', perda: data.consumption.count - data.evidence.count },
  ].filter((p) => p.perda > 0);
  const maior = perdas.length ? [...perdas].sort((a, b) => b.perda - a.perda)[0] : null;

  return (
    <section aria-labelledby="engagement-thread-title" className="border-y border-white/[0.08] py-7 md:py-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-[var(--font-manrope)] text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300/70">
            Fio de engajamento
          </p>
          <h3 id="engagement-thread-title" className="mt-1 font-[var(--font-manrope)] text-lg font-semibold text-white">
            Onde o movimento perde força
          </h3>
        </div>
        <p className="text-xs text-white/40">Fechamento do estágio esperado · base elegível</p>
      </div>

      <div className="mt-6 hidden sm:block">
        <div className="grid grid-cols-4">
          {steps.map((step, index) => (
            <div key={step.label} className={`min-w-0 px-3 first:pl-0 last:pr-0 ${index ? 'border-l border-white/[0.07]' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-[var(--font-manrope)] text-[30px] font-semibold leading-none text-white tabular-nums">
                    {step.count}
                  </div>
                  <div className="mt-1 text-xs text-white/50">{step.label}</div>
                </div>
                <div className="text-right">
                  <div className="font-[var(--font-manrope)] text-base font-semibold tabular-nums" style={{ color: step.color }}>
                    {step.pct}%
                  </div>
                  {step.delta != null && <MetricDelta value={step.delta} />}
                </div>
              </div>
            </div>
          ))}
        </div>

        <svg
          viewBox="0 0 880 82"
          preserveAspectRatio="none"
          className="mt-4 h-[82px] w-full"
          role="img"
          aria-label={`${data.eligible} elegíveis, ${data.activation.count} ativaram, ${data.consumption.count} consumiram e ${data.evidence.count} enviaram evidência`}
        >
          <defs>
            <linearGradient id="engagement-flow-gradient" x1="0" x2="1">
              <stop offset="0" stopColor="#77e7ee" />
              <stop offset="0.55" stopColor="#34c5cc" />
              <stop offset="0.78" stopColor="#55d6a0" />
              <stop offset="1" stopColor="#f4b740" />
            </linearGradient>
            <filter id="engagement-flow-glow" x="-20%" y="-60%" width="140%" height="220%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <path
            d="M 8 16 C 95 16, 150 23, 220 26 S 365 36, 440 39 S 585 46, 660 51 S 800 64, 872 67"
            fill="none"
            stroke="url(#engagement-flow-gradient)"
            strokeWidth="11"
            strokeLinecap="round"
            filter="url(#engagement-flow-glow)"
          />
          {[{ x: 8, y: 16 }, { x: 220, y: 26 }, { x: 440, y: 39 }, { x: 660, y: 51 }, { x: 872, y: 67 }].map((point, index) => (
            <circle key={index} cx={point.x} cy={point.y} r="4.5" fill="#07192f" stroke="#d9fbff" strokeWidth="2" />
          ))}
        </svg>

        {maior && (
          <div className="mt-2 flex items-center gap-2 text-xs text-rose-200/80">
            <CircleAlert size={14} aria-hidden="true" />
            Maior perda: {maior.perda} {maior.perda === 1 ? 'pessoa' : 'pessoas'} entre {maior.de} e {maior.para}.
          </div>
        )}
      </div>

      <div className="mt-5 space-y-4 sm:hidden">
        {steps.map((step) => (
          <div key={step.label}>
            <div className="flex items-end justify-between gap-3">
              <div>
                <span className="font-[var(--font-manrope)] text-xl font-semibold text-white tabular-nums">{step.count}</span>
                <span className="ml-2 text-xs text-white/50">{step.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-[var(--font-manrope)] text-sm font-semibold tabular-nums" style={{ color: step.color }}>{step.pct}%</span>
                {step.delta != null && <MetricDelta value={step.delta} />}
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

function TrendChart({ points }: { points: TrendPoint[] }) {
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
    return <p className="mt-5 text-xs text-white/40">Sem histórico suficiente para a trajetória — os fechamentos aparecem aqui a partir da segunda semana.</p>;
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
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Tendência dos últimos fechamentos semanais">
          {[25, 50, 75, 100].map((tick) => (
            <g key={tick}>
              <line x1={left} x2={right} y1={y(tick)} y2={y(tick)} stroke="rgba(255,255,255,.07)" strokeWidth="1" />
              <text x="3" y={y(tick) + 4} fill="rgba(255,255,255,.35)" fontSize="10">{tick}%</text>
            </g>
          ))}
          {SERIES.map((series) => (
            <g key={series.key}>
              <path d={path(series.key)} fill="none" stroke={series.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              {points.map((point, index) => (
                <circle key={point.label} cx={x(index)} cy={y(point[series.key])} r="4" fill="#07192f" stroke={series.color} strokeWidth="2" />
              ))}
              <text x={right + 12} y={labelY.get(series.key)} fill={series.color} fontSize="10" fontWeight="600">
                {series.label} {points.at(-1)?.[series.key]}%
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
                  {series.label}
                </span>
                <span className="font-[var(--font-manrope)] font-semibold text-white tabular-nums">
                  {current}% <span className={current >= previous ? 'text-emerald-300' : 'text-rose-300'}>({signedDelta(current - previous)})</span>
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

function FocusList({ data }: { data: ReportView }) {
  return (
    <section aria-labelledby="focus-title" className="h-full border-l border-white/[0.08] pl-0 lg:pl-7">
      <p className="font-[var(--font-manrope)] text-[10px] font-bold uppercase tracking-[0.2em] text-amber-200/70">
        Decisão
      </p>
      <h3 id="focus-title" className="mt-1 font-[var(--font-manrope)] text-lg font-semibold text-white">{data.focusTitle}</h3>
      <p className="mt-1 max-w-md text-xs leading-relaxed text-white/40">{data.focusSubtitle}</p>

      {data.focusItems.length === 0 ? (
        <p className="mt-5 text-xs leading-relaxed text-white/40">Ninguém em acompanhamento nesta semana — bom sinal. O relatório volta a listar prioridades no próximo fechamento.</p>
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
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function RelatorioEngajamento() {
  const { empresaId, empresa } = useEmpresaContexto();
  const [audience, setAudience] = useState<Audience>('gestor');
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [rollup, setRollup] = useState<any>(null);
  const [evolucao, setEvolucao] = useState<EngagementEvolutionDashboard | null>(null);

  useEffect(() => {
    if (!empresaId) { setLoading(false); setRollup(null); setEvolucao(null); return; }
    let vivo = true;
    setLoading(true);
    setErro(null);
    Promise.all([getEngajamentoEmpresa(empresaId), getEvolucaoEngajamentoEmpresa(empresaId)])
      .then(([r, e]) => {
        if (!vivo) return;
        setRollup(r);
        if (e.ok) {
          setEvolucao(e.data);
        } else {
          setEvolucao(null);
          // `in` em vez de ler `e.error` direto: o tsconfig roda com
          // `strict: false`, e sem ele a união discriminada por BOOLEANO não
          // estreita — o ramo `else` continua com o tipo dos dois lados, e
          // `e.error` não compila. `in` estreita independente de strict.
          setErro('error' in e ? e.error : 'Falha ao carregar a evolução do engajamento.');
        }
      })
      .catch((err) => {
        if (!vivo) return;
        setErro(err?.message || 'Falha ao carregar os dados do relatório.');
      })
      .finally(() => {
        if (vivo) setLoading(false);
      });
    return () => { vivo = false; };
  }, [empresaId]);

  const companyName = empresa?.nome || 'Empresa';
  const hoje = useMemo(
    () => new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }),
    [],
  );
  const semanaAtual = evolucao?.semanaAtual || evolucao?.semanas?.at(-1)?.semana || 0;

  const views = useMemo(() => {
    if (loading || !rollup && !evolucao) return null;
    return buildViews({ empresaNome: companyName, rollup, evolucao });
  }, [loading, rollup, evolucao, companyName]);

  const data = views?.[audience] || null;

  const detailHref = useMemo(() => (
    empresaId
      ? `/admin/engajamento?empresa=${encodeURIComponent(empresaId)}&view=evolucao`
      : '/admin/engajamento?view=evolucao'
  ), [empresaId]);

  const periodo = semanaAtual ? `Semana ${semanaAtual} · ${hoje}` : hoje;
  const ritmoAtencao = (data?.risk.total || 0) > 0 || (data?.evidence.pct || 0) < 60;
  const pdfHref = empresaId
    ? `/api/relatorios/engajamento/pdf?empresa=${encodeURIComponent(empresaId)}&publico=${audience}`
    : null;

  return (
    <div className="p-4 md:p-8">
      <div className="mx-auto max-w-[1320px]">
        <div className="engagement-report-toolbar mb-5 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <Link href={empresaId ? `/admin/engajamento?empresa=${encodeURIComponent(empresaId)}` : '/admin/engajamento'} className="inline-flex items-center gap-1.5 text-xs text-white/45 transition-colors hover:text-cyan-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300">
              <ArrowLeft size={13} aria-hidden="true" /> Voltar ao engajamento
            </Link>
            <h1 className="mt-3 font-[var(--font-manrope)] text-2xl font-semibold text-white">Relatório semanal</h1>
            <p className="mt-1 text-xs text-white/40">Dados reais · {companyName}{semanaAtual ? ` · semana ${semanaAtual}` : ''} · base elegível do fechamento</p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="inline-flex rounded-[10px] border border-white/[0.08] bg-white/[0.035] p-1" role="group" aria-label="Público do relatório">
              {([
                { key: 'gestor' as const, label: 'Gestor', Icon: Users },
                { key: 'rh' as const, label: 'RH / Diretoria', Icon: Building2 },
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
            </div>
            <button
              type="button"
              onClick={() => pdfHref && window.open(`${pdfHref}&view=inline`, '_blank', 'noopener,noreferrer')}
              disabled={!pdfHref || loading || !data}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] border border-white/[0.1] px-3 text-xs font-semibold text-white/65 transition-colors hover:border-cyan-300/30 hover:text-cyan-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 sm:min-h-10"
            >
              <Printer size={14} aria-hidden="true" /> Abrir PDF para impressão
            </button>
          </div>
        </div>

        {!empresaId && (
          <div className="rounded-[24px] border border-white/[0.1] bg-[#07192f] p-8 text-sm text-white/60">
            Selecione uma empresa no filtro do topo para ver o relatório.
          </div>
        )}

        {empresaId && loading && (
          <div className="flex items-center gap-3 rounded-[24px] border border-white/[0.1] bg-[#07192f] p-8 text-sm text-white/60">
            <Loader2 size={18} className="animate-spin text-cyan-300" aria-hidden="true" />
            Carregando dados reais do fechamento…
          </div>
        )}

        {empresaId && !loading && erro && !evolucao && !rollup?.resumo && (
          <div className="flex items-start gap-3 rounded-[24px] border border-rose-300/20 bg-rose-400/[0.06] p-8 text-sm text-rose-100/80">
            <CircleAlert size={18} className="mt-0.5 shrink-0 text-rose-300" aria-hidden="true" />
            <div>
              <p className="font-semibold text-rose-100">Não foi possível carregar o relatório.</p>
              <p className="mt-1 text-xs text-rose-100/60">{erro}</p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="mt-3 inline-flex items-center gap-1.5 rounded-[10px] border border-rose-300/25 px-3 py-2 text-xs font-semibold text-rose-100 transition-colors hover:bg-rose-300/10"
              >
                Tentar de novo
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
                  <div className="font-[var(--font-manrope)] text-xs font-bold uppercase tracking-[0.16em] text-white">Vertho</div>
                  <div className="text-[11px] text-white/40">Relatório semanal de engajamento</div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-white/45">
                <span className="inline-flex items-center gap-1.5"><Building2 size={12} aria-hidden="true" /> {companyName}</span>
                <span className="inline-flex items-center gap-1.5"><CalendarDays size={12} aria-hidden="true" /> {periodo}</span>
                <span className="inline-flex items-center gap-1.5 text-cyan-200"><Eye size={12} aria-hidden="true" /> {data.eyebrow}</span>
              </div>
            </header>

            <div className="relative px-5 py-8 md:px-9 md:py-10">
              <section className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-end">
                <div>
                  <div className="inline-flex items-center gap-2 text-[11px] font-semibold text-amber-200">
                    <span className={`h-2 w-2 rounded-full ${ritmoAtencao ? 'bg-amber-300 shadow-[0_0_14px_rgba(244,183,64,.75)]' : 'bg-emerald-300 shadow-[0_0_14px_rgba(52,211,153,.75)]'}`} />
                    {ritmoAtencao ? 'Ritmo em atenção' : 'Ritmo saudável'} · {data.scope}
                  </div>
                  <h2 className="mt-5 max-w-[820px] font-[var(--font-manrope)] text-[clamp(2rem,5vw,4.4rem)] font-semibold leading-[0.98] tracking-[-0.045em] text-white">
                    {data.thesis}<br />
                    <span className="font-[var(--font-serif)] font-normal italic tracking-[-0.02em] text-amber-200">{data.thesisAccent}</span>
                  </h2>
                  <p className="mt-5 max-w-2xl text-sm leading-6 text-white/55">{data.explanation}</p>
                </div>

                <aside className="border-l border-rose-300/25 pl-5" aria-label="Pessoas em risco">
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-rose-200/70">
                    <CircleAlert size={13} aria-hidden="true" /> Requer acompanhamento
                  </div>
                  <div className="mt-3 flex items-end gap-3">
                    <span className="font-[var(--font-manrope)] text-6xl font-semibold leading-none text-rose-200 tabular-nums">{data.risk.total}</span>
                    <span className="pb-1.5 text-xs leading-5 text-white/45">{data.risk.critical} críticos<br />{data.risk.attention} em atenção</span>
                  </div>
                </aside>
              </section>

              <div className="mt-9">
                <EngagementThread data={data} />
              </div>

              <div className="grid gap-8 py-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(330px,.85fr)]">
                <section aria-labelledby="trend-title">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="font-[var(--font-manrope)] text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300/70">Trajetória</p>
                      <h3 id="trend-title" className="mt-1 font-[var(--font-manrope)] text-lg font-semibold text-white">Últimos fechamentos, mesma régua</h3>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-2 text-[10px] text-white/45">
                      {SERIES.map((series) => (
                        <span key={series.key} className="inline-flex items-center gap-1.5">
                          <span className="h-0.5 w-4 rounded-full" style={{ background: series.color }} /> {series.label}
                        </span>
                      ))}
                    </div>
                  </div>
                  <TrendChart points={data.trend} />
                </section>

                <FocusList data={data} />
              </div>

              <section className="grid divide-y divide-white/[0.07] border-y border-white/[0.08] sm:grid-cols-3 sm:divide-x sm:divide-y-0" aria-label="Sinais secundários">
                <div className="flex items-center gap-3 py-4 sm:pr-5">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-emerald-300/[0.09] text-emerald-200"><RotateCcw size={16} aria-hidden="true" /></div>
                  <div><div className="font-[var(--font-manrope)] text-lg font-semibold text-white tabular-nums">{data.recovered}</div><div className="text-[11px] text-white/40">recuperaram o ritmo</div></div>
                </div>
                <div className="flex items-center gap-3 py-4 sm:px-5">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-violet-300/[0.09] text-violet-200"><MessageSquareText size={16} aria-hidden="true" /></div>
                  <div><div className="font-[var(--font-manrope)] text-lg font-semibold text-white tabular-nums">{data.tutor}</div><div className="text-[11px] text-white/40">usaram o Tira-Dúvidas</div></div>
                </div>
                <div className="flex items-center gap-3 py-4 sm:pl-5">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-cyan-300/[0.09] text-cyan-200"><Activity size={16} aria-hidden="true" /></div>
                  <div><div className="font-[var(--font-manrope)] text-lg font-semibold text-white">{data.preferredFormat}</div><div className="text-[11px] text-white/40">formato com maior adesão</div></div>
                </div>
              </section>

              <footer className="flex flex-col gap-5 pt-7 md:flex-row md:items-center md:justify-between">
                <div className="flex max-w-3xl items-start gap-3">
                  <ShieldCheck size={16} className="mt-0.5 shrink-0 text-cyan-200/70" aria-hidden="true" />
                  <p className="text-[11px] leading-relaxed text-white/35">
                    Engajamento mede movimento na jornada, não desempenho. Os percentuais usam participantes previstos para o estágio no período e comparam snapshots semanais fechados. Nomes individuais nunca aparecem na mensagem do WhatsApp.
                  </p>
                </div>
                <Link
                  href={detailHref}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-[10px] bg-cyan-300 px-4 text-xs font-bold text-[#06172c] transition-colors hover:bg-cyan-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-200"
                >
                  Ver dados detalhados <ArrowUpRight size={14} aria-hidden="true" />
                </Link>
              </footer>
            </div>
          </article>
        )}

        {empresaId && !loading && views && data && (
          <div className="engagement-report-toolbar mt-4 flex flex-wrap items-center justify-between gap-3 text-[11px] text-white/35">
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={12} className="text-emerald-300" aria-hidden="true" /> Relatório disponível para consulta e impressão.</span>
            <a href={pdfHref || undefined} className="inline-flex items-center gap-1.5 text-white/45 transition-colors hover:text-cyan-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300"><Download size={12} aria-hidden="true" /> Baixar PDF</a>
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
