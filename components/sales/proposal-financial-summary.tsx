'use client';

// Portal do Representante — resumo financeiro da proposta, recalculado AO VIVO
// com calculateProposalFinancials (a fonte de verdade continua no server).
// As taxas de comissão são as do MODELO de remuneração do RC logado (mig 295):
// sem ajuda de custo, aquisição 9% + recorrente 12%; com ajuda, só 10% ao mês.
import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { calculateProposalFinancials, type ProposalFinancialInput } from '@/lib/sales/commissions';
import { commissionRatesFor, type CompensationModel } from '@/lib/sales/constants';
import { fmtBRLExact } from '@/lib/sales/formatters';
import { getRepresentativeContext } from '@/actions/sales/representatives';

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className={`text-[11px] ${highlight ? 'font-bold text-white' : 'text-gray-400'}`}>{label}</span>
      <span className={`text-sm font-bold tabular-nums ${highlight ? 'text-cyan-300' : 'text-white'}`}>{value}</span>
    </div>
  );
}

/**
 * Modelo de remuneração do RC logado. `null` enquanto carrega ou se a leitura
 * falhar: nesse caso o resumo mostra "—" em vez de supor o modelo padrão, que
 * daria ao RC com ajuda de custo uma comissão de aquisição que ele não tem.
 */
function useModeloDeRemuneracao(fixo?: CompensationModel) {
  const [modelo, setModelo] = useState<CompensationModel | null>(fixo ?? null);
  useEffect(() => {
    if (fixo) return;
    let vivo = true;
    getRepresentativeContext()
      .then((r) => { if (vivo) setModelo(r.rep?.compensation_model ?? 'sem_ajuda'); })
      .catch(() => { /* fica em "—" */ });
    return () => { vivo = false; };
  }, [fixo]);
  return modelo;
}

export default function ProposalFinancialSummary({ input, className, compensationModel }: {
  input: ProposalFinancialInput;
  className?: string;
  /** Força o modelo (sem buscar o do RC logado). */
  compensationModel?: CompensationModel;
}) {
  const modelo = useModeloDeRemuneracao(compensationModel);
  const rates = commissionRatesFor(modelo);
  const fin = calculateProposalFinancials(input, rates);
  const months = Number(input.contract_duration_months) || 0;
  const monthly = Math.max(0, Number(input.monthly_value) || 0);
  const discount = Number(input.discount_requested) || 0;
  const pct = (taxa: number) => `${Math.round(taxa * 100)}%`;
  const valor = (v: number) => (modelo ? fmtBRLExact(v) : '—');
  const temAquisicao = rates.acquisition > 0;

  return (
    <div className={`rounded-xl bg-white/[0.03] border border-white/10 p-4 ${className ?? ''}`}>
      <h3 className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">Resumo financeiro</h3>
      <div className="divide-y divide-white/5">
        <Row label={`Valor mensal${months ? ` × ${months} meses` : ''}`} value={fmtBRLExact(monthly)} />
        <Row label="Valor do contrato (bruto)" value={fmtBRLExact(fin.contract_value_gross)} />
        {discount > 0 && (
          <Row label={`Desconto (${discount}%)`} value={`− ${fmtBRLExact(fin.discount_amount)}`} />
        )}
        <Row label="Valor final do contrato" value={fmtBRLExact(fin.total_contract_value)} highlight />
        {temAquisicao && (
          <Row
            label={`Comissão de aquisição${modelo ? ` (${pct(rates.acquisition)})` : ''}`}
            value={valor(fin.estimated_acquisition_commission)}
          />
        )}
        <Row
          label={`${temAquisicao ? 'Comissão recorrente estimada' : 'Comissão mensal estimada'}${modelo ? ` (${pct(rates.recurring)}${months ? ` × ${months} meses` : ' × vigência'})` : ''}`}
          value={valor(fin.estimated_recurring_commission)}
        />
        <Row label="Comissão total estimada" value={valor(fin.estimated_total_commission)} highlight />
      </div>
      {modelo === 'com_ajuda' && (
        <p className="mt-2 text-[10px] text-gray-500">Modelo com ajuda de custo: sem comissão de aquisição.</p>
      )}
      {fin.margin_alert && (
        <p className="mt-3 flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-semibold bg-amber-500/10 border border-amber-500/30 text-amber-300">
          <AlertTriangle size={12} className="shrink-0" />
          Desconto alto — sujeito a análise de margem
        </p>
      )}
    </div>
  );
}
