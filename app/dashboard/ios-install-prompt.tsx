'use client';

import { useEffect, useState } from 'react';
import { X, Share, Plus } from 'lucide-react';

const STORAGE_KEY = 'vertho-ios-install-dismissed-at';
const COOLDOWN_DAYS = 14;

/**
 * Detecta iOS e mostra instruções customizadas pra instalar a PWA.
 * iOS não tem install prompt nativo — usuário precisa fazer manualmente
 * via Compartilhar → Adicionar à Tela de Início (funciona em Safari, Chrome
 * iOS, Firefox iOS, etc. porque todos usam o share sheet do sistema).
 *
 * - Standalone (já instalado): não mostra
 * - Dismiss persiste em localStorage por 14 dias
 */
export default function IosInstallPrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const ua = navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    if (!isIos) return;

    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true;
    if (isStandalone) return;

    try {
      const dismissed = localStorage.getItem(STORAGE_KEY);
      if (dismissed) {
        const age = Date.now() - new Date(dismissed).getTime();
        if (age < COOLDOWN_DAYS * 24 * 60 * 60 * 1000) return;
      }
    } catch {}

    const t = setTimeout(() => setShow(true), 3000);
    return () => clearTimeout(t);
  }, []);

  function dismiss() {
    try { localStorage.setItem(STORAGE_KEY, new Date().toISOString()); } catch {}
    setShow(false);
  }

  if (!show) return null;

  return (
    <div
      className="fixed bottom-4 left-4 right-4 z-50 max-w-md mx-auto rounded-2xl shadow-2xl border border-cyan-400/30 p-4"
      style={{
        background: 'linear-gradient(135deg, #0F2B54 0%, #1a3a6b 100%)',
        backdropFilter: 'blur(12px)',
      }}
      role="dialog"
      aria-label="Instalar Vertho na tela inicial"
    >
      <button
        onClick={dismiss}
        className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:text-white hover:bg-white/10"
        aria-label="Dispensar"
      >
        <X size={14} />
      </button>

      <p className="text-sm font-bold text-white mb-1">Adicione o Vertho à tela inicial</p>
      <p className="text-[11px] text-cyan-100/80 mb-3">
        Acesso rápido sem digitar o endereço — funciona como um app.
      </p>
      <ol className="space-y-2 text-[12px] text-white">
        <li className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-cyan-400/20 text-cyan-300 text-[10px] font-bold flex items-center justify-center shrink-0">1</span>
          <span className="flex items-center gap-1.5">
            Toque em <Share size={14} className="text-cyan-300 inline" /> <b>Compartilhar</b>
          </span>
        </li>
        <li className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-cyan-400/20 text-cyan-300 text-[10px] font-bold flex items-center justify-center shrink-0">2</span>
          <span className="flex items-center gap-1.5">
            Role e toque em <Plus size={14} className="text-cyan-300 inline" /> <b>Adicionar à Tela de Início</b>
          </span>
        </li>
        <li className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-cyan-400/20 text-cyan-300 text-[10px] font-bold flex items-center justify-center shrink-0">3</span>
          <span>Confirme em <b>Adicionar</b></span>
        </li>
      </ol>
    </div>
  );
}
