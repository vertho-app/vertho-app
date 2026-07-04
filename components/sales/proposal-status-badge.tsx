'use client';

import { PROPOSAL_STATUS_COLORS, PROPOSAL_STATUS_LABELS, type ProposalStatus } from '@/lib/sales/constants';

/** Badge do status da proposta (máquina de estados de aprovação). */
export default function ProposalStatusBadge({ status, size = 'sm' }: { status: ProposalStatus; size?: 'sm' | 'md' }) {
  const color = PROPOSAL_STATUS_COLORS[status] || '#6B7280';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'}`}
      style={{ background: `${color}1a`, border: `1px solid ${color}55`, color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {PROPOSAL_STATUS_LABELS[status] || status}
    </span>
  );
}
