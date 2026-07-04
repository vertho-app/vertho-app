'use client';

// Seção de categoria da Inteligência Comercial (título + grid de materiais).
import { MATERIAL_CATEGORY_LABELS } from '@/lib/sales/constants';
import type { SalesMaterial } from '@/lib/sales/types';
import SalesMaterialCard from './sales-material-card';

export default function PlaybookSection({
  category, materials,
}: {
  category: string;
  materials: SalesMaterial[];
}) {
  if (materials.length === 0) return null;
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-bold text-white">{MATERIAL_CATEGORY_LABELS[category] || category}</h2>
        <span
          className="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
          style={{ background: 'rgba(52,197,204,.1)', border: '1px solid rgba(52,197,204,.3)', color: '#34c5cc' }}
        >
          {materials.length}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {materials.map((m) => (
          <SalesMaterialCard key={m.id} material={m} />
        ))}
      </div>
    </section>
  );
}
