'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

/**
 * Container base das sub-páginas do dashboard no padrão "Cinematic".
 * Dá respiro em desktop e padding compatível com a sidebar.
 */
export function PageContainer({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`max-w-[1100px] mx-auto px-5 md:px-10 py-6 md:py-10 ${className}`}>
      {children}
    </div>
  );
}

/**
 * Hero editorial — saudação/categoria + título grande + subtítulo.
 * Usado no topo de cada sub-página pra manter coerência com a home.
 *
 * A cor de --phase-accent é herdada do ancestral com data-phase="N".
 * Fallback: ciano da marca (#22d3ee).
 */
interface PageHeroProps {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  showBack?: boolean;
  actions?: React.ReactNode;
  titleAccent?: React.ReactNode;
}

export function PageHero({ eyebrow, title, subtitle, showBack = true, actions, titleAccent }: PageHeroProps) {
  const router = useRouter();
  return (
    <header className="mb-8 md:mb-12">
      {showBack && (
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-xs md:text-sm text-gray-400 hover:text-white transition-colors mb-3 md:mb-5"
        >
          <ArrowLeft size={16} /> Voltar
        </button>
      )}

      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && (
            // ✅ PATCH: era text-cyan-400 hardcoded — agora herda --phase-accent
            <p
              className="text-[10px] md:text-xs font-bold tracking-[0.25em] uppercase mb-2"
              style={{ color: 'var(--phase-accent, #22d3ee)' }}
            >
              {eyebrow}
            </p>
          )}
          <h1
            className="font-extrabold text-2xl md:text-4xl text-white leading-tight"
            // ✅ PATCH: textShadow usa color-mix com --phase-accent em vez de ciano fixo
            style={{
              textShadow:
                '0 0 40px color-mix(in oklab, var(--phase-accent, #00B4D8) 20%, transparent)',
            }}
          >
            {title}
            {titleAccent && (
              <span style={{ color: 'var(--phase-accent, #22d3ee)' }}> {titleAccent}</span>
            )}
          </h1>
          {subtitle && (
            <p className="text-sm text-gray-400 mt-2 max-w-2xl leading-relaxed">{subtitle}</p>
          )}
        </div>

        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
    </header>
  );
}

/**
 * GlassCard — wrapper leve com backdrop blur + border sutil.
 * Consistente com os bento cards da home.
 */
export function GlassCard({
  children,
  className = '',
  padding = 'p-5 md:p-6',
}: {
  children: React.ReactNode;
  className?: string;
  padding?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-white/[0.06] ${padding} ${className}`}
      style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(12px)' }}
    >
      {children}
    </div>
  );
}

/**
 * SectionHeader — título de seção interna com eyebrow tracking.
 */
export function SectionHeader({
  eyebrow,
  title,
  actions,
}: {
  eyebrow?: React.ReactNode;
  title?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between mb-4 md:mb-6">
      <div>
        {eyebrow && (
          <p className="text-[10px] md:text-xs font-bold tracking-[0.2em] text-gray-400 uppercase mb-1">
            {eyebrow}
          </p>
        )}
        {title && <h2 className="text-lg md:text-xl font-extrabold text-white">{title}</h2>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
