'use client';

import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { fmtBRL, fmtDateTime } from '@/lib/sales/formatters';

/** Linha de proposta pendente (contrato de getCommercialAdminDashboard().pendingProposals). */
export type PendingProposalRow = {
  id: string;
  proposal_number: string;
  repName: string;
  cliente: string;
  total_contract_value: number | null;
  created_at: string;
};

/** Propostas aguardando aprovação interna — fila de decisão do admin. */
export default function PendingProposalsTable({ rows }: { rows: PendingProposalRow[] }) {
  if (rows.length === 0) {
    return <p className="text-xs text-gray-500 py-6 text-center">Nenhuma proposta aguardando aprovação.</p>;
  }

  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/10 overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-white/[0.04]">
          <tr className="text-left text-[10px] uppercase text-gray-500">
            <th className="px-3 py-2">Nº</th>
            <th className="px-3 py-2">Representante</th>
            <th className="px-3 py-2">Cliente</th>
            <th className="px-3 py-2 text-right">Valor total</th>
            <th className="px-3 py-2">Enviada em</th>
            <th className="px-3 py-2 w-8"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {rows.map((p) => (
            <tr key={p.id} className="hover:bg-white/[0.02]">
              <td className="px-3 py-2 font-mono font-bold text-cyan-400">
                <Link href={`/admin/comercial/propostas/${p.id}`} className="hover:underline">
                  {p.proposal_number}
                </Link>
              </td>
              <td className="px-3 py-2 text-gray-300">{p.repName}</td>
              <td className="px-3 py-2 text-white">{p.cliente}</td>
              <td className="px-3 py-2 text-right font-semibold text-white">{fmtBRL(p.total_contract_value)}</td>
              <td className="px-3 py-2 text-gray-400">{fmtDateTime(p.created_at)}</td>
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
  );
}
