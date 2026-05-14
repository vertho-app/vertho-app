'use client';

import type { DimensionRow } from '@/actions/pulse/dashboard';

interface Props {
  dimensions: DimensionRow[];
  showT2?: boolean;
}

/**
 * Barras horizontais por dimensão (1-5).
 * Quando há T2, mostra duas barras lado a lado (T0 cinza + T2 ciano).
 */
export function PulseDimensionChart({ dimensions, showT2 = true }: Props) {
  const max = 5;
  return (
    <div className="space-y-3">
      {dimensions.map(d => {
        const t0Pct = d.t0 != null ? (d.t0 / max) * 100 : 0;
        const t2Pct = d.t2 != null ? (d.t2 / max) * 100 : 0;
        return (
          <div key={d.dimension_key} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-semibold text-white truncate">{d.dimension_name}</span>
              <span className="text-[10px] text-gray-500 shrink-0">
                {d.t0 != null && <span className="text-gray-400">T0 {d.t0.toFixed(2)}</span>}
                {showT2 && d.t2 != null && <span className="text-cyan-400 ml-2">T2 {d.t2.toFixed(2)}</span>}
                {d.delta != null && d.delta !== 0 && (
                  <span className={`ml-2 ${d.delta > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {d.delta > 0 ? '+' : ''}{d.delta.toFixed(2)}
                  </span>
                )}
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-white/[0.04] overflow-hidden relative">
              {d.t0 != null && (
                <div className="absolute inset-y-0 left-0 bg-gray-500/60 transition-all"
                  style={{ width: `${t0Pct}%` }} />
              )}
              {showT2 && d.t2 != null && (
                <div className="absolute inset-y-0 left-0 bg-cyan-400 transition-all"
                  style={{ width: `${t2Pct}%`, opacity: 0.85 }} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
