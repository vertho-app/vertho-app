import * as React from 'react';
import { cx } from './utils';

export interface MetricCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode;
  value: React.ReactNode;
  helper?: React.ReactNode;
  icon?: React.ReactNode;
  accent?: string;
}

export function MetricCard({
  label,
  value,
  helper,
  icon,
  accent = 'var(--phase-accent, #34c5cc)',
  className,
  ...props
}: MetricCardProps) {
  return (
    <div
      className={cx(
        'relative min-h-[118px] overflow-hidden rounded-md border border-white/[0.08] p-4',
        'bg-[linear-gradient(140deg,rgba(255,255,255,.04),rgba(255,255,255,.01))]',
        className,
      )}
      {...props}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <span className="min-w-0 text-xs leading-snug text-white/55">{label}</span>
        {icon && <span className="shrink-0 text-white/40">{icon}</span>}
      </div>
      <div className="text-[28px] font-bold leading-none tracking-normal text-white tabular-nums">
        {value}
      </div>
      {helper && <p className="mt-1 text-[10px] leading-relaxed" style={{ color: accent }}>{helper}</p>}
      <div
        className="absolute inset-x-0 bottom-0 h-[3px] opacity-70"
        style={{ background: accent, boxShadow: `0 0 10px ${accent}` }}
        aria-hidden="true"
      />
    </div>
  );
}
