'use client';

import {
  Video, Film, FileText, Headphones, BarChart3, Dumbbell, Users, BookOpen,
} from 'lucide-react';

const ICONS = { Video, Film, FileText, Headphones, BarChart3, Dumbbell, Users, BookOpen };

export default function PreferenciasRanking({ data, title, subtitle, compact = false }) {
  const ranking = Array.isArray(data?.ranking) ? data.ranking : [];

  if (ranking.length === 0) {
    return (
      <div className="text-center py-10 text-sm text-gray-500">
        Nenhum colaborador preencheu as preferências de aprendizagem ainda.
      </div>
    );
  }

  const valores = ranking.map(r => Number(r?.media) || 0);
  const max = Math.max(5, ...valores);

  return (
    <div>
      {(title || subtitle) && (
        <div className="mb-4">
          {title && <h3 className="text-sm font-bold text-white">{title}</h3>}
          {subtitle && <p className="text-[11px] text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
      )}
      <div className={compact ? 'space-y-2' : 'space-y-3'}>
        {ranking.map((r, i) => {
          const Icon = ICONS[r?.icon] || BookOpen;
          const media = Number(r?.media) || 0;
          const pct = max > 0 ? Math.min(100, (media / max) * 100) : 0;
          const isTop = i === 0;
          const barBg = isTop
            ? 'linear-gradient(90deg, #00B4D8, #0D9488)'
            : 'rgba(0,180,216,0.45)';
          const cardStyle = compact
            ? undefined
            : { background: '#091D35' };
          const cardClass = compact
            ? ''
            : 'rounded-lg px-3 py-2.5 border border-white/[0.04]';
          return (
            <div key={r?.key || i} className={cardClass} style={cardStyle}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  {!compact && (
                    <span className={`text-[10px] font-bold w-5 text-center ${isTop ? 'text-cyan-400' : 'text-gray-500'}`}>
                      #{i + 1}
                    </span>
                  )}
                  <Icon size={compact ? 12 : 14} className={isTop ? 'text-cyan-400' : 'text-gray-400'} />
                  <span className={`${compact ? 'text-[11px]' : 'text-xs'} font-semibold ${isTop ? 'text-white' : 'text-gray-300'} truncate`}>
                    {r?.label || '—'}
                  </span>
                </div>
                <span className={`${compact ? 'text-[11px]' : 'text-sm'} font-bold ${isTop ? 'text-cyan-400' : 'text-gray-300'}`}>
                  {media.toFixed(2)}
                </span>
              </div>
              <div className={`${compact ? 'h-1.5' : 'h-2'} rounded-full overflow-hidden`}
                style={{ background: 'rgba(255,255,255,0.05)' }}>
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${pct}%`, background: barBg }} />
              </div>
              {!compact && r?.respondentes != null && (
                <p className="text-[9px] text-gray-600 mt-1">{r.respondentes} respondente(s)</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
