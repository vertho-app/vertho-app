'use client';

import { Printer } from 'lucide-react';

export function BotaoImprimir() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="noprint"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        padding: '14px 28px',
        borderRadius: 14,
        border: 'none',
        background: '#0A1F3A',
        color: '#fff',
        fontSize: 17,
        fontWeight: 700,
        cursor: 'pointer',
      }}
    >
      <Printer size={19} />
      Imprimir a prancheta
    </button>
  );
}
