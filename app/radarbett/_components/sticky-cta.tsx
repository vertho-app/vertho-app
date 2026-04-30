'use client';

import { useEffect, useState } from 'react';
import { Search, Lock } from 'lucide-react';
import { track } from '../_lib/tracking';

/**
 * Sticky CTA mobile — aparece após o usuário sair do hero.
 * - Antes da busca: "Buscar minha escola"
 * - Depois da busca: "Liberar diagnóstico"
 *
 * Apenas mobile. No desktop, o header já tem CTA "Agendar conversa".
 */
export function StickyCTAMobile({
  unlocked,
  onBuscar,
  onLiberar,
}: {
  unlocked?: boolean;
  onBuscar: () => void;
  onLiberar?: () => void;
}) {
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    function onScroll() {
      // Aparece depois de scroll de ~320px (saiu da dobra do hero)
      setVisivel(window.scrollY > 320);
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!visivel) return null;

  function handleClick() {
    track('bett_sticky_click');
    if (unlocked && onLiberar) onLiberar();
    else onBuscar();
  }

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2 md:hidden pointer-events-none"
      style={{ background: 'linear-gradient(to top, #06172C 60%, rgba(6,23,44,0))' }}
    >
      <button
        type="button"
        onClick={handleClick}
        className="w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-full text-sm font-bold transition-all pointer-events-auto"
        style={{
          background: 'linear-gradient(135deg, #34c5cc, #2aa8ae)',
          color: '#06172C',
          boxShadow: '0 12px 32px rgba(52,197,204,0.35)',
        }}
      >
        {unlocked ? (
          <>
            <Lock size={14} /> Liberar diagnóstico
          </>
        ) : (
          <>
            <Search size={14} /> Buscar minha escola
          </>
        )}
      </button>
    </div>
  );
}
