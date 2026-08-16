'use client';

import { useState } from 'react';

/** O único pedaço interativo da tela de despacho. */
export default function CopiarLink({ link }: { link: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Clipboard bloqueado no WebView acontece. O endereço está na tela acima,
      // então o caminho manual continua existindo — não vale quebrar nada aqui.
      setCopiado(false);
    }
  }

  return (
    <button
      type="button"
      onClick={copiar}
      className="mt-3 w-full rounded-lg bg-cyan-300 px-4 py-3 text-[14px] font-semibold text-slate-950"
    >
      {copiado ? 'Copiado ✓' : 'Copiar link'}
    </button>
  );
}
