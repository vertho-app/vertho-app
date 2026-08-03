'use client';

// CONARH 52 — o registro da conversa em 3 momentos, não em uma página.
//
// Medido em 03/08: o registro integral tem 228 palavras e era LEITURA
// OBRIGATÓRIA antes da nota instintiva — o pedágio ficava logo na entrada da
// porta mais importante da demo. Aqui entram ~70 palavras nos três momentos
// que sustentam a avaliação (abertura factual, a resposta do Diego, o
// combinado do fecho); o registro inteiro continua a um toque, porque o
// visitante que quer conferir a evidência precisa poder conferir.

import { useState } from 'react';
import { COR, SANS, SERIF } from './tema';

export function RegistroRecorte({
  trechos,
  completo,
}: {
  trechos: Array<{ momento: string; texto: string }>;
  completo: string;
}) {
  const [verTudo, setVerTudo] = useState(false);

  return (
    <div>
      <div className="space-y-3">
        {trechos.map((t) => (
          <blockquote
            key={t.momento}
            className="rounded-3xl border p-6"
            style={{
              background: COR.card,
              borderColor: COR.borda,
              borderLeft: `5px solid ${COR.acento}`,
              margin: 0,
            }}
          >
            <p
              className="uppercase font-bold"
              style={{
                color: COR.texto3,
                fontSize: 13,
                letterSpacing: '0.2em',
                fontFamily: SANS,
                margin: 0,
              }}
            >
              {t.momento}
            </p>
            <p
              style={{
                color: COR.texto,
                fontFamily: SERIF,
                fontSize: 'clamp(20px, 2.4vw, 26px)',
                lineHeight: 1.45,
                margin: '8px 0 0',
              }}
            >
              {t.texto}
            </p>
          </blockquote>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setVerTudo(!verTudo)}
        style={{
          color: COR.acento,
          fontSize: 17,
          fontWeight: 700,
          fontFamily: SANS,
          background: 'none',
          border: 'none',
          padding: 0,
          marginTop: 14,
        }}
      >
        {verTudo ? 'Esconder a conversa inteira ↑' : 'Ver a conversa inteira ↓'}
      </button>
      {verTudo && (
        <blockquote
          className="rounded-2xl border p-5 mt-3"
          style={{ background: COR.card, borderColor: COR.borda, margin: 0, marginTop: 12 }}
        >
          <p
            style={{
              color: COR.texto2,
              fontSize: 17,
              lineHeight: 1.55,
              fontFamily: SANS,
              margin: 0,
              whiteSpace: 'pre-line',
            }}
          >
            {completo}
          </p>
        </blockquote>
      )}
    </div>
  );
}
