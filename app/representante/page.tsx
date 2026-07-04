'use client';

// Portal do Representante — dashboard (visão geral da carteira comercial).
import { useEffect, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, BadgeDollarSign, CalendarClock, FileQuestion, FileText,
  HandCoins, Handshake, Layers, Lightbulb, MessageCircleQuestion, Presentation,
  Shield, Sigma, Trophy, TrendingUp,
} from 'lucide-react';
import { getRepresentativeContext } from '@/actions/sales/representatives';
import { getPipelineSummary, getOpportunityAlerts } from '@/actions/sales/opportunities';
import { listProposals } from '@/actions/sales/proposals';
import { getCommissionSummary } from '@/actions/sales/commissions';
import { getPortfolio } from '@/actions/sales/accounts';
import { comissaoEstimada, receitaContratadaTrimestre, type StageGroup } from '@/lib/sales/kpis';
import { fmtBRL, fmtDate } from '@/lib/sales/formatters';
import type { SalesProposal } from '@/lib/sales/types';
import SalesMetricCard from '@/components/sales/sales-metric-card';
import SalesAlertCard, { type SalesAlertItem } from '@/components/sales/sales-alert-card';
import PipelineKanban from '@/components/sales/pipeline-kanban';
import CommissionSummaryTable, { type CommissionRow } from '@/components/sales/commission-summary-table';
import PortfolioSummaryCards from '@/components/sales/portfolio-summary-cards';
import { daysToRenewal, type PortfolioEntry } from '@/components/sales/portfolio-table';

const serif: CSSProperties = {
  fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
  fontStyle: 'italic',
  fontWeight: 400,
};

const MATERIAL_SHORTCUTS = [
  { label: 'Pitch Vertho', icon: Presentation },
  { label: 'Proposta padrão', icon: FileText },
  { label: 'Simulador', icon: Sigma },
  { label: 'Perguntas de diagnóstico', icon: MessageCircleQuestion },
  { label: 'Objeções', icon: FileQuestion },
  { label: 'Cases', icon: Trophy },
] as const;

type DashboardData = {
  repName: string;
  kpis: { pipelineTotal: number; pipelineQualificado: number; pipelinePonderado: number };
  stages: StageGroup[];
  semProximaAcao: SalesAlertItem[];
  protecoesVencendo: SalesAlertItem[];
  aguardandoAprovacao: SalesAlertItem[];
  renovacoesProximas: SalesAlertItem[];
  receitaTrimestre: number;
  comissaoEstimadaTotal: number;
  commissionRows: CommissionRow[];
  commissionTotals?: { potencial: number; prevista: number };
  portfolio: PortfolioEntry[];
};

function Skeleton() {
  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 animate-pulse">
      <div className="h-10 w-72 max-w-full rounded-lg" style={{ background: 'rgba(255,255,255,.05)' }} />
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-2xl" style={{ background: 'rgba(255,255,255,.04)' }} />
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 rounded-2xl" style={{ background: 'rgba(255,255,255,.04)' }} />
        ))}
      </div>
      <div className="h-64 rounded-2xl" style={{ background: 'rgba(255,255,255,.04)' }} />
    </div>
  );
}

export default function RepresentanteDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [ctxRes, pipelineRes, alertsRes, proposalsRes, commissionRes, portfolioRes] = await Promise.all([
          getRepresentativeContext(),
          getPipelineSummary(),
          getOpportunityAlerts(),
          listProposals(),
          getCommissionSummary(),
          getPortfolio(),
        ]);
        if (!alive) return;

        const proposals: SalesProposal[] = proposalsRes.success ? proposalsRes.data : [];
        const portfolio: PortfolioEntry[] = portfolioRes.success ? portfolioRes.rows : [];

        const aguardandoAprovacao = proposals
          .filter((p) => p.status === 'submitted_for_approval')
          .map((p) => ({
            texto: `${p.proposal_number} · ${p.account?.trade_name || p.account?.legal_name || 'Sem conta'}`,
            href: `/representante/propostas/${p.id}`,
          }));

        const renovacoesProximas = portfolio
          .filter((r) => {
            const d = daysToRenewal(r.renewal_date);
            return d !== null && d >= 0 && d <= 90;
          })
          .map((r) => ({
            texto: `${r.account.trade_name || r.account.legal_name} · renovação em ${fmtDate(r.renewal_date)}`,
            href: '/representante/carteira',
          }));

        setData({
          repName: ctxRes.rep?.name || '',
          kpis: pipelineRes.success
            ? pipelineRes.kpis
            : { pipelineTotal: 0, pipelineQualificado: 0, pipelinePonderado: 0 },
          stages: pipelineRes.success ? pipelineRes.stages : [],
          semProximaAcao: alertsRes.success
            ? alertsRes.semProximaAcao.map((o) => ({
                texto: `${o.nome}${o.conta ? ` · ${o.conta}` : ''}`,
                href: `/representante/crm/${o.id}`,
              }))
            : [],
          protecoesVencendo: alertsRes.success
            ? alertsRes.protecoesVencendo.map((o) => ({
                texto: `${o.nome}${o.conta ? ` · ${o.conta}` : ''}${o.alerta ? ` — ${o.alerta}` : ''}`,
                href: `/representante/crm/${o.id}`,
              }))
            : [],
          aguardandoAprovacao,
          renovacoesProximas,
          receitaTrimestre: receitaContratadaTrimestre(proposals),
          comissaoEstimadaTotal: comissaoEstimada(proposals),
          commissionRows: (commissionRes.success ? commissionRes.rows : []) as CommissionRow[],
          commissionTotals: commissionRes.success ? commissionRes.totals : undefined,
          portfolio,
        });
      } catch (e: any) {
        if (alive) setError(e?.message || 'Falha ao carregar o painel');
      }
    })();
    return () => { alive = false; };
  }, []);

  if (error) {
    return (
      <div className="p-6">
        <div
          className="rounded-2xl p-6 text-center"
          style={{ background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.3)' }}
        >
          <p className="text-sm font-bold text-white">Não foi possível carregar o painel</p>
          <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,.6)' }}>{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return <Skeleton />;

  const primeiroNome = data.repName.split(' ')[0] || data.repName;

  return (
    <div className="p-4 md:p-6 flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl text-white" style={{ lineHeight: 1.15 }}>
          Olá, <span style={{ ...serif, color: '#34c5cc' }}>{primeiroNome}</span>. Sua carteira comercial Vertho
        </h1>
        <p className="text-sm mt-1.5" style={{ color: 'rgba(255,255,255,.55)' }}>
          Veja suas oportunidades, propostas, comissões e próximas ações comerciais.
        </p>
      </div>

      {/* Row 1 — KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <SalesMetricCard
          label="Receita contratada no trimestre"
          value={fmtBRL(data.receitaTrimestre)}
          sub="Propostas aceitas no trimestre corrente"
          icon={Handshake}
          accent="#22C55E"
        />
        <SalesMetricCard
          label="Pipeline qualificado"
          value={fmtBRL(data.kpis.pipelineQualificado)}
          sub="Oportunidades com registro completo"
          icon={TrendingUp}
          accent="#34c5cc"
        />
        <SalesMetricCard
          label="Pipeline ponderado"
          value={fmtBRL(data.kpis.pipelinePonderado)}
          sub={`Total em aberto: ${fmtBRL(data.kpis.pipelineTotal)}`}
          icon={Layers}
          accent="#8B5CF6"
        />
        <SalesMetricCard
          label="Comissão estimada"
          value={fmtBRL(data.comissaoEstimadaTotal)}
          sub="Comissões a receber conforme propostas vivas"
          icon={BadgeDollarSign}
          accent="#F59E0B"
        />
      </div>

      {/* Row 2 — Próximas ações comerciais */}
      <div>
        <h2 className="text-sm font-bold text-white mb-3">Próximas ações comerciais</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <SalesAlertCard
            title="Oportunidades sem próxima ação"
            icon={AlertTriangle}
            accent="#F59E0B"
            items={data.semProximaAcao}
            emptyText="Tudo em dia — todas com próxima ação definida"
          />
          <SalesAlertCard
            title="Proteções vencendo"
            icon={Shield}
            accent="#EF4444"
            items={data.protecoesVencendo}
            emptyText="Tudo em dia — proteções de oportunidade vigentes"
          />
          <SalesAlertCard
            title="Propostas aguardando aprovação"
            icon={FileText}
            accent="#34c5cc"
            items={data.aguardandoAprovacao}
            emptyText="Tudo em dia — nenhuma proposta em análise"
          />
          <SalesAlertCard
            title="Renovações próximas"
            icon={CalendarClock}
            accent="#8B5CF6"
            items={data.renovacoesProximas}
            emptyText="Tudo em dia — nenhuma renovação nos próximos 90 dias"
          />
        </div>
      </div>

      {/* Row 3 — Pipeline */}
      <div>
        <h2 className="text-sm font-bold text-white mb-3">Pipeline qualificado</h2>
        <PipelineKanban stages={data.stages} />
      </div>

      {/* Row 4 — Comissões */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <HandCoins size={15} style={{ color: '#34c5cc' }} />
          <h2 className="text-sm font-bold text-white">Comissões a receber</h2>
        </div>
        <CommissionSummaryTable rows={data.commissionRows} totals={data.commissionTotals} />
      </div>

      {/* Row 5 — Carteira */}
      <div>
        <h2 className="text-sm font-bold text-white mb-3">Carteira ativa</h2>
        <PortfolioSummaryCards data={data.portfolio} />
      </div>

      {/* Row 6 — Atalhos de inteligência comercial */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Lightbulb size={15} style={{ color: '#34c5cc' }} />
          <h2 className="text-sm font-bold text-white">Inteligência comercial</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          {MATERIAL_SHORTCUTS.map(({ label, icon: Icon }) => (
            <Link
              key={label}
              href="/representante/inteligencia-comercial"
              className="rounded-2xl p-4 flex flex-col items-start gap-2 transition-colors hover:border-white/20"
              style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)' }}
            >
              <span
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: 'rgba(52,197,204,.1)', color: '#34c5cc' }}
              >
                <Icon size={15} />
              </span>
              <p className="text-xs font-bold text-white leading-snug">{label}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
