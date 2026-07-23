'use client';

import { useEffect, useState } from 'react';
import { Play } from 'lucide-react';
import VideoModal from '@/components/video-modal';

const BUNNY_LIBRARY = 636615;

/**
 * Card de vídeo de "primeira vez": ao abrir a seção pela 1ª vez, o modal abre
 * automaticamente (uma vez, marcado em localStorage por colaborador+seção).
 * O botão continua disponível para re-assistir. Tracking via colaboradorId.
 */
export default function FirstViewVideo({ videoId, title, label, sectionKey, colabId }: {
  videoId: string;
  title: string;
  label: string;
  sectionKey: string;
  colabId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const storageKey = colabId ? `vertho:video-visto:${sectionKey}:${colabId}` : null;

  useEffect(() => {
    if (!storageKey) return;
    try { if (!localStorage.getItem(storageKey)) setOpen(true); } catch { /* localStorage indisponível */ }
  }, [storageKey]);

  function close() {
    setOpen(false);
    try { if (storageKey) localStorage.setItem(storageKey, '1'); } catch { /* ignore */ }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2.5 w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-bold text-brand-400 border border-brand-400/25 hover:bg-brand-400/10 transition"
        style={{ background: 'rgba(0,180,216,0.06)' }}
      >
        <span className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(0,180,216,0.18)' }}>
          <Play size={12} className="text-brand-400 ml-0.5" fill="currentColor" aria-hidden="true" />
        </span>
        {label}
      </button>
      {open && (
        <VideoModal libraryId={BUNNY_LIBRARY} videoId={videoId} title={title} colaboradorId={colabId || null} onClose={close} />
      )}
    </>
  );
}
