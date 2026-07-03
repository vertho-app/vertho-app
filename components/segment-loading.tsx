import { Loader2 } from 'lucide-react';

/** Estado de carregamento reutilizável (Suspense do App Router). Evita a tela
 *  branca enquanto o segmento server-rendered resolve. */
export default function SegmentLoading() {
  return (
    <div className="flex items-center justify-center h-[60dvh]" role="status" aria-live="polite" aria-busy="true">
      <Loader2 size={32} className="animate-spin text-cyan-400" aria-hidden="true" />
      <span className="sr-only">Carregando…</span>
    </div>
  );
}
