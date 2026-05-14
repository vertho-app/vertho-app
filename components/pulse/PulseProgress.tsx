'use client';

interface Props {
  atual: number;
  total: number;
  dimensaoAtual?: string;
}

export function PulseProgress({ atual, total, dimensaoAtual }: Props) {
  const pct = total > 0 ? Math.round((atual / total) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-gray-500">{atual} de {total}</span>
        {dimensaoAtual && <span className="text-cyan-400 font-semibold uppercase tracking-widest">{dimensaoAtual}</span>}
        <span className="text-cyan-400 font-bold">{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-cyan-400 to-cyan-500 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
