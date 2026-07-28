'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowLeft,
  ChartNoAxesCombined,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  RefreshCw,
  RotateCcw,
  TriangleAlert,
} from 'lucide-react';
import AdminPageHeader from '@/components/admin/page-header';
import { useEmpresaContexto } from '@/app/admin/_shell/useEmpresaContexto';
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
  accelerating: { label: 'Acelerando', bar: 'bg-emerald-500', text: 'text-emerald-400' },
  on_track: { label: 'No ritmo', bar: 'bg-cyan-500', text: 'text-cyan-400' },
  attention: { label: 'Atenção', bar: 'bg-amber-500', text: 'text-amber-400' },
  critical: { label: 'Crítico', bar: 'bg-rose-500', text: 'text-rose-400' },
};

function pctDelta(current: number, previous?: number): string {
  if (previous == null) return 'sem semana anterior';
  const delta = current - previous;
  if (delta === 0) return 'estável vs. semana anterior';
  return `${delta > 0 ? '↑' : '↓'} ${Math.abs(delta)} pp vs. semana anterior`;
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
    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
      <div className="flex items-center justify-between gap-2 text-xs text-gray-400">
        <span>{label}</span>
        <Icon size={15} className={color} />
      </div>
      <div className="text-2xl font-bold text-white mt-1 tabular-nums">{value}</div>
      <div className="text-[11px] text-gray-500 mt-1">{detail}</div>
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
    <section>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Evolução semana a semana</h2>
          <p className="text-[11px] text-gray-500">
            Percentual sobre quem já alcançou cada semana
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap text-[11px] text-gray-400">
          {series.map((item) => (
            <span key={item.field} className="inline-flex items-center gap-1.5">
              <span className="w-4 h-0.5 rounded-full" style={{ background: item.stroke }} />
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
                <line x1={CHART.left} y1={y} x2={CHART.right} y2={y}
                  stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
                <text x="7" y={y + 4} fill="#6b7280" fontSize="11">{tick}%</text>
              </g>
            );
          })}

          {weeks.map((week, index) => (
            <text
              key={week.semana}
              x={xFor(index, weeks.length)}
              y="254"
              textAnchor="middle"
              fill="#6b7280"
              fontSize="11"
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
                  stroke="#0f172a"
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
                  fontSize="11"
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
    <aside className="bg-white/5 border border-white/10 rounded-xl p-4">
      <h2 className="text-sm font-semibold text-white">Trajetórias atuais</h2>
      <p className="text-[11px] text-gray-500 mt-0.5">Últimas duas semanas alcançadas</p>
      <div className="space-y-3 mt-4">
        {ordered.map((key) => {
          const value = trajectories[key];
          const percentage = total ? Math.round((value / total) * 100) : 0;
          const meta = TRAJECTORY_META[key];
          return (
            <div key={key}>
              <div className="flex items-center justify-between text-xs gap-3">
                <span className="text-gray-300">{meta.label}</span>
                <span className={`${meta.text} tabular-nums`}>{value} · {percentage}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mt-1.5">
                <div className={`h-full rounded-full ${meta.bar}`} style={{ width: `${percentage}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="border-t border-white/10 mt-4 pt-3 flex items-start gap-2">
        <RotateCcw size={14} className="text-emerald-400 mt-0.5 shrink-0" />
        <div>
          <div className="text-xs text-white font-medium">{recovered} recuperado{recovered === 1 ? '' : 's'}</div>
          <div className="text-[11px] text-gray-500">voltaram a apresentar atividade nesta semana</div>
        </div>
      </div>
    </aside>
  );
}

function heatCellClass(value: number | null): string {
  if (value == null) return 'bg-white/[0.02] text-gray-700';
  if (value >= 70) return 'bg-emerald-500/20 text-emerald-300';
  if (value >= 40) return 'bg-cyan-500/20 text-cyan-300';
  if (value > 0) return 'bg-amber-500/20 text-amber-300';
  return 'bg-rose-500/15 text-rose-300';
}

function AreaHeatmap({ areas, weeks }: { areas: EngagementAreaMetric[]; weeks: number[] }) {
  return (
    <section className="mt-7">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Ritmo de evolução por área</h2>
          <p className="text-[11px] text-gray-500">
            Índice operacional: ativação 20 · consumo 30 · evidência 40 · tutor 10
          </p>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-gray-500">
          <span className="w-3 h-3 rounded bg-rose-500/15" /> 0
          <span className="w-3 h-3 rounded bg-amber-500/20" /> 1–39
          <span className="w-3 h-3 rounded bg-cyan-500/20" /> 40–69
          <span className="w-3 h-3 rounded bg-emerald-500/20" /> 70+
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-xs border-separate border-spacing-1">
          <thead>
            <tr className="text-gray-500">
              <th className="text-left font-medium px-2 py-1 min-w-[170px]">Área</th>
              {weeks.map((week) => (
                <th key={week} className="font-medium px-1 py-1 text-center">S{week}</th>
              ))}
              <th className="font-medium px-2 py-1 text-right">Tend.</th>
            </tr>
          </thead>
          <tbody>
            {areas.map((area) => (
              <tr key={area.area}>
                <td className="px-2 py-2 text-gray-300">
                  <div className="font-medium">{area.area}</div>
                  <div className="text-[10px] text-gray-600">{area.participantes} participante{area.participantes === 1 ? '' : 's'}</div>
                </td>
                {area.semanas.map((week) => (
                  <td key={week.semana} className="p-0.5 text-center">
                    <div
                      className={`rounded-lg px-2 py-2 tabular-nums ${heatCellClass(week.indice)}`}
                      title={week.indice == null
                        ? `Semana ${week.semana}: sem elegíveis`
                        : `Semana ${week.semana}: índice ${week.indice} · ${week.elegiveis} elegíveis`}
                    >
                      {week.indice ?? '—'}
                    </div>
                  </td>
                ))}
                <td className={`px-2 py-2 text-right tabular-nums ${
                  (area.tendencia ?? 0) < 0 ? 'text-rose-400' : 'text-emerald-400'
                }`}>
                  {area.tendencia == null
                    ? '—'
                    : `${area.tendencia >= 0 ? '↑' : '↓'} ${Math.abs(area.tendencia)}`}
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
    <section className="mt-7">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-white">Acompanhamento operacional</h2>
        <p className="text-[11px] text-gray-500">
          Participantes em atenção ou críticos na semana atual de cada jornada
        </p>
      </div>
      <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[720px]">
            <thead>
              <tr className="text-left text-gray-500 border-b border-white/10">
                <th className="font-medium px-4 py-2.5">Participante</th>
                <th className="font-medium px-3 py-2.5">Área</th>
                <th className="font-medium px-3 py-2.5 text-center">Índice</th>
                <th className="font-medium px-3 py-2.5 text-center">Δ semanal</th>
                <th className="font-medium px-3 py-2.5">Sinal</th>
                <th className="font-medium px-3 py-2.5">Motivo</th>
              </tr>
            </thead>
            <tbody>
              {data.pessoasEmRisco.map((person) => {
                const meta = TRAJECTORY_META[person.trajetoria];
                return (
                  <tr key={person.colaboradorId} className="border-b border-white/5 last:border-b-0 hover:bg-white/[0.03]">
                    <td className="px-4 py-2.5">
                      <div className="text-gray-200 font-medium">{person.nome}</div>
                      <div className="text-[10px] text-gray-600">{person.cargo || 'Sem cargo'}</div>
                    </td>
                    <td className="px-3 py-2.5 text-gray-400">
                      <div>{person.area}</div>
                      <div className="text-[10px] text-gray-600">Semana {person.semanaAtual}</div>
                    </td>
                    <td className="px-3 py-2.5 text-center text-white tabular-nums">{person.indiceAtual}</td>
                    <td className={`px-3 py-2.5 text-center tabular-nums ${
                      person.delta < 0 ? 'text-rose-400' : person.delta > 0 ? 'text-emerald-400' : 'text-gray-500'
                    }`}>
                      {person.delta > 0 ? '+' : ''}{person.delta}
                    </td>
                    <td className={`px-3 py-2.5 ${meta.text}`}>{meta.label}</td>
                    <td className="px-3 py-2.5 text-gray-400">{person.motivo}</td>
                  </tr>
                );
              })}
              {!data.pessoasEmRisco.length && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    Nenhum participante em atenção neste recorte.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export default function EngajamentoEvolucaoPage() {
  const { empresaId, empresa } = useEmpresaContexto();
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
    const resetTimer = window.setTimeout(() => {
      setArea('');
      setData(null);
      setError(null);
    }, 0);
    return () => window.clearTimeout(resetTimer);
  }, [empresaId]);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      void carregar();
    }, 0);
    return () => window.clearTimeout(loadTimer);
  }, [carregar]);

  const current = data?.semanas.at(-1);
  const previous = data && data.semanas.length > 1 ? data.semanas.at(-2) : undefined;
  const weekNumbers = useMemo(() => data?.semanas.map((week) => week.semana) || [], [data]);

  return (
    <div>
      <AdminPageHeader
        icon={ChartNoAxesCombined}
        iconClassName="text-cyan-400"
        title={(
          <span className="inline-flex items-center gap-2">
            Engajamento & evolução
            <span className="text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-cyan-400/10 text-cyan-300 border border-cyan-400/20">
              Página B
            </span>
          </span>
        )}
        subtitle={empresa?.nome
          ? `${empresa.nome} — acompanhamento longitudinal da jornada`
          : 'Selecione uma empresa no filtro do topo'}
        actions={(
          <>
            <Link
              href={empresaId ? `/admin/engajamento?empresa=${empresaId}` : '/admin/engajamento'}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10"
            >
              <ArrowLeft size={13} /> Visão atual
            </Link>
            <select
              value={area}
              onChange={(event) => setArea(event.target.value)}
              disabled={!empresaId || loading}
              aria-label="Filtrar por área"
              className="text-xs px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-300 disabled:opacity-40 max-w-[220px]"
            >
              <option value="">Todas as áreas</option>
              {(data?.areasDisponiveis || []).map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={carregar}
              disabled={!empresaId || loading}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 disabled:opacity-40"
            >
              {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              Atualizar
            </button>
          </>
        )}
      />

      {!empresaId && (
        <div className="text-sm text-gray-500 bg-white/5 border border-white/10 rounded-xl p-6 text-center">
          Escolha uma empresa no filtro do topo para ver a evolução semanal.
        </div>
      )}

      {empresaId && error && (
        <div className="text-sm text-rose-300 bg-rose-500/10 border border-rose-400/20 rounded-xl p-4 mb-4">
          Não foi possível carregar a página B: {error}
        </div>
      )}

      {empresaId && loading && !data && (
        <div className="flex items-center gap-2 text-sm text-gray-500 p-6">
          <Loader2 size={16} className="animate-spin" /> Montando evolução semanal…
        </div>
      )}

      {empresaId && data && current && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <MetricCard
              icon={Activity}
              label="Ativação semanal"
              value={`${current.ativacaoPct}%`}
              detail={pctDelta(current.ativacaoPct, previous?.ativacaoPct)}
              color="text-cyan-400"
            />
            <MetricCard
              icon={CheckCircle2}
              label="Consumo"
              value={`${current.consumoPct}%`}
              detail={pctDelta(current.consumoPct, previous?.consumoPct)}
              color="text-emerald-400"
            />
            <MetricCard
              icon={ClipboardCheck}
              label="Evidência prática"
              value={`${current.evidenciaPct}%`}
              detail={pctDelta(current.evidenciaPct, previous?.evidenciaPct)}
              color="text-amber-400"
            />
            <MetricCard
              icon={TriangleAlert}
              label="Em risco"
              value={data.emRisco}
              detail="atenção + crítico no estágio atual"
              color="text-rose-400"
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2.2fr)_minmax(250px,0.8fr)] gap-5">
            <WeeklyTrendChart weeks={data.semanas} />
            <TrajectoriesCard trajectories={data.trajetorias} recovered={data.recuperados} />
          </div>

          <AreaHeatmap areas={data.areas} weeks={weekNumbers} />
          <RiskTable data={data} />

          <div className="mt-4 text-[11px] text-gray-600 leading-relaxed">
            <strong className="text-gray-500">Leitura do índice:</strong>{' '}
            ativou a página ou um formato = 20 pontos; consumiu conteúdo = 30;
            enviou a evidência que conclui a semana = 40; usou o Tira-Dúvidas = 10.
            O índice mede movimento operacional na jornada — não qualidade da resposta,
            competência ou desempenho individual.
          </div>
        </>
      )}

      {empresaId && data && !current && !loading && (
        <div className="text-sm text-gray-500 bg-white/5 border border-white/10 rounded-xl p-6 text-center">
          Ainda não há participantes inscritos na cadência.
        </div>
      )}
    </div>
  );
}
