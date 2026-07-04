'use client';

// Card de métrica do portal comercial (KPI com acento de cor).
import type { LucideIcon } from 'lucide-react';

export default function SalesMetricCard({
  label, value, sub, icon: Icon, accent = '#34c5cc',
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: LucideIcon;
  accent?: string;
}) {
  return (
    <div
      className="rounded-2xl p-4 flex flex-col gap-2 min-w-0"
      style={{
        background: 'rgba(255,255,255,.03)',
        border: '1px solid rgba(255,255,255,.08)',
        boxShadow: `inset 0 1px 0 rgba(255,255,255,.04), 0 0 40px -24px ${accent}66`,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] uppercase font-bold truncate" style={{ color: 'rgba(255,255,255,.45)', letterSpacing: '.14em' }}>
          {label}
        </p>
        {Icon && (
          <span
            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: `${accent}14`, color: accent }}
          >
            <Icon size={14} />
          </span>
        )}
      </div>
      <p className="text-xl md:text-2xl font-extrabold text-white truncate" title={value}>{value}</p>
      {sub && <p className="text-[11px] truncate" style={{ color: 'rgba(255,255,255,.45)' }}>{sub}</p>}
    </div>
  );
}
