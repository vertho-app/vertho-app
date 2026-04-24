'use client';

import { useEffect } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';

export default function Fase2Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[Fase2 Error]', error);
  }, [error]);

  return (
    <div className="max-w-[600px] mx-auto px-4 py-12 text-center">
      <h2 className="text-xl font-bold text-white mb-3">Erro ao carregar Fase 2</h2>
      <p className="text-sm text-gray-400 mb-2">{error?.message || 'Erro desconhecido'}</p>
      {error?.digest && <p className="text-xs text-gray-600 mb-4">Digest: {error.digest}</p>}
      <div className="flex gap-3 justify-center">
        <button onClick={() => window.history.back()}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm text-gray-300 border border-white/10 hover:bg-white/5">
          <ArrowLeft size={14} /> Voltar
        </button>
        <button onClick={reset}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold text-[#0C1829] bg-cyan-400 hover:brightness-110">
          <RefreshCw size={14} /> Tentar novamente
        </button>
      </div>
    </div>
  );
}
