'use client';

// CONARH 52 — moldura fixa da demo: barra superior (hub em 1 toque + rótulo
// "caso demonstrativo" em TODA tela + novo visitante) e barra de ação
// inferior (botão principal sempre no mesmo lugar, canto inferior direito).

import { useEffect, useRef } from 'react';
import { ArrowLeft, ArrowRight, RotateCcw } from 'lucide-react';
import { COR, SERIF, SANS, TOQUE } from './tema';

export function BarraTopo({
  rotulo,
  onHub,
  onNovoVisitante,
  esconderNavegacao,
}: {
  rotulo: string;
  onHub: () => void;
  onNovoVisitante: () => void;
  /** modo visitante (QR): sem hub nem reset visíveis — fluxo linear. */
  esconderNavegacao?: boolean;
}) {
  return (
    <header
      className="fixed top-0 left-0 right-0 z-40 border-b"
      style={{
        background: 'rgba(6,23,44,0.92)',
        backdropFilter: 'blur(12px)',
        borderColor: COR.borda,
      }}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
        {esconderNavegacao ? (
          <span style={{ width: 120 }} />
        ) : (
          <button
            type="button"
            onClick={onHub}
            className="flex items-center gap-2 rounded-full border px-5"
            style={{
              minHeight: 52,
              background: COR.card,
              borderColor: COR.borda,
              color: COR.texto,
              fontSize: 17,
              fontWeight: 700,
              fontFamily: SANS,
              minWidth: 120,
            }}
          >
            <ArrowLeft size={20} />
            As 5 etapas
          </button>
        )}

        {/* Rótulo obrigatório — visível em toda tela de caso */}
        <span
          className="rounded-full px-4 py-2 uppercase font-bold"
          style={{
            background: 'rgba(52,197,204,0.12)',
            border: `1px solid ${COR.bordaAcento}`,
            color: COR.acento,
            fontSize: 13,
            letterSpacing: '0.22em',
            fontFamily: SANS,
            whiteSpace: 'nowrap',
          }}
        >
          {rotulo}
        </span>

        {esconderNavegacao ? (
          <span style={{ width: 120 }} />
        ) : (
          <button
            type="button"
            onClick={onNovoVisitante}
            className="flex items-center gap-2 rounded-full px-5"
            style={{
              minHeight: 52,
              background: 'transparent',
              color: COR.texto3,
              fontSize: 15,
              fontWeight: 600,
              fontFamily: SANS,
              minWidth: 120,
              justifyContent: 'flex-end',
            }}
          >
            <RotateCcw size={17} />
            Novo visitante
          </button>
        )}
      </div>
    </header>
  );
}

export interface AcaoBarra {
  rotulo: string;
  onClick: () => void;
  desabilitado?: boolean;
}

/** Barra inferior fixa — o "próximo" mora sempre aqui, em qualquer tela. */
export function BarraAcao({
  primaria,
  secundaria,
}: {
  primaria?: AcaoBarra;
  secundaria?: AcaoBarra;
}) {
  if (!primaria && !secundaria) return null;
  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 border-t"
      style={{
        background: 'rgba(6,23,44,0.94)',
        backdropFilter: 'blur(12px)',
        borderColor: COR.borda,
      }}
    >
      <div className="flex items-center justify-between gap-4 px-5 py-3.5">
        <div>
          {secundaria && (
            <button
              type="button"
              onClick={secundaria.onClick}
              disabled={secundaria.desabilitado}
              className="rounded-2xl border px-7"
              style={{
                minHeight: TOQUE,
                background: 'transparent',
                borderColor: COR.borda,
                color: COR.texto2,
                fontSize: 19,
                fontWeight: 700,
                fontFamily: SANS,
                opacity: secundaria.desabilitado ? 0.4 : 1,
              }}
            >
              {secundaria.rotulo}
            </button>
          )}
        </div>
        {primaria && (
          <button
            type="button"
            onClick={primaria.onClick}
            disabled={primaria.desabilitado}
            className="flex items-center gap-3 rounded-2xl px-9"
            style={{
              minHeight: TOQUE,
              background: `linear-gradient(135deg, ${COR.acento}, ${COR.acentoEscuro})`,
              color: COR.fundo0,
              fontSize: 21,
              fontWeight: 800,
              fontFamily: SANS,
              opacity: primaria.desabilitado ? 0.4 : 1,
              boxShadow: '0 8px 28px rgba(52,197,204,0.25)',
            }}
          >
            {primaria.rotulo}
            <ArrowRight size={24} strokeWidth={2.5} />
          </button>
        )}
      </div>
    </div>
  );
}

/** Dispara `aoAparecer` uma única vez quando o elemento entra na viewport. */
export function useAoAparecer(aoAparecer: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  const disparou = useRef(false);
  const cb = useRef(aoAparecer);
  cb.current = aoAparecer;
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(
      (entradas) => {
        if (disparou.current) return;
        if (entradas.some((e) => e.isIntersecting)) {
          disparou.current = true;
          cb.current();
        }
      },
      { threshold: 0.6 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return ref;
}

export function TituloPorta({
  numero,
  nome,
  sub,
}: {
  numero: number;
  nome: string;
  sub: string;
}) {
  return (
    <div className="mb-8">
      <p
        className="uppercase font-bold mb-2"
        style={{ color: COR.acento, fontSize: 14, letterSpacing: '0.24em', fontFamily: SANS }}
      >
        Etapa {numero} de 5
      </p>
      <h1
        style={{
          color: COR.texto,
          fontFamily: SERIF,
          fontSize: 'clamp(34px, 4.5vw, 48px)',
          lineHeight: 1.08,
          fontWeight: 600,
          letterSpacing: '-0.02em',
          margin: 0,
        }}
      >
        {nome}
      </h1>
      <p style={{ color: COR.texto2, fontSize: 21, marginTop: 10, fontFamily: SANS }}>{sub}</p>
    </div>
  );
}
