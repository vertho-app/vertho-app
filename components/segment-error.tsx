'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeft, RefreshCw, AlertTriangle } from 'lucide-react';

/**
 * Boundary de erro reutilizável para segmentos (dashboard/admin/root). Isola um
 * erro de runtime na parte afetada — sem isto, o erro derruba o layout inteiro
 * (tela branca). Cada `error.tsx` de segmento é um wrapper fino sobre isto.
 * `role="alert"` para leitores de tela.
 */
export default function SegmentError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('SegmentError');

  useEffect(() => {
    console.error('[SegmentError]', error);
  }, [error]);

  return (
    <div role="alert" className="max-w-[600px] mx-auto px-4 py-12 text-center">
      <AlertTriangle size={28} className="text-amber-400 mx-auto mb-3" aria-hidden="true" />
      <h2 className="text-xl font-bold text-white mb-3">{t('title')}</h2>
      <p className="text-sm text-gray-400 mb-2">{error?.message || t('unknown')}</p>
      {error?.digest && <p className="text-xs text-gray-600 mb-4">Digest: {error.digest}</p>}
      <div className="flex gap-3 justify-center mt-4">
        <button onClick={() => window.history.back()}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm text-gray-300 border border-white/10 hover:bg-white/5">
          <ArrowLeft size={14} aria-hidden="true" /> {t('back')}
        </button>
        <button onClick={reset}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold text-[#0C1829] bg-cyan-400 hover:brightness-110">
          <RefreshCw size={14} aria-hidden="true" /> {t('retry')}
        </button>
      </div>
    </div>
  );
}
