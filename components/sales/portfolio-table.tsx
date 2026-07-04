'use client';

// Tabela da carteira ativa do RC (contas com contrato vigente).
import { useRouter } from 'next/navigation';
import { TrendingUp } from 'lucide-react';
import { PRODUCT_PACKAGE_LABELS } from '@/lib/sales/constants';
import { fmtBRL, fmtDate } from '@/lib/sales/formatters';
import type { SalesAccount } from '@/lib/sales/types';

/** Entrada da carteira — espelha o retorno de getPortfolio() (actions/sales/accounts). */
export type PortfolioEntry = {
  account: Pick<SalesAccount, 'id' | 'legal_name' | 'trade_name'> & Partial<SalesAccount>;
  product_package: string | null;
  monthly_value: number | null;
  contract_duration_months: number | null;
  contract_start_date: string | null;
  renewal_date: string | null;
  commission_phase: 'recorrente_12' | 'renovacao_6';
  churn_risk: 'baixo' | 'medio' | 'alto' | null;
  expansion_potential?: boolean;
  next_followup_date?: string | null;
  days_to_renewal?: number | null;
};

/** Dias até a renovação (null se não houver data). */
export function daysToRenewal(renewalDate: string | null | undefined, today = new Date()): number | null {
  if (!renewalDate) return null;
  const end = new Date(`${renewalDate.slice(0, 10)}T23:59:59`);
  if (isNaN(end.getTime())) return null;
  return Math.ceil((end.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

const PHASE_CFG: Record<PortfolioEntry['commission_phase'], { label: string; color: string }> = {
  recorrente_12: { label: '12% recorrente', color: '#34c5cc' },
  renovacao_6: { label: '6% renovação', color: '#8B5CF6' },
};

const RISK_CFG: Record<string, { label: string; color: string }> = {
  baixo: { label: 'Baixo', color: '#22C55E' },
  medio: { label: 'Médio', color: '#F59E0B' },
  alto: { label: 'Alto', color: '#EF4444' },
};

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap"
      style={{ background: `${color}1a`, border: `1px solid ${color}55`, color }}
    >
      {label}
    </span>
  );
}

const th = 'px-3 py-2 text-left text-[10px] uppercase font-bold whitespace-nowrap';
const td = 'px-3 py-2.5 text-xs whitespace-nowrap';

export default function PortfolioTable({ data }: { data: PortfolioEntry[] }) {
  const router = useRouter();
  if (data.length === 0) return null;

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)' }}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px]">
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,.08)', color: 'rgba(255,255,255,.45)', letterSpacing: '.12em' }}>
              <th className={th}>Cliente</th>
              <th className={th}>Produto</th>
              <th className={th}>Valor mensal</th>
              <th className={th}>Vigência</th>
              <th className={th}>Início</th>
              <th className={th}>Renovação</th>
              <th className={th}>Comissão atual</th>
              <th className={th}>Risco</th>
              <th className={th}>Próxima ação sugerida</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => {
              const cliente = row.account.trade_name || row.account.legal_name;
              const phase = PHASE_CFG[row.commission_phase] || PHASE_CFG.recorrente_12;
              const risk = row.churn_risk ? RISK_CFG[row.churn_risk] : null;
              const dias = daysToRenewal(row.renewal_date);
              const renovacaoProxima = dias !== null && dias >= 0 && dias <= 90;
              return (
                <tr
                  key={row.account.id}
                  onClick={() => router.push(`/representante/carteira/${row.account.id}`)}
                  className="cursor-pointer hover:bg-white/[0.03] transition-colors"
                  style={{ borderBottom: i < data.length - 1 ? '1px solid rgba(255,255,255,.05)' : 'none' }}
                >
                  <td className={`${td} font-semibold text-white max-w-[220px]`} title={cliente}>
                    <span className="flex items-center gap-1.5">
                      <span className="truncate">{cliente}</span>
                      {row.expansion_potential && (
                        <span title="Potencial de expansão" style={{ color: '#8B5CF6' }}>
                          <TrendingUp size={13} />
                        </span>
                      )}
                    </span>
                  </td>
                  <td className={td} style={{ color: 'rgba(255,255,255,.7)' }}>
                    {row.product_package ? (PRODUCT_PACKAGE_LABELS[row.product_package] || row.product_package) : '—'}
                  </td>
                  <td className={`${td} font-bold`} style={{ color: '#34c5cc' }}>{fmtBRL(row.monthly_value)}</td>
                  <td className={td} style={{ color: 'rgba(255,255,255,.7)' }}>
                    {row.contract_duration_months ? `${row.contract_duration_months} meses` : '—'}
                  </td>
                  <td className={td} style={{ color: 'rgba(255,255,255,.55)' }}>{fmtDate(row.contract_start_date)}</td>
                  <td className={td} style={{ color: renovacaoProxima ? '#F59E0B' : 'rgba(255,255,255,.55)' }}>
                    {fmtDate(row.renewal_date)}
                  </td>
                  <td className={td}><Pill label={phase.label} color={phase.color} /></td>
                  <td className={td}>{risk ? <Pill label={risk.label} color={risk.color} /> : <span style={{ color: 'rgba(255,255,255,.35)' }}>—</span>}</td>
                  <td className={td} style={{ color: 'rgba(255,255,255,.7)' }}>
                    {renovacaoProxima ? 'Agendar conversa de valor' : 'Acompanhar conta'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
