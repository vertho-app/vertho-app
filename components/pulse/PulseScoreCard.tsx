'use client';

interface Props {
  label: string;
  value: string | number;
  hint?: string;
  delta?: number | null;
  color?: 'cyan' | 'green' | 'amber' | 'red' | 'purple' | 'white';
}

const COLORS: Record<string, string> = {
  cyan: 'text-cyan-400',
  green: 'text-green-400',
  amber: 'text-amber-400',
  red: 'text-red-400',
  purple: 'text-purple-400',
  white: 'text-white',
};

export function PulseScoreCard({ label, value, hint, delta, color = 'cyan' }: Props) {
  return (
    <div className="p-4 rounded-xl border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
      <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-2">{label}</p>
      <div className="flex items-baseline gap-2">
        <span className={`text-2xl font-bold ${COLORS[color]}`}>{value}</span>
        {delta != null && delta !== 0 && (
          <span className={`text-[11px] font-bold ${delta > 0 ? 'text-green-400' : 'text-red-400'}`}>
            {delta > 0 ? '+' : ''}{delta.toFixed(2)}
          </span>
        )}
      </div>
      {hint && <p className="text-[10px] text-gray-500 mt-1">{hint}</p>}
    </div>
  );
}
