'use client';

// Kanban do pipeline — colunas horizontais scrolláveis dos 7 estágios abertos.
import type { StageGroup } from '@/lib/sales/kpis';
import PipelineStageColumn from './pipeline-stage-column';

export default function PipelineKanban({ stages }: { stages: StageGroup[] }) {
  return (
    <div className="overflow-x-auto pb-2 -mx-1 px-1">
      <div className="flex gap-3 items-start min-w-max">
        {stages.map((group) => (
          <PipelineStageColumn key={group.stage} group={group} />
        ))}
      </div>
    </div>
  );
}
