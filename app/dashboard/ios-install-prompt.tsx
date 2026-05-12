'use client';

import { useEffect, useState } from 'react';
import { X, Share, Plus } from 'lucide-react';

const STORAGE_KEY = 'vertho-ios-install-dismissed-at';
const COOLDOWN_DAYS = 14; // não repete o prompt por 14 dias após dismiss

/**
 * Detecta iOS e mostra instruções customizadas pra instalar a PWA.
 * iOS não tem install prompt nativo — usuário precisa fazer manualmente
 * via Compartilhar → Adicionar à Tela de Início.
 *
 * - iOS Safari: mostra como adicionar (botão Compartilhar)
 * - iOS Chrome/Firefox/etc: pede pra abrir no Safari (outros browsers no iOS
 *   não conseguem instalar PWA por limitação da Apple)
 * - Standalone (já instalado): não mostra
 * - Dismiss persiste em localStorage por 14 dias
 */
export default function IosInstallPrompt() {
  const [variant, setVariant] = useState<'safari' | 'other-ios' | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const ua = navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    if (!isIos) return;

    // Já instalado (standalone)?
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true;
    if (isStandalone) return;

    // Dismissed recentemente?
    try {
      const dismissed = localStorage.getItem(STORAGE_KEY);
      if (dismissed) {
        const age = Date.now() - new Date(dismissed).getTime();
        if (age < COOLDOWN_DAYS * 24 * 60 * 60 * 1000) return;
      }
    } catch {
      // localStorage bloqueado (private mode) — segue normal
    }

    // Detecta browser específico no iOS
    const isChromeIos = /CriOS/.test(ua);
    const isFirefoxIos = /FxiOS/.test(ua);
    const isEdgeIos = /EdgiOS/.test(ua);
    const isOperaIos = /OPiOS/.test(ua);
    const isSafariIos = !isChromeIos && !isFirefoxIos && !isEdgeIos && !isOperaIos;

    // Atrasa um pouco pra não ser intrusivo na 1ª impressão
    const t = setTimeout(() => {
      setVariant(isSafariIos ? 'safari' : 'other-ios');
    }, 3000);

    return () => clearTimeout(t);
  }, []);

  function dismiss() {
    try { localStorage.setItem(STORAGE_KEY, new Date().toISOString()); } catch {}
    setVariant(null);
  }

  if (!variant) return null;

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

      {variant === 'safari' ? <SafariSteps /> : <OtherIosSteps />}
    </div>
  );
}

function SafariSteps() {
  return (
    <>
      <p className="text-sm font-bold text-white mb-1">Adicione o Vertho à tela inicial</p>
      <p className="text-[11px] text-cyan-100/80 mb-3">
        Acesso rápido sem digitar o endereço — funciona como um app.
      </p>
      <ol className="space-y-2 text-[12px] text-white">
        <li className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-cyan-400/20 text-cyan-300 text-[10px] font-bold flex items-center justify-center shrink-0">1</span>
          <span className="flex items-center gap-1.5">
            Toque em <Share size={14} className="text-cyan-300 inline" /> <b>Compartilhar</b> na barra inferior
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
    </>
  );
}

function OtherIosSteps() {
  return (
    <>
      <p className="text-sm font-bold text-white mb-1">Pra instalar, abra no Safari</p>
      <p className="text-[11px] text-cyan-100/80 mb-3">
        No iOS, só o Safari permite instalar apps web (regra da Apple).
      </p>
      <ol className="space-y-2 text-[12px] text-white">
        <li className="flex items-start gap-2">
          <span className="w-5 h-5 rounded-full bg-cyan-400/20 text-cyan-300 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
          <span>Copie esta URL e abra no <b>Safari</b></span>
        </li>
        <li className="flex items-start gap-2">
          <span className="w-5 h-5 rounded-full bg-cyan-400/20 text-cyan-300 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
          <span>Toque em Compartilhar → <b>Adicionar à Tela de Início</b></span>
        </li>
      </ol>
    </>
  );
}
