'use client';

import type { DimensionRow } from '@/actions/pulse/dashboard';
import { classifyScore } from '@/lib/pulse/anonymity';

interface Props {
  dimensions: DimensionRow[];
}

const COLOR_CSS: Record<string, string> = {
  green: 'text-green-400',
  cyan: 'text-cyan-400',
  amber: 'text-amber-400',
  red: 'text-red-400',
};

function leituraAuto(d: DimensionRow): string {
  if (d.t0 == null && d.t2 == null) return 'Sem dados.';
  if (d.t0 != null && d.t2 == null) return `Base T0 ${d.t0.toFixed(2)}. Aguardando T2.`;
  if (d.delta == null) return 'Sem comparação.';
  if (Math.abs(d.delta) < 0.15) return 'Estável entre T0 e T2.';
  if (d.delta > 0) return `Evolução +${d.delta.toFixed(2)} entre T0 e T2.`;
  return `Recuo de ${d.delta.toFixed(2)} entre T0 e T2 — investigar.`;
}

export function PulseDeltaTable({ dimensions }: Props) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
      <table className="w-full text-left">
        <thead>
          <tr className="text-[9px] font-bold text-gray-500 uppercase tracking-widest border-b border-white/[0.06]">
            <th className="px-4 py-2.5">Dimensão</th>
            <th className="px-3 py-2.5 text-right">T0</th>
            <th className="px-3 py-2.5 text-right">T2</th>
            <th className="px-3 py-2.5 text-right">Δ</th>
            <th className="px-4 py-2.5">Leitura</th>
          </tr>
        </thead>
        <tbody>
          {dimensions.map(d => {
            const cls = d.t2 != null ? classifyScore(d.t2) : (d.t0 != null ? classifyScore(d.t0) : null);
            return (
              <tr key={d.dimension_key} className="border-t border-white/[0.04]">
                <td className="px-4 py-2.5">
                  <p className="text-xs font-bold text-white">{d.dimension_name}</p>
                  {cls && <p className={`text-[9px] ${COLOR_CSS[cls.color]}`}>{cls.label}</p>}
                </td>
                <td className="px-3 py-2.5 text-right text-xs text-gray-300">
                  {d.t0 != null ? d.t0.toFixed(2) : '—'}
                </td>
                <td className="px-3 py-2.5 text-right text-xs text-cyan-300 font-semibold">
                  {d.t2 != null ? d.t2.toFixed(2) : '—'}
                </td>
                <td className="px-3 py-2.5 text-right text-xs">
                  {d.delta != null ? (
                    <span className={d.delta > 0 ? 'text-green-400 font-bold' : d.delta < 0 ? 'text-red-400 font-bold' : 'text-gray-500'}>
                      {d.delta > 0 ? '+' : ''}{d.delta.toFixed(2)}
                    </span>
                  ) : '—'}
                </td>
                <td className="px-4 py-2.5 text-[10px] text-gray-400">{leituraAuto(d)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
