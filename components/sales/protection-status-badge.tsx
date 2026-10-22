'use client';

import { Clock, Shield, ShieldAlert, ShieldX } from 'lucide-react';
import { ATTRIBUTION_STATUS_LABELS, PROTECTION_STATUS_LABELS, type AttributionStatus } from '@/lib/sales/constants';
import { protectionDaysLeft } from '@/lib/sales/protection';
import type { ProtectionStatus } from '@/lib/sales/types';

const CFG: Record<ProtectionStatus, { color: string; Icon: typeof Shield }> = {
  active: { color: '#22C55E', Icon: Shield },
  extended: { color: '#34C5CC', Icon: Shield },
  expiring: { color: '#F59E0B', Icon: ShieldAlert },
  expired: { color: '#EF4444', Icon: ShieldX },
};

/**
 * Badge da proteção comercial (90 dias) com dias restantes quando relevante.
 * Antes da validação do registro pela vertho.ai não existe proteção (contrato,
 * 7.5): o badge diz isso em vez de mostrar uma proteção que não corre.
 */
export default function ProtectionStatusBadge({
  status, protectionEnd, attribution, size = 'sm',
}: { status: ProtectionStatus; protectionEnd?: string | null; attribution?: AttributionStatus | null; size?: 'sm' | 'md' }) {
  const naoValidada = attribution === 'aguardando' || attribution === 'recusada';
  const { color, Icon } = attribution === 'aguardando'
    ? { color: '#F59E0B', Icon: Clock }
    : attribution === 'recusada'
      ? { color: '#EF4444', Icon: ShieldX }
      : (CFG[status] || CFG.active);
  const left = !naoValidada && protectionEnd ? protectionDaysLeft(protectionEnd) : null;
  const suffix = !naoValidada && status === 'expiring' && left != null && left >= 0 ? ` · ${left}d` : '';
  const label = naoValidada ? ATTRIBUTION_STATUS_LABELS[attribution] : (PROTECTION_STATUS_LABELS[status] || status);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold ${size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'}`}
      style={{ background: `${color}14`, border: `1px solid ${color}45`, color }}
      title={naoValidada ? undefined : protectionEnd ? `Proteção até ${protectionEnd}` : undefined}
    >
      <Icon size={size === 'sm' ? 10 : 12} />
      {label}{suffix}
    </span>
  );
}
