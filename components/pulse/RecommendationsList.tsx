'use client';

import { Lightbulb } from 'lucide-react';
import type { TriangulationItem } from '@/lib/pulse/triangulation';

interface Props {
  items: TriangulationItem[];
}

export function RecommendationsList({ items }: Props) {
  if (!items?.length) return null;
  return (
    <div className="rounded-xl border border-cyan-400/15 p-4" style={{ background: '#0F2A4A' }}>
      <p className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
        <Lightbulb size={12} /> Recomendações para liderança e RH
      </p>
      <div className="space-y-3">
        {items.map((it, i) => (
          <div key={i} className="pl-4 border-l-2 border-cyan-400/40">
            <p className="text-xs font-bold text-white mb-0.5">{it.title}</p>
            <p className="text-[11px] text-gray-300 leading-relaxed">{it.detail}</p>
            {it.dimensions.length > 0 && (
              <p className="text-[9px] text-gray-600 mt-1">{it.dimensions.join(' · ')}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
