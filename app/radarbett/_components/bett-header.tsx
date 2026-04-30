'use client';

import Link from 'next/link';

/**
 * Header simples e institucional do radarbett.
 * Mantém "Radar Vertho" no logo (reuso visual). Sem tabs técnicas.
 * CTA "Agendar conversa" sempre visível no canto direito.
 */
export function BettHeader({ onAgendar }: { onAgendar?: () => void }) {
  return (
    <header
      className="sticky top-0 z-30 border-b border-white/[0.06]"
      style={{ background: 'rgba(6,23,44,0.85)', backdropFilter: 'blur(12px)' }}
    >
      <div className="max-w-[1200px] mx-auto px-6 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <img src="/logo-vertho.png" alt="Vertho" style={{ height: 22, opacity: 0.85 }} />
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/metodologia"
            className="hidden sm:inline-flex text-[12px] text-white/55 hover:text-white/85 px-3 py-1.5 transition-colors"
          >
            Metodologia
          </Link>
          {onAgendar && (
            <button
              onClick={onAgendar}
              className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-full text-[12px] sm:text-[13px] font-bold transition-all"
              style={{
                background: 'linear-gradient(135deg, #34c5cc, #2aa8ae)',
                color: '#06172C',
              }}
            >
              Agendar conversa
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
