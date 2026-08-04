'use client';

// CONARH 52 — Hub: as 5 portas, nomes e ordem EXATOS do JSON (mesma ordem
// da lona, do folder e da fala). O expositor toca a porta que o visitante
// apontou — abre na hora, sem login, sem loading.

import type { ConteudoConarh } from '../_data/types';
import type { NumeroPorta } from './sessao';
import { COR, SERIF, SANS, TOQUE } from './tema';
import { ArrowRight } from 'lucide-react';

export function Hub({
  conteudo,
  rotasConcluidas,
  onAbrir,
}: {
  conteudo: ConteudoConarh;
  rotasConcluidas: number[];
  onAbrir: (porta: NumeroPorta) => void;
}) {
  return (
    <div>
      {/* Assinatura da marca: logo centralizado, sem eyebrow — a pergunta é o gancho. */}
      <img
        src="/logo-vertho.png"
        alt="Vertho"
        className="mx-auto block"
        style={{ height: 34, opacity: 0.95, marginBottom: 28 }}
      />
      <h1
        style={{
          color: COR.texto,
          fontFamily: SERIF,
          fontSize: 'clamp(36px, 5vw, 56px)',
          lineHeight: 1.06,
          fontWeight: 600,
          letterSpacing: '-0.02em',
          margin: 0,
          maxWidth: 1000,
        }}
      >
        Onde seu processo de desenvolvimento{' '}
        <em style={{ color: COR.acento }}>mais perde força?</em>
      </h1>

      <div className="mt-10 space-y-4">
        {conteudo.portas.map((porta) => {
          const concluida = rotasConcluidas.includes(porta.numero);
          return (
            <button
              key={porta.numero}
              type="button"
              onClick={() => onAbrir(porta.numero as NumeroPorta)}
              className="w-full text-left rounded-3xl border p-6 flex items-center gap-6 transition-transform"
              style={{
                minHeight: TOQUE + 24,
                background: COR.card,
                borderColor: concluida ? COR.bordaAcento : COR.borda,
                fontFamily: SANS,
              }}
            >
              <span
                className="flex items-center justify-center rounded-2xl flex-shrink-0 font-bold"
                style={{
                  width: 68,
                  height: 68,
                  background: 'rgba(52,197,204,0.12)',
                  border: `1px solid ${COR.bordaAcento}`,
                  color: COR.acento,
                  fontSize: 30,
                  fontFamily: SERIF,
                }}
              >
                {porta.numero}
              </span>
              <span className="flex-1 min-w-0">
                <span className="flex items-center gap-3 flex-wrap">
                  <span style={{ color: COR.texto, fontSize: 25, fontWeight: 700 }}>
                    {porta.nome}
                  </span>
                  {concluida && (
                    <span
                      className="rounded-full px-3 py-1 uppercase font-bold"
                      style={{
                        background: 'rgba(52,197,204,0.10)',
                        color: COR.acento,
                        fontSize: 12,
                        letterSpacing: '0.16em',
                      }}
                    >
                      vista
                    </span>
                  )}
                </span>
                <span className="block" style={{ color: COR.texto2, fontSize: 18, marginTop: 4 }}>
                  {porta.sub}
                </span>
              </span>
              <ArrowRight size={30} style={{ color: COR.acento, flexShrink: 0 }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
