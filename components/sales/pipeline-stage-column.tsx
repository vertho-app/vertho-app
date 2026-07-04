'use client';

// Coluna de estágio do funil (kanban do pipeline).
import { STAGE_COLORS, STAGE_LABELS } from '@/lib/sales/constants';
import { fmtBRL } from '@/lib/sales/formatters';
import type { StageGroup } from '@/lib/sales/kpis';
import OpportunityCard from './opportunity-card';

export default function PipelineStageColumn({ group }: { group: StageGroup }) {
  const color = STAGE_COLORS[group.stage] || '#6B7280';
  return (
    <div
      className="w-[240px] shrink-0 rounded-2xl p-3 flex flex-col gap-2"
      style={{ background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.06)' }}
    >
      <div className="px-1">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
          <p className="text-[11px] font-bold text-white flex-1 min-w-0 truncate" title={STAGE_LABELS[group.stage]}>
            {STAGE_LABELS[group.stage]}
          </p>
          <span
            className="px-1.5 py-0.5 rounded-full text-[10px] font-bold shrink-0"
            style={{ background: `${color}1a`, border: `1px solid ${color}45`, color }}
          >
            {group.count}
          </span>
        </div>
        <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,.45)' }}>
          {fmtBRL(group.totalValue)}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {group.opportunities.length === 0 ? (
          <p className="text-[11px] px-1 py-2" style={{ color: 'rgba(255,255,255,.3)' }}>
            Nenhuma oportunidade neste estágio
          </p>
        ) : (
          group.opportunities.map((o) => <OpportunityCard key={o.id} opportunity={o} />)
        )}
      </div>
    </div>
  );
}
