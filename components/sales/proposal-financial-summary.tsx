'use client';

// Portal do Representante — resumo financeiro da proposta, recalculado AO VIVO
// com calculateProposalFinancials (a fonte de verdade continua no server).
import { AlertTriangle } from 'lucide-react';
import { calculateProposalFinancials, type ProposalFinancialInput } from '@/lib/sales/commissions';
import { COMMISSION_RATES } from '@/lib/sales/constants';
import { fmtBRLExact } from '@/lib/sales/formatters';

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className={`text-[11px] ${highlight ? 'font-bold text-white' : 'text-gray-400'}`}>{label}</span>
      <span className={`text-sm font-bold tabular-nums ${highlight ? 'text-cyan-300' : 'text-white'}`}>{value}</span>
    </div>
  );
}

export default function ProposalFinancialSummary({ input, className }: {
  input: ProposalFinancialInput;
  className?: string;
}) {
  const fin = calculateProposalFinancials(input);
  const months = Number(input.contract_duration_months) || 0;

  return (
    <div className={`rounded-xl bg-white/[0.03] border border-white/10 p-4 ${className ?? ''}`}>
      <h3 className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">Resumo financeiro</h3>
      <div className="divide-y divide-white/5">
        <Row label="Valor total do contrato" value={fmtBRLExact(fin.total_contract_value)} />
        <Row
          label={`Comissão de aquisição (${Math.round(COMMISSION_RATES.acquisition * 100)}%)`}
          value={fmtBRLExact(fin.estimated_acquisition_commission)}
        />
        <Row
          label={`Comissão recorrente estimada (${Math.round(COMMISSION_RATES.recurring * 100)}%${months ? ` × ${months} meses` : ' × vigência'})`}
          value={fmtBRLExact(fin.estimated_recurring_commission)}
        />
        <Row label="Comissão total estimada" value={fmtBRLExact(fin.estimated_total_commission)} highlight />
      </div>
      {fin.margin_alert && (
        <p className="mt-3 flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-semibold bg-amber-500/10 border border-amber-500/30 text-amber-300">
          <AlertTriangle size={12} className="shrink-0" />
          Desconto alto — sujeito a análise de margem
        </p>
      )}
    </div>
  );
}
