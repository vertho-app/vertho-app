'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

export function PageContainer({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`max-w-[1100px] mx-auto px-5 md:px-10 py-6 md:py-10 ${className}`}>
      {children}
    </div>
  );
}

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
            // ✅ eyebrow usa --phase-accent; fallback ciano
            <p
              className="text-[10px] md:text-xs font-bold tracking-[0.25em] uppercase mb-2"
              style={{ color: 'var(--phase-accent, #22d3ee)' }}
            >
              {eyebrow}
            </p>
          )}
          {/* ✅ h1 em Instrument Serif itálico */}
          <h1
            className="leading-tight"
            style={{
              fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
              fontStyle: 'italic',
              fontWeight: 400,
              fontSize: 'clamp(28px, 4.5vw, 44px)',
              letterSpacing: '-0.02em',
              color: '#fff',
              textShadow: 'none',
            }}
          >
            {title}
            {titleAccent && (
              <em style={{ color: 'var(--phase-accent, #22d3ee)', fontStyle: 'italic' }}> {titleAccent}</em>
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

export function GlassCard({
  children,
  className = '',
  padding = 'p-5 md:p-6',
  style,
}: {
  children: React.ReactNode;
  className?: string;
  padding?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`rounded-2xl border border-white/[0.06] ${padding} ${className}`}
      style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(12px)', ...style }}
    >
      {children}
    </div>
  );
}

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
        {title && (
          <h2
            className="text-lg md:text-xl font-extrabold text-white"
            style={{
              fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
              fontStyle: 'italic',
              fontWeight: 400,
            }}
          >
            {title}
          </h2>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
