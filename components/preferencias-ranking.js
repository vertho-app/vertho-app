'use client';

import {
  Video, Film, FileText, Headphones, BarChart3, Dumbbell, Users, BookOpen,
} from 'lucide-react';

const ICONS = { Video, Film, FileText, Headphones, BarChart3, Dumbbell, Users, BookOpen };

/**
 * Renderiza um ranking horizontal das preferências de aprendizagem.
 * Espera `data` no formato { ranking: [{ key, label, icon, media, respondentes }] }.
 *
 * Props:
 * - data: objeto com `ranking[]`
 * - title: string opcional
 * - subtitle: string opcional
 * - compact: bool — versão menor (sem subtitle, barras finas)
 */
export default function PreferenciasRanking({ data, title, subtitle, compact = false }) {
  if (!data?.ranking?.length) {
    return (
      <div className="text-center py-10 text-sm text-gray-500">
        Nenhum colaborador preencheu as preferências de aprendizagem ainda.
      </div>
    );
  }

  const max = Math.max(...data.ranking.map(r => r.media || 0), 5); // escala 1-5

  return (
    <div>
      {(title || subtitle) && (
        <div className="mb-4">
          {title && <h3 className="text-sm font-bold text-white">{title}</h3>}
          {subtitle && <p className="text-[11px] text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
      )}
      <div className={compact ? 'space-y-2' : 'space-y-3'}>
        {data.ranking.map((r, i) => {
          const Icon = ICONS[r.icon] || BookOpen;
          const pct = max > 0 ? Math.min(100, (r.media / max) * 100) : 0;
          const isTop = i === 0;
          const barColor = isTop
            ? 'linear-gradient(90deg, #00B4D8, #0D9488)'
            : 'rgba(0,180,216,0.45)';
          return (
            <div key={r.key} className={compact ? '' : 'rounded-lg px-3 py-2.5 border border-white/[0.04]'}
              style={!compact ? { background: '#091D35' } : undefined}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  {!compact && (
                    <span className={`text-[10px] font-bold w-5 text-center ${isTop ? 'text-cyan-400' : 'text-gray-500'}`}>
                      #{i + 1}
                    </span>
                  )}
                  <Icon size={compact ? 12 : 14} className={isTop ? 'text-cyan-400' : 'text-gray-400'} />
                  <span className={`text-${compact ? '[11px]' : 'xs'} font-semibold ${isTop ? 'text-white' : 'text-gray-300'} truncate`}>
                    {r.label}
                  </span>
                </div>
                <span className={`text-${compact ? '[11px]' : 'sm'} font-bold ${isTop ? 'text-cyan-400' : 'text-gray-300'}`}>
                  {r.media.toFixed(2)}
                </span>
              </div>
              <div className={`${compact ? 'h-1.5' : 'h-2'} rounded-full overflow-hidden`}
                style={{ background: 'rgba(255,255,255,0.05)' }}>
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${pct}%`, background: barColor }} />
              </div>
              {!compact && r.respondentes !== undefined && (
                <p className="text-[9px] text-gray-600 mt-1">{r.respondentes} respondente(s)</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
