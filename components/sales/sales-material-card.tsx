'use client';

// Card de material de inteligência comercial (arquivo ou link externo).
import { ExternalLink, FileDown, FileText } from 'lucide-react';
import { MATERIAL_CATEGORY_LABELS } from '@/lib/sales/constants';
import type { SalesMaterial } from '@/lib/sales/types';

export default function SalesMaterialCard({ material }: { material: SalesMaterial }) {
  const url = material.file_url || material.external_url;
  const isExternal = !material.file_url && !!material.external_url;
  const LinkIcon = isExternal ? ExternalLink : FileDown;

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: 'rgba(52,197,204,.1)', color: '#34c5cc' }}
        >
          <FileText size={15} />
        </span>
        {url && <LinkIcon size={13} style={{ color: 'rgba(255,255,255,.4)' }} className="shrink-0 mt-1" />}
      </div>
      <p className="text-sm font-bold text-white mt-2 leading-snug">{material.title}</p>
      {material.description && (
        <p className="text-[11px] mt-1 leading-relaxed line-clamp-3" style={{ color: 'rgba(255,255,255,.55)' }}>
          {material.description}
        </p>
      )}
      <div className="flex items-center gap-1.5 mt-3 flex-wrap">
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.12)', color: 'rgba(255,255,255,.6)' }}
        >
          {MATERIAL_CATEGORY_LABELS[material.category] || material.category}
        </span>
        {material.segment && (
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{ background: 'rgba(52,197,204,.08)', border: '1px solid rgba(52,197,204,.3)', color: '#34c5cc' }}
          >
            {material.segment}
          </span>
        )}
      </div>
    </>
  );

  const cardStyle = {
    background: 'rgba(255,255,255,.03)',
    border: '1px solid rgba(255,255,255,.08)',
  } as const;

  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block rounded-2xl p-4 transition-colors hover:border-white/20"
        style={cardStyle}
      >
        {body}
      </a>
    );
  }
  return (
    <div className="rounded-2xl p-4" style={cardStyle}>
      {body}
    </div>
  );
}
