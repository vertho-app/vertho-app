'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, FileText, Loader2 } from 'lucide-react';
import { listProposals } from '@/actions/sales/proposals';
import { listRepresentativesForAdmin } from '@/actions/sales/representatives';
import AdminPageHeader from '@/components/admin/page-header';
import ProposalStatusBadge from '@/components/sales/proposal-status-badge';
import { PRODUCT_PACKAGE_LABELS, PROPOSAL_STATUSES, PROPOSAL_STATUS_LABELS } from '@/lib/sales/constants';
import { fmtBRL } from '@/lib/sales/formatters';
import type { SalesProposal, SalesRepresentative } from '@/lib/sales/types';

export default function PropostasAdminPage() {
  const [proposals, setProposals] = useState<SalesProposal[]>([]);
  const [reps, setReps] = useState<SalesRepresentative[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('submitted_for_approval');
  const [repFilter, setRepFilter] = useState<string>('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [p, r] = await Promise.all([listProposals(), listRepresentativesForAdmin()]);
      if (p.success) setProposals(p.data);
      else setError(p.error || 'Falha ao carregar propostas');
      if (r.success) setReps(r.data);
      setLoading(false);
    })();
  }, []);

  const repById = useMemo(() => new Map(reps.map((r) => [r.id, r.name])), [reps]);

  const filtered = useMemo(
    () => proposals.filter((p) =>
      (!statusFilter || p.status === statusFilter) &&
      (!repFilter || p.representante_id === repFilter)),
    [proposals, statusFilter, repFilter],
  );

  return (
    <div className="min-h-full text-white">
      <div className="max-w-6xl mx-auto p-6">
        <AdminPageHeader
          icon={FileText}
          title="Propostas do canal"
          subtitle="Todas as propostas dos representantes — aprovação interna Vertho"
          backHref="/admin/comercial"
        />

        {/* Filtros */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-xs text-white border border-white/10 bg-[#091D35]"
          >
            <option value="">Todos os status ({proposals.length})</option>
            {PROPOSAL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PROPOSAL_STATUS_LABELS[s]} ({proposals.filter((p) => p.status === s).length})
              </option>
            ))}
          </select>
          <select
            value={repFilter}
            onChange={(e) => setRepFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-xs text-white border border-white/10 bg-[#091D35]"
          >
            <option value="">Todos os representantes</option>
            {reps.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <span className="text-xs text-gray-500">{filtered.length} proposta{filtered.length === 1 ? '' : 's'}</span>
        </div>

        {loading ? (
          <div className="text-center py-12"><Loader2 size={24} className="animate-spin text-cyan-400 mx-auto" /></div>
        ) : error ? (
          <div className="rounded-xl p-4 bg-red-500/10 border border-red-500/25 text-sm text-red-300">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-500 text-sm">Nenhuma proposta com estes filtros.</div>
        ) : (
          <div className="rounded-xl bg-white/[0.03] border border-white/10 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-white/[0.04]">
                <tr className="text-left text-[10px] uppercase text-gray-500">
                  <th className="px-3 py-2">Nº</th>
                  <th className="px-3 py-2">Representante</th>
                  <th className="px-3 py-2">Cliente</th>
                  <th className="px-3 py-2">Pacote</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-right">Comissão estimada</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-white/[0.02]">
                    <td className="px-3 py-2 font-mono font-bold text-cyan-400">
                      <Link href={`/admin/comercial/propostas/${p.id}`} className="hover:underline">
                        {p.proposal_number}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-gray-300">{repById.get(p.representante_id) || '—'}</td>
                    <td className="px-3 py-2 text-white">
                      {p.account?.trade_name || p.account?.legal_name || '—'}
                    </td>
                    <td className="px-3 py-2 text-gray-400">
                      {p.product_package ? (PRODUCT_PACKAGE_LABELS[p.product_package] || p.product_package) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-white">{fmtBRL(p.total_contract_value)}</td>
                    <td className="px-3 py-2 text-right text-amber-300">{fmtBRL(p.estimated_total_commission)}</td>
                    <td className="px-3 py-2"><ProposalStatusBadge status={p.status} /></td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/comercial/propostas/${p.id}`}
                        className="text-cyan-400 hover:text-cyan-300"
                        title="Abrir proposta"
                      >
                        <ExternalLink size={13} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
