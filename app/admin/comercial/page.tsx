'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Briefcase, ClipboardCheck, Coins, FileText, FolderOpen, Loader2, Lock, ShieldAlert, Users,
} from 'lucide-react';
import { getCommercialAdminDashboard } from '@/actions/sales/admin-dashboard';
import AdminPageHeader from '@/components/admin/page-header';
import RepresentativePerformanceTable from '@/components/sales/representative-performance-table';
import PendingProposalsTable from '@/components/sales/pending-proposals-table';
import PendingRegistrationsTable from '@/components/sales/pending-registrations-table';
import CommissionExposureTable from '@/components/sales/commission-exposure-table';
import ReservasPanel from '@/components/sales/reservas-panel';
import { fmtBRL, fmtDate } from '@/lib/sales/formatters';

type DashboardResult = Awaited<ReturnType<typeof getCommercialAdminDashboard>>;
type DashboardData = Extract<DashboardResult, { success: true }>;

const QUICK_LINKS = [
  { href: '/admin/comercial/representantes', label: 'Representantes', Icon: Users },
  { href: '/admin/comercial/carteira', label: 'Carteira', Icon: Briefcase },
  { href: '/admin/comercial/propostas', label: 'Propostas', Icon: FileText },
  { href: '/admin/comercial/comissoes', label: 'Comissões', Icon: Coins },
  { href: '/admin/comercial/materiais', label: 'Materiais', Icon: FolderOpen },
  { href: '/admin/comercial/treinamento', label: 'Treino de vendas', Icon: Briefcase },
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

  const carregar = useCallback(async () => {
    const r = await getCommercialAdminDashboard();
    if (r.success) { setData(r); setError(null); }
    else setError(r.error || 'Falha ao carregar o dashboard comercial');
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

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
              <TotalCard label="Pipeline total" value={fmtBRL(data.totals.pipelineTotal)} accent="#34C5CC" />
              <TotalCard label="Pipeline qualificado" value={fmtBRL(data.totals.pipelineQualificado)} accent="#3B82F6" />
              <TotalCard label="Exposição de comissão" value={fmtBRL(data.totals.commissionExposure)} accent="#F59E0B" />
              <TotalCard
                label="Propostas aguardando"
                value={String(data.totals.pendingCount)}
                accent={data.totals.pendingCount > 0 ? '#F97316' : '#22C55E'}
                href="/admin/comercial/propostas"
              />
            </div>

            {/* Fila de validação do registro (contrato do RC v6, 7.1): o que não foi aceito na hora */}
            <section className="mb-6">
              <h2 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
                <ClipboardCheck size={15} className="text-amber-400" /> Registros na fila de validação
                {data.totals.pendingRegistrationsCount > 0 && (
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-bold bg-amber-500/15 text-amber-300">
                    {data.totals.pendingRegistrationsCount}
                  </span>
                )}
              </h2>
              <p className="text-[11px] text-gray-500 mb-2">
                Cliente livre é aceito na hora pelo portal. Chega aqui o registro que esbarrou na lista de reserva, num cliente com outro representante ou numa conferência que falhou. Recuse cliente já ativo ou em negociação com a vertho.ai, lead próprio ou indicação de terceiro (7.3), e o registro que outro representante fez antes (7.4).
              </p>
              <PendingRegistrationsTable rows={data.pendingRegistrations} onDone={carregar} />
            </section>

            {/* Lista de reserva da vertho.ai (7.3) */}
            <section className="mb-6">
              <h2 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
                <Lock size={15} className="text-cyan-400" /> Lista de reserva da vertho.ai
              </h2>
              <p className="text-[11px] text-gray-500 mb-2">
                Clientes, leads próprios e negociações diretas da vertho.ai (cláusula 7.3). O registro de representante com o mesmo CNPJ básico ou INEP vai para a fila acima em vez de ser aceito na hora. O representante não vê esta lista.
              </p>
              <ReservasPanel />
            </section>

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

            {/* Mesma instituição em mais de um RC (regra de 08/10: vale o primeiro registro válido) */}
            <section className="mb-6">
              <h2 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
                <ShieldAlert size={15} className="text-amber-400" /> Mesma instituição em mais de um representante
              </h2>
              <p className="text-[11px] text-gray-500 mb-2">
                Comparação por INEP, por CNPJ básico (matriz e filiais) ou por nome e cidade. O portal já bloqueia o cliente que está com outro representante; aqui aparecem os casos por nome e os clientes que mudaram de mãos depois de 90 dias sem movimentação.
              </p>
              {data.contasEmMaisDeUmRc.length === 0 ? (
                <p className="text-xs text-gray-500 py-4 text-center rounded-xl bg-white/[0.03] border border-white/10">
                  Nenhuma instituição registrada por mais de um representante.
                </p>
              ) : (
                <div className="rounded-xl bg-white/[0.03] border border-white/10 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-white/[0.04]">
                      <tr className="text-left text-[10px] uppercase text-gray-500">
                        <th className="px-3 py-2">Instituição</th>
                        <th className="px-3 py-2">Cidade</th>
                        <th className="px-3 py-2">Representante</th>
                        <th className="px-3 py-2 text-right">Cadastrada em</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {data.contasEmMaisDeUmRc.map((grupo) => grupo.map((c, i) => (
                        <tr key={c.id} className={i === 0 ? 'border-t border-white/15' : ''}>
                          <td className="px-3 py-2 font-semibold text-white">
                            {c.nome}
                            {i === 0 && <span className="ml-2 text-[10px] font-semibold text-emerald-400">cadastrada primeiro</span>}
                          </td>
                          <td className="px-3 py-2 text-gray-400">{c.cidade || '—'}</td>
                          <td className="px-3 py-2 text-gray-300">{c.repName}</td>
                          <td className="px-3 py-2 text-right text-gray-400">{c.created_at ? fmtDate(c.created_at) : '—'}</td>
                        </tr>
                      )))}
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
