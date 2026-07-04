'use client';

import { STAGE_COLORS, STAGE_LABELS, type PipelineStage } from '@/lib/sales/constants';

/** Badge do estágio do funil — cor e rótulo canônicos. */
export default function OpportunityStageBadge({ stage, size = 'sm' }: { stage: PipelineStage; size?: 'sm' | 'md' }) {
  const color = STAGE_COLORS[stage] || '#6B7280';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'}`}
      style={{ background: `${color}1a`, border: `1px solid ${color}55`, color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {STAGE_LABELS[stage] || stage}
    </span>
  );
}
