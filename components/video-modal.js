'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';

/**
 * Modal que abre um vídeo hospedado no Bunny Stream dentro de um iframe.
 * Fecha com ESC, clique no overlay ou no botão X.
 *
 * Props:
 * - libraryId (string|number): ID da library do Bunny Stream
 * - videoId (string): GUID do vídeo
 * - title (string, opcional): título exibido no topo
 * - onClose (fn): chamado para fechar o modal
 */
export default function VideoModal({ libraryId, videoId, title, onClose }) {
  // Fecha com ESC e trava scroll do body enquanto aberto
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose?.(); }
    window.addEventListener('keydown', onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  const src = `https://iframe.mediadelivery.net/embed/${libraryId}/${videoId}?autoplay=true&loop=false&muted=false&preload=true&responsive=true`;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 md:p-8"
      style={{ background: 'rgba(0, 0, 0, 0.85)', backdropFilter: 'blur(8px)' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-[1100px] rounded-2xl overflow-hidden border border-white/10"
        style={{ background: '#0A1D35', boxShadow: '0 0 60px rgba(0,180,216,0.15)' }}
      >
        {(title || true) && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
            <p className="text-sm font-semibold text-white truncate">{title || 'Vídeo'}</p>
            <button onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              title="Fechar (Esc)">
              <X size={18} />
            </button>
          </div>
        )}
        <div className="relative w-full" style={{ paddingTop: '56.25%' }}>
          <iframe
            src={src}
            loading="lazy"
            allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 w-full h-full border-0"
            title={title || 'Vídeo'}
          />
        </div>
      </div>
    </div>
  );
}
