'use client';

// Cards-resumo da carteira ativa (4 leituras rápidas).
import { CalendarClock, TrendingUp, Users, Wallet } from 'lucide-react';
import { fmtBRL } from '@/lib/sales/formatters';
import SalesMetricCard from './sales-metric-card';
import { daysToRenewal, type PortfolioEntry } from './portfolio-table';

export default function PortfolioSummaryCards({ data }: { data: PortfolioEntry[] }) {
  const clientesAtivos = data.length;
  const receitaMensal = data.reduce((s, r) => s + (Number(r.monthly_value) || 0), 0);
  const emRenovacao = data.filter((r) => {
    const d = daysToRenewal(r.renewal_date);
    return d !== null && d >= 0 && d <= 90;
  }).length;
  // Placeholder de expansão: contas ativas sem risco alto de churn.
  const potencialExpansao = data.filter((r) => r.churn_risk !== 'alto').length;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      <SalesMetricCard
        label="Clientes ativos"
        value={String(clientesAtivos)}
        sub="Carteira ativa sob sua gestão comercial"
        icon={Users}
        accent="#34c5cc"
      />
      <SalesMetricCard
        label="Receita mensal da carteira"
        value={fmtBRL(receitaMensal)}
        sub="Base das suas comissões recorrentes"
        icon={Wallet}
        accent="#22C55E"
      />
      <SalesMetricCard
        label="Contas em renovação"
        value={String(emRenovacao)}
        sub="Renovação nos próximos 90 dias"
        icon={CalendarClock}
        accent="#F59E0B"
      />
      <SalesMetricCard
        label="Potencial de expansão"
        value={String(potencialExpansao)}
        sub="Contas ativas com espaço para crescer"
        icon={TrendingUp}
        accent="#8B5CF6"
      />
    </div>
  );
}
