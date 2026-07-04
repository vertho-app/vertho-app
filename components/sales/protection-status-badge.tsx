'use client';

import { Shield, ShieldAlert, ShieldX } from 'lucide-react';
import { PROTECTION_STATUS_LABELS } from '@/lib/sales/constants';
import { protectionDaysLeft } from '@/lib/sales/protection';
import type { ProtectionStatus } from '@/lib/sales/types';

const CFG: Record<ProtectionStatus, { color: string; Icon: typeof Shield }> = {
  active: { color: '#22C55E', Icon: Shield },
  extended: { color: '#06B6D4', Icon: Shield },
  expiring: { color: '#F59E0B', Icon: ShieldAlert },
  expired: { color: '#EF4444', Icon: ShieldX },
};

/** Badge da proteção comercial (90 dias) com dias restantes quando relevante. */
export default function ProtectionStatusBadge({
  status, protectionEnd, size = 'sm',
}: { status: ProtectionStatus; protectionEnd?: string | null; size?: 'sm' | 'md' }) {
  const { color, Icon } = CFG[status] || CFG.active;
  const left = protectionEnd ? protectionDaysLeft(protectionEnd) : null;
  const suffix = status === 'expiring' && left != null && left >= 0 ? ` · ${left}d` : '';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold ${size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'}`}
      style={{ background: `${color}14`, border: `1px solid ${color}45`, color }}
      title={protectionEnd ? `Proteção até ${protectionEnd}` : undefined}
    >
      <Icon size={size === 'sm' ? 10 : 12} />
      {PROTECTION_STATUS_LABELS[status] || status}{suffix}
    </span>
  );
}
