'use client';

import { fmtBRL, fmtPercent } from '@/lib/sales/formatters';

export type CommissionExposureRow = {
  id: string;
  name: string;
  exposure: number;
};

/**
 * Exposição de comissão por RC — valor absoluto + participação no total do
 * canal (barra horizontal simples).
 */
export default function CommissionExposureTable({ rows }: { rows: CommissionExposureRow[] }) {
  const total = rows.reduce((s, r) => s + (Number(r.exposure) || 0), 0);
  const sorted = [...rows].sort((a, b) => b.exposure - a.exposure);

  if (rows.length === 0) {
    return <p className="text-xs text-gray-500 py-6 text-center">Sem exposição de comissão no momento.</p>;
  }

  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/10 overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-white/[0.04]">
          <tr className="text-left text-[10px] uppercase text-gray-500">
            <th className="px-3 py-2">Representante</th>
            <th className="px-3 py-2 text-right">Exposição</th>
            <th className="px-3 py-2 w-[40%]">% do total do canal</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {sorted.map((r) => {
            const share = total > 0 ? r.exposure / total : 0;
            return (
              <tr key={r.id} className="hover:bg-white/[0.02]">
                <td className="px-3 py-2 font-semibold text-white">{r.name}</td>
                <td className="px-3 py-2 text-right text-amber-300 font-semibold">{fmtBRL(r.exposure)}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,.06)' }}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.max(0, Math.min(100, share * 100))}%`, background: '#F59E0B' }}
                      />
                    </div>
                    <span className="text-[10px] text-gray-400 w-10 text-right">{fmtPercent(share)}</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-white/10 bg-white/[0.02]">
            <td className="px-3 py-2 text-[10px] uppercase text-gray-500">Total do canal</td>
            <td className="px-3 py-2 text-right font-bold text-white">{fmtBRL(total)}</td>
            <td className="px-3 py-2"></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
