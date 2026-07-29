'use client';

// CONARH 52 — mídia local das personas (/conarh/media/*), play offline via
// <video>/<audio> HTML5. src null ou tipo texto → renderiza como texto.

import { COR, SANS } from './tema';

export function Pilula({
  tipo,
  src,
  titulo,
  duracao,
  texto,
}: {
  tipo: 'video' | 'audio' | 'texto';
  src: string | null;
  titulo: string;
  duracao?: string;
  texto?: string;
}) {
  return (
    <div
      className="rounded-2xl border p-4"
      style={{ background: COR.card, borderColor: COR.borda }}
    >
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <p style={{ color: COR.texto, fontSize: 18, fontWeight: 700, fontFamily: SANS }}>
          {titulo}
        </p>
        {duracao && (
          <span style={{ color: COR.texto3, fontSize: 14, flexShrink: 0 }}>{duracao}</span>
        )}
      </div>
      {src && tipo === 'video' && (
        <video
          controls
          preload="metadata"
          src={src}
          className="w-full rounded-xl"
          style={{ background: '#000', maxHeight: 320 }}
        />
      )}
      {src && tipo === 'audio' && (
        <audio controls preload="metadata" src={src} className="w-full" />
      )}
      {(!src || tipo === 'texto') && (
        <p
          style={{
            color: COR.texto2,
            fontSize: 17,
            lineHeight: 1.6,
            fontFamily: SANS,
            margin: 0,
          }}
        >
          {texto || titulo}
        </p>
      )}
    </div>
  );
}
