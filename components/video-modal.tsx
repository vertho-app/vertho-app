'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { BunnyVideoPlayer } from '@/components/bunny-video-player';

/**
 * Modal que abre um vídeo hospedado no Bunny Stream dentro de um iframe.
 *
 * Tracking de play/ended:
 * O iframe do Bunny (Plyr) não emite postMessage por padrão. Usamos a
 * biblioteca player.js (protocolo oficial de embeds) carregada via CDN
 * pra conversar com o iframe e escutar os eventos. Quando `colaboradorId`
 * é passado, cada play_started/play_finished gera 1 row em videos_watched.
 */
interface VideoModalProps {
  libraryId: string | number;
  videoId: string;
  title?: string;
  onClose?: () => void;
  colaboradorId?: string | null;
}

export default function VideoModal({ libraryId, videoId, title, onClose, colaboradorId }: VideoModalProps) {
  // Fecha com ESC e trava scroll do body enquanto aberto
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose?.(); }
    window.addEventListener('keydown', onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 md:p-8"
      style={{ background: 'rgba(0, 0, 0, 0.85)', backdropFilter: 'blur(8px)' }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Vídeo'}
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-[1100px] rounded-2xl overflow-hidden border border-white/10"
        style={{ background: '#0A1D35', boxShadow: '0 0 60px rgba(0,180,216,0.15)' }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
          <p className="text-sm font-semibold text-white truncate">{title || 'Vídeo'}</p>
          <button onClick={onClose} aria-label="Fechar"
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Fechar (Esc)">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="relative w-full" style={{ paddingTop: '56.25%' }}>
          <BunnyVideoPlayer
            libraryId={libraryId}
            videoId={videoId}
            title={title}
            colaboradorId={colaboradorId}
            autoplay
          />
        </div>
      </div>
    </div>
  );
}
