'use client';

// Tabela-resumo de comissões do RC ("Comissões a receber").
import { COMMISSION_STATUS_LABELS, COMMISSION_TYPE_LABELS } from '@/lib/sales/constants';
import { fmtBRL, fmtBRLExact, fmtDate, fmtPercent } from '@/lib/sales/formatters';

export type CommissionRow = {
  cliente: string;
  tipo: string;
  base: number | null;
  percent: number | null;
  status: string;
  valor: number;
  previsao: string | null;
};

const STATUS_COLORS: Record<string, string> = {
  potencial: '#6B7280',
  forecast: '#F59E0B',
  accrued: '#22C55E',
  paid: '#10B981',
  cancelled: '#EF4444',
};

function CommissionStatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] || '#6B7280';
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={{ background: `${color}1a`, border: `1px solid ${color}55`, color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {COMMISSION_STATUS_LABELS[status] || status}
    </span>
  );
}

const th = 'px-3 py-2 text-left text-[10px] uppercase font-bold whitespace-nowrap';
const td = 'px-3 py-2.5 text-xs whitespace-nowrap';

export default function CommissionSummaryTable({
  rows, totals,
}: {
  rows: CommissionRow[];
  totals?: { potencial: number; prevista: number };
}) {
  if (rows.length === 0) {
    return (
      <div
        className="rounded-2xl p-6 text-center"
        style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)' }}
      >
        <p className="text-sm font-bold text-white">Nenhuma comissão registrada ainda</p>
        <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,.5)' }}>
          Suas comissões aparecem aqui conforme as propostas avançam para aceite.
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)' }}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,.08)', color: 'rgba(255,255,255,.45)', letterSpacing: '.12em' }}>
              <th className={th}>Cliente</th>
              <th className={th}>Tipo</th>
              <th className={th}>Base</th>
              <th className={th}>%</th>
              <th className={th}>Status</th>
              <th className={th}>Valor</th>
              <th className={th}>Previsão</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderBottom: i < rows.length - 1 ? '1px solid rgba(255,255,255,.05)' : 'none' }}>
                <td className={`${td} font-semibold text-white max-w-[220px] truncate`} title={r.cliente}>{r.cliente}</td>
                <td className={td} style={{ color: 'rgba(255,255,255,.7)' }}>{COMMISSION_TYPE_LABELS[r.tipo] || r.tipo}</td>
                <td className={td} style={{ color: 'rgba(255,255,255,.7)' }}>{fmtBRL(r.base)}</td>
                <td className={td} style={{ color: 'rgba(255,255,255,.7)' }}>
                  {r.percent != null ? `${Number(r.percent) % 1 === 0 ? Number(r.percent) : Number(r.percent).toFixed(1)}%` : fmtPercent(null)}
                </td>
                <td className={td}><CommissionStatusBadge status={r.status} /></td>
                <td className={`${td} font-extrabold`} style={{ color: '#34c5cc' }}>{fmtBRLExact(r.valor)}</td>
                <td className={td} style={{ color: 'rgba(255,255,255,.55)' }}>{fmtDate(r.previsao)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totals && (
        <div
          className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 px-4 py-3"
          style={{ borderTop: '1px solid rgba(255,255,255,.08)', background: 'rgba(255,255,255,.02)' }}
        >
          <p className="text-[11px]" style={{ color: 'rgba(255,255,255,.55)' }}>
            Potencial: <span className="font-bold text-white">{fmtBRLExact(totals.potencial)}</span>
          </p>
          <p className="text-[11px]" style={{ color: 'rgba(255,255,255,.55)' }}>
            Prevista: <span className="font-bold" style={{ color: '#34c5cc' }}>{fmtBRLExact(totals.prevista)}</span>
          </p>
        </div>
      )}
    </div>
  );
}
