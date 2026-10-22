'use client';

// Portal do Representante — resumo financeiro da proposta, recalculado AO VIVO
// pelo mesmo plano de comissão que o servidor grava e o aceite lança
// (`planoDeComissao`, contrato do RC, cláusula 10ª). As regras são as do modelo
// de remuneração do RC e da classificação de cliente da carteira: as gravadas na
// proposta quando ela existe, ou as que o servidor calcula para a oportunidade.
import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { calculateProposalFinancials, planoDeComissao, type ProposalFinancialInput } from '@/lib/sales/commissions';
import { commissionRatesFor, type CompensationModel } from '@/lib/sales/constants';
import { fmtBRLExact } from '@/lib/sales/formatters';
import { getTermosDeComissao } from '@/actions/sales/proposals';

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className={`text-[11px] ${highlight ? 'font-bold text-white' : 'text-gray-400'}`}>{label}</span>
      <span className={`text-sm font-bold tabular-nums ${highlight ? 'text-cyan-300' : 'text-white'}`}>{value}</span>
    </div>
  );
}

type Termos = { modelo: CompensationModel; carteira: boolean };

/**
 * Regras de comissão que valem para o resumo. `null` enquanto carrega ou se a
 * leitura falhar: nesse caso o resumo mostra "—" em vez de supor o modelo
 * padrão, que daria ao RC com ajuda de custo uma aquisição que ele não tem, ou
 * ao cliente da carteira o dobro do que ele paga.
 */
function useTermos(fixos: Termos | null, opportunityId: string | null | undefined) {
  const [termos, setTermos] = useState<Termos | null>(fixos);
  useEffect(() => {
    if (fixos) { setTermos(fixos); return; }
    let vivo = true;
    getTermosDeComissao(opportunityId ?? null)
      .then((r) => { if (vivo && r.success) setTermos({ modelo: r.modelo, carteira: r.carteira }); })
      .catch(() => { /* fica em "—" */ });
    return () => { vivo = false; };
  }, [fixos?.modelo, fixos?.carteira, opportunityId]); // eslint-disable-line react-hooks/exhaustive-deps
  return termos;
}

const pct = (pontos: number) => `${String(pontos).replace('.', ',')}%`;

export default function ProposalFinancialSummary({ input, className, compensationModel, carteira, opportunityId }: {
  input: ProposalFinancialInput;
  className?: string;
  /** Regras gravadas na proposta (modelo e carteira). Sem elas, busca as da oportunidade. */
  compensationModel?: CompensationModel | null;
  carteira?: boolean;
  opportunityId?: string | null;
}) {
  const termos = useTermos(compensationModel ? { modelo: compensationModel, carteira: !!carteira } : null, opportunityId);
  const rates = commissionRatesFor(termos?.modelo);
  const fin = calculateProposalFinancials(input, rates, !!termos?.carteira);
  const months = Number(input.contract_duration_months) || 0;
  const plano = planoDeComissao(fin.total_contract_value, months, rates, !!termos?.carteira);
  const monthly = Math.max(0, Number(input.monthly_value) || 0);
  const discount = Number(input.discount_requested) || 0;
  const valor = (v: number) => (termos ? fmtBRLExact(v) : '—');
  const temAquisicao = rates.acquisition > 0;
  const p = plano.sobreParcelas;

  const rotuloAquisicao = `Comissão de aquisição${termos ? ` (${pct(plano.aquisicao.percent)}${plano.aquisicao.limitadaA12Meses ? ' sobre os 12 primeiros meses' : ''})` : ''}`;
  const rotuloParcelas = `Comissão sobre parcelas${termos && months
    ? ` (${pct(p.percent)} × ${p.quantidade} parcela${p.quantidade === 1 ? '' : 's'}${p.primeira === 2 ? ', da 2ª em diante' : ''})`
    : ''}`;

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
        {temAquisicao && <Row label={rotuloAquisicao} value={valor(plano.aquisicao.valor)} />}
        <Row label={rotuloParcelas} value={valor(plano.sobreParcelas.valor)} />
        <Row label="Comissão total estimada" value={valor(plano.total)} highlight />
      </div>
      <div className="mt-2 space-y-1 text-[10px] text-gray-500">
        {termos?.carteira && <p>Cliente da carteira: 50% dos percentuais do modelo (cláusula 10.6 do contrato).</p>}
        {termos?.modelo === 'com_ajuda' && <p>Modelo com ajuda de custo: sem comissão de aquisição.</p>}
        {temAquisicao && <p>A aquisição é paga inteira depois do 1º pagamento do cliente.</p>}
        <p>Comissão devida conforme o cliente paga, até o dia 15 do mês seguinte, mediante nota fiscal.</p>
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
