'use client';

// Card de oportunidade dentro da coluna do kanban.
import Link from 'next/link';
import { CalendarClock } from 'lucide-react';
import { fmtBRL, fmtDate } from '@/lib/sales/formatters';
import type { SalesOpportunity } from '@/lib/sales/types';
import ProtectionStatusBadge from './protection-status-badge';

export default function OpportunityCard({ opportunity }: { opportunity: SalesOpportunity }) {
  const conta = opportunity.account?.trade_name || opportunity.account?.legal_name || '—';
  return (
    <Link
      href={`/representante/crm/${opportunity.id}`}
      className="block rounded-xl p-3 transition-colors hover:border-white/20"
      style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)' }}
    >
      <p className="text-xs font-bold text-white truncate" title={opportunity.opportunity_name}>
        {opportunity.opportunity_name}
      </p>
      <p className="text-[11px] truncate mt-0.5" style={{ color: 'rgba(255,255,255,.5)' }} title={conta}>
        {conta}
      </p>
      <div className="flex items-center justify-between gap-2 mt-2">
        <span className="text-xs font-extrabold" style={{ color: '#34c5cc' }}>
          {fmtBRL(opportunity.estimated_value)}
        </span>
        <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: 'rgba(255,255,255,.45)' }}>
          <CalendarClock size={10} />
          {fmtDate(opportunity.next_action_date)}
        </span>
      </div>
      <div className="mt-2">
        <ProtectionStatusBadge
          status={opportunity.protection_status}
          protectionEnd={opportunity.protection_end_date}
        />
      </div>
    </Link>
  );
}
