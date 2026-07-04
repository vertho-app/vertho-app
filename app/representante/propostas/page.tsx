'use client';

// Portal do Representante — lista de propostas comerciais.
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Plus } from 'lucide-react';
import { listProposals } from '@/actions/sales/proposals';
import ProposalStatusBadge from '@/components/sales/proposal-status-badge';
import { PROPOSAL_STATUSES, PROPOSAL_STATUS_LABELS, PRODUCT_PACKAGE_LABELS } from '@/lib/sales/constants';
import { fmtBRLExact, fmtDateTime } from '@/lib/sales/formatters';
import type { SalesProposal } from '@/lib/sales/types';

export default function PropostasPage() {
  const router = useRouter();
  const [proposals, setProposals] = useState<SalesProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    (async () => {
      const r = await listProposals();
      if (r.success) setProposals(r.data);
      else toast.error(r.error);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(
    () => (statusFilter ? proposals.filter((p) => p.status === statusFilter) : proposals),
    [proposals, statusFilter],
  );

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-6 text-white">
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">Propostas</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {loading ? 'Carregando…' : `${proposals.length} proposta${proposals.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <button
          onClick={() => router.push('/representante/propostas/nova')}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-[#04121F] bg-cyan-400 hover:bg-cyan-300"
        >
          <Plus size={16} /> Nova proposta
        </button>
      </div>

      <div className="mb-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-lg text-xs text-white border border-white/10 bg-[#091D35] outline-none focus:border-cyan-400/60"
          aria-label="Filtrar por status"
        >
          <option value="">Todos os status</option>
          {PROPOSAL_STATUSES.map((s) => (
            <option key={s} value={s}>{PROPOSAL_STATUS_LABELS[s]}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-16">
          <Loader2 size={24} className="animate-spin text-cyan-400 mx-auto" />
        </div>
      ) : proposals.length === 0 ? (
        <div className="text-center py-16 rounded-xl bg-white/[0.03] border border-white/10">
          <p className="text-sm text-gray-400 max-w-md mx-auto">
            Nenhuma proposta ainda. Crie a primeira a partir de uma oportunidade aberta — o simulador
            calcula o valor do contrato e a sua comissão estimada.
          </p>
          <button
            onClick={() => router.push('/representante/propostas/nova')}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10"
          >
            <Plus size={14} /> Nova proposta
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-sm text-gray-500 rounded-xl bg-white/[0.03] border border-white/10">
          Nenhuma proposta com esse status.
        </div>
      ) : (
        <div className="rounded-xl bg-white/[0.03] border border-white/10 overflow-x-auto">
          <table className="w-full text-xs min-w-[960px]">
            <thead className="bg-white/[0.04]">
              <tr className="text-left text-[10px] uppercase text-gray-500">
                <th className="px-3 py-2">Nº</th>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Oportunidade</th>
                <th className="px-3 py-2">Pacote</th>
                <th className="px-3 py-2 text-right">Mensal</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-right">Comissão est.</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Atualizada em</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => router.push(`/representante/propostas/${p.id}`)}
                  className="hover:bg-white/[0.03] cursor-pointer"
                >
                  <td className="px-3 py-2.5 font-bold text-cyan-400">{p.proposal_number}</td>
                  <td className="px-3 py-2.5 text-gray-300 max-w-[160px] truncate">
                    {p.account?.trade_name || p.account?.legal_name || '—'}
                  </td>
                  <td className="px-3 py-2.5 text-gray-300 max-w-[180px] truncate">
                    {p.opportunity?.opportunity_name || '—'}
                  </td>
                  <td className="px-3 py-2.5 text-gray-300">
                    {p.product_package ? (PRODUCT_PACKAGE_LABELS[p.product_package] || p.product_package) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmtBRLExact(p.monthly_value)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmtBRLExact(p.total_contract_value)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{fmtBRLExact(p.estimated_total_commission)}</td>
                  <td className="px-3 py-2.5"><ProposalStatusBadge status={p.status} /></td>
                  <td className="px-3 py-2.5 text-gray-400">{fmtDateTime(p.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
