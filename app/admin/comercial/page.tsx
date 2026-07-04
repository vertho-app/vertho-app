'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Briefcase, Coins, FileText, FolderOpen, Loader2, ShieldAlert, Users,
} from 'lucide-react';
import { getCommercialAdminDashboard } from '@/actions/sales/admin-dashboard';
import AdminPageHeader from '@/components/admin/page-header';
import RepresentativePerformanceTable from '@/components/sales/representative-performance-table';
import PendingProposalsTable from '@/components/sales/pending-proposals-table';
import CommissionExposureTable from '@/components/sales/commission-exposure-table';
import { fmtBRL, fmtDate } from '@/lib/sales/formatters';

type DashboardResult = Awaited<ReturnType<typeof getCommercialAdminDashboard>>;
type DashboardData = Extract<DashboardResult, { success: true }>;

const QUICK_LINKS = [
  { href: '/admin/comercial/representantes', label: 'Representantes', Icon: Users },
  { href: '/admin/comercial/carteira', label: 'Carteira', Icon: Briefcase },
  { href: '/admin/comercial/propostas', label: 'Propostas', Icon: FileText },
  { href: '/admin/comercial/comissoes', label: 'Comissões', Icon: Coins },
  { href: '/admin/comercial/materiais', label: 'Materiais', Icon: FolderOpen },
];

function TotalCard({ label, value, accent, href }: { label: string; value: string; accent: string; href?: string }) {
  const body = (
    <div
      className="rounded-xl p-4 border h-full"
      style={{ background: 'rgba(255,255,255,.03)', borderColor: `${accent}30` }}
    >
      <p className="text-[10px] uppercase tracking-wider text-gray-500">{label}</p>
      <p className="text-xl font-bold mt-1" style={{ color: accent }}>{value}</p>
    </div>
  );
  return href ? <Link href={href} className="block hover:opacity-90">{body}</Link> : body;
}

export default function ComercialDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const r = await getCommercialAdminDashboard();
      if (r.success) setData(r);
      else setError(r.error || 'Falha ao carregar o dashboard comercial');
      setLoading(false);
    })();
  }, []);

  return (
    <div className="min-h-full text-white">
      <div className="max-w-6xl mx-auto p-6">
        <AdminPageHeader
          icon={Briefcase}
          title="Canal Comercial"
          subtitle="Representantes, pipeline e aprovações"
          actions={
            <>
              {QUICK_LINKS.map(({ href, label, Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10"
                >
                  <Icon size={14} /> {label}
                </Link>
              ))}
            </>
          }
        />

        {loading ? (
          <div className="text-center py-12"><Loader2 size={24} className="animate-spin text-cyan-400 mx-auto" /></div>
        ) : error ? (
          <div className="rounded-xl p-4 bg-red-500/10 border border-red-500/25 text-sm text-red-300">{error}</div>
        ) : data && (
          <>
            {/* Totais do canal */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              <TotalCard label="Pipeline total" value={fmtBRL(data.totals.pipelineTotal)} accent="#22D3EE" />
              <TotalCard label="Pipeline qualificado" value={fmtBRL(data.totals.pipelineQualificado)} accent="#3B82F6" />
              <TotalCard label="Exposição de comissão" value={fmtBRL(data.totals.commissionExposure)} accent="#F59E0B" />
              <TotalCard
                label="Propostas aguardando"
                value={String(data.totals.pendingCount)}
                accent={data.totals.pendingCount > 0 ? '#F97316' : '#22C55E'}
                href="/admin/comercial/propostas"
              />
            </div>

            {/* Performance por representante */}
            <section className="mb-6">
              <h2 className="text-sm font-bold text-white mb-2">Performance por representante</h2>
              <RepresentativePerformanceTable rows={data.byRep} />
            </section>

            {/* Fila de aprovação */}
            <section className="mb-6">
              <h2 className="text-sm font-bold text-white mb-2">Propostas aguardando aprovação</h2>
              <PendingProposalsTable
                rows={data.pendingProposals.map((p) => ({
                  id: p.id,
                  proposal_number: p.proposal_number,
                  repName: p.repName,
                  cliente: p.cliente,
                  total_contract_value: p.total,
                  created_at: p.created_at,
                }))}
              />
            </section>

            {/* Proteções vencendo */}
            <section className="mb-6">
              <h2 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                <ShieldAlert size={15} className="text-amber-400" /> Proteções vencendo
              </h2>
              {data.expiringProtections.length === 0 ? (
                <p className="text-xs text-gray-500 py-4 text-center rounded-xl bg-white/[0.03] border border-white/10">
                  Nenhuma proteção vencendo nos próximos dias.
                </p>
              ) : (
                <div className="rounded-xl bg-white/[0.03] border border-white/10 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-white/[0.04]">
                      <tr className="text-left text-[10px] uppercase text-gray-500">
                        <th className="px-3 py-2">Oportunidade</th>
                        <th className="px-3 py-2">Conta</th>
                        <th className="px-3 py-2">Representante</th>
                        <th className="px-3 py-2 text-right">Vence em</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {data.expiringProtections.map((p) => (
                        <tr key={p.id} className="hover:bg-white/[0.02]">
                          <td className="px-3 py-2 font-semibold text-white">{p.nome}</td>
                          <td className="px-3 py-2 text-gray-300">{p.cliente}</td>
                          <td className="px-3 py-2 text-gray-400">{p.repName}</td>
                          <td className="px-3 py-2 text-right">
                            <span
                              className="font-bold"
                              style={{ color: (p.daysLeft ?? 99) <= 5 ? '#EF4444' : '#F59E0B' }}
                              title={`Proteção até ${fmtDate(p.protection_end_date)}`}
                            >
                              {p.daysLeft != null ? `${p.daysLeft}d` : '—'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Exposição de comissão */}
            <section className="mb-6">
              <h2 className="text-sm font-bold text-white mb-2">Exposição de comissão por representante</h2>
              <CommissionExposureTable
                rows={data.byRep.map((r) => ({ id: r.rep.id, name: r.rep.name, exposure: r.commissionExposure }))}
              />
            </section>
          </>
        )}
      </div>
    </div>
  );
}
