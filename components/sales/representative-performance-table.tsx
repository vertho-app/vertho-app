'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { fmtBRL } from '@/lib/sales/formatters';

/** Linha de performance por RC (contrato de getCommercialAdminDashboard().byRep). */
export type RepPerformanceRow = {
  rep: { id: string; name: string; region: string | null; status: string };
  pipelineTotal: number;
  pipelineQualificado: number;
  pipelinePonderado: number;
  wonCount: number;
  wonValue: number;
  commissionExposure: number;
};

const REP_STATUS: Record<string, { label: string; color: string }> = {
  active: { label: 'Ativo', color: '#22C55E' },
  inactive: { label: 'Inativo', color: '#6B7280' },
  suspended: { label: 'Suspenso', color: '#EF4444' },
};

export function RepStatusBadge({ status }: { status: string }) {
  const cfg = REP_STATUS[status] || REP_STATUS.inactive;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={{ background: `${cfg.color}1a`, border: `1px solid ${cfg.color}55`, color: cfg.color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.color }} />
      {cfg.label}
    </span>
  );
}

/** Tabela de performance por representante — ordenável pelo pipeline total. */
export default function RepresentativePerformanceTable({ rows }: { rows: RepPerformanceRow[] }) {
  const [desc, setDesc] = useState(true);

  const sorted = useMemo(
    () => [...rows].sort((a, b) => (desc ? b.pipelineTotal - a.pipelineTotal : a.pipelineTotal - b.pipelineTotal)),
    [rows, desc],
  );

  if (rows.length === 0) {
    return <p className="text-xs text-gray-500 py-6 text-center">Nenhum representante cadastrado.</p>;
  }

  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/10 overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-white/[0.04]">
          <tr className="text-left text-[10px] uppercase text-gray-500">
            <th className="px-3 py-2">Representante</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2 text-right">
              <button
                onClick={() => setDesc((d) => !d)}
                className="inline-flex items-center gap-1 uppercase text-[10px] text-gray-400 hover:text-white"
                title="Ordenar por pipeline total"
              >
                Pipeline total {desc ? <ArrowDown size={10} /> : <ArrowUp size={10} />}
              </button>
            </th>
            <th className="px-3 py-2 text-right">Qualificado</th>
            <th className="px-3 py-2 text-right">Ponderado</th>
            <th className="px-3 py-2 text-right">Ganhas</th>
            <th className="px-3 py-2 text-right">Exposição de comissão</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {sorted.map((r) => (
            <tr key={r.rep.id} className="hover:bg-white/[0.02]">
              <td className="px-3 py-2">
                <span className="font-semibold text-white">{r.rep.name}</span>
                {r.rep.region && <span className="ml-1.5 text-[10px] text-gray-500">· {r.rep.region}</span>}
              </td>
              <td className="px-3 py-2"><RepStatusBadge status={r.rep.status} /></td>
              <td className="px-3 py-2 text-right font-semibold text-white">{fmtBRL(r.pipelineTotal)}</td>
              <td className="px-3 py-2 text-right text-gray-300">{fmtBRL(r.pipelineQualificado)}</td>
              <td className="px-3 py-2 text-right text-gray-300">{fmtBRL(r.pipelinePonderado)}</td>
              <td className="px-3 py-2 text-right text-emerald-400">
                {r.wonCount} <span className="text-gray-500">·</span> {fmtBRL(r.wonValue)}
              </td>
              <td className="px-3 py-2 text-right text-amber-300">{fmtBRL(r.commissionExposure)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
