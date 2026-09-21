'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { WeeklyTrendPoint } from '@/lib/demo/engajamento-historico';

const SERIES = [
  { field: 'ativacaoPct', label: 'Ativação', color: '#22d3ee', dash: '6 5' },
  { field: 'consumoPct', label: 'Consumo', color: '#34d399', dash: undefined },
  { field: 'evidenciaPct', label: 'Evidência', color: '#fbbf24', dash: undefined },
] as const;

export default function WeeklyTrendChart({ weeks, illustrative = false }: {
  weeks: WeeklyTrendPoint[];
  illustrative?: boolean;
}) {
  const id = useId();
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(760);
  const [selected, setSelected] = useState<number | null>(null);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, entry.contentRect.width)));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const currentIndex = selected == null ? weeks.length - 1 : Math.min(selected, weeks.length - 1);
  const current = weeks[currentIndex];
  const left = 40, right = width - 14, top = 16, bottom = 216;
  const x = (i: number) => weeks.length <= 1 ? (left + right) / 2 : left + i * (right - left) / (weeks.length - 1);
  const labelStep = Math.max(1, Math.ceil(weeks.length / Math.max(2, Math.floor((right - left) / 28))));
  const y = (value: number) => bottom - value / 100 * (bottom - top);
  // Controles dentro de cada intervalo: suaviza sem criar picos ou percentuais
  // que não existem nos pontos da série (inclusive quando a tendência muda).
  const pathFor = (field: typeof SERIES[number]['field']) => weeks.map((week, i) => {
    if (!i) return `M ${x(i)} ${y(week[field])}`;
    const middle = (x(i - 1) + x(i)) / 2;
    return `C ${middle} ${y(weeks[i - 1][field])}, ${middle} ${y(week[field])}, ${x(i)} ${y(week[field])}`;
  }).join(' ');

  return (
    <section aria-labelledby={`${id}-title`} className="min-w-0 rounded-[24px] border border-white/[0.08] bg-white/[0.025] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/50">Histórico</p>
          <h3 id={`${id}-title`} className="mt-1 text-[24px] leading-tight text-white"
            style={{ fontFamily: 'var(--font-serif, "Instrument Serif", serif)', fontStyle: 'italic' }}>
            Movimento semana a semana
          </h3>
          <p className="mt-2 max-w-2xl text-xs leading-relaxed text-white/55">
            {illustrative ? 'Uma turma fictícia ganha ritmo ao longo do programa.' : 'Percentual entre as pessoas que já alcançaram cada etapa.'}
          </p>
        </div>
        {illustrative && <span className="rounded-full border border-cyan-300/20 px-3 py-1 text-[10px] text-cyan-200">Histórico ilustrativo</span>}
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3 border-y border-white/[0.07] py-3" aria-live="polite">
        {SERIES.map(item => (
          <div key={item.field} className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] text-white/65">
              <span className="w-3 shrink-0 border-t-2" style={{ borderColor: item.color, borderStyle: item.dash ? 'dashed' : 'solid' }} />
              {item.label}
            </p>
            <p className="mt-1 font-mono text-[22px] leading-tight tabular-nums sm:text-[26px]" style={{ color: item.color }}>
              {current ? `${current[item.field]}%` : '—'}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-white/45">{current ? `Semana ${current.semana} · selecione uma semana para comparar` : 'Sem semanas disponíveis'}</p>

      <div ref={container} className="mt-2 min-w-0">
        <svg viewBox={`0 0 ${width} 246`} className="block w-full" role="img"
          aria-labelledby={`${id}-svg-title`}>
          <title id={`${id}-svg-title`}>{illustrative ? 'Histórico ilustrativo' : 'Evolução semanal'} de ativação, consumo e evidência. Valores disponíveis por semana abaixo.</title>
          <defs>
            <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0, 25, 50, 75, 100].map(tick => (
            <g key={tick}>
              <line x1={left} y1={y(tick)} x2={right} y2={y(tick)} stroke="rgba(255,255,255,.09)" strokeDasharray={tick === 0 ? undefined : '3 5'} />
              <text x={left - 8} y={y(tick) + 4} textAnchor="end" fill="#8193a6" fontSize="11">{tick}%</text>
            </g>
          ))}
          {!!weeks.length && <path d={`${pathFor('evidenciaPct')} L ${x(weeks.length - 1)} ${bottom} L ${x(0)} ${bottom} Z`} fill={`url(#${id}-fill)`} />}
          {current && <line x1={x(currentIndex)} y1={top} x2={x(currentIndex)} y2={bottom} stroke="rgba(255,255,255,.23)" strokeDasharray="3 5" />}
          {SERIES.map(item => (
            <g key={item.field}>
              <path d={pathFor(item.field)} fill="none" stroke={item.color} strokeWidth="2.5" strokeDasharray={item.dash} strokeLinecap="round" />
              {weeks.map((week, i) => <circle key={week.semana} cx={x(i)} cy={y(week[item.field])}
                r={i === currentIndex ? 4.5 : 2.5} fill={item.color} stroke="#10253c" strokeWidth="2">
                <title>{item.label} · Semana {week.semana}: {week[item.field]}%</title>
              </circle>)}
            </g>
          ))}
          {weeks.map((week, i) => (i === weeks.length - 1 || (i % labelStep === 0 && weeks.length - 1 - i >= labelStep / 2)) && (
            <text key={week.semana} x={x(i)} y="238" textAnchor="middle" fill={i === currentIndex ? '#e5edf4' : '#8193a6'} fontSize="11">S{week.semana}</text>
          ))}
        </svg>
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1 sm:flex sm:flex-wrap sm:gap-1.5" role="group" aria-label="Selecionar semana do gráfico">
        {weeks.map((week, i) => <button key={week.semana} type="button" onClick={() => setSelected(i)}
          aria-pressed={i === currentIndex} aria-label={`Semana ${week.semana}`}
          className={`min-h-10 min-w-0 rounded-lg sm:min-w-10 px-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-cyan-300 ${i === currentIndex ? 'bg-cyan-300/15 text-cyan-200' : 'text-white/55 hover:bg-white/[0.06] hover:text-white'}`}>
          S{week.semana}
        </button>)}
      </div>
      <details className="mt-3 text-xs text-white/55">
        <summary className="w-fit cursor-pointer py-2 focus-visible:outline-2 focus-visible:outline-cyan-300">Ver valores por semana</summary>
        <table className="mt-2 w-full text-left text-[11px] tabular-nums">
          <caption className="sr-only">{illustrative ? 'Dados fictícios do histórico ilustrativo' : 'Percentuais medidos por semana'}</caption>
          <thead><tr><th scope="col" className="py-2">Semana</th>{SERIES.map(item => <th scope="col" key={item.field} className="py-2 text-right">{item.label}</th>)}</tr></thead>
          <tbody>{weeks.map(week => <tr key={week.semana} className="border-t border-white/[0.07]">
            <th scope="row" className="py-2 font-normal">S{week.semana}</th>
            {SERIES.map(item => <td key={item.field} className="py-2 text-right">{week[item.field]}%</td>)}
          </tr>)}</tbody>
        </table>
      </details>
    </section>
  );
}
