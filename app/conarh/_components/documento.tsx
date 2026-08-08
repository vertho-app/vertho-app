'use client';

// CONARH 52 — abre um documento DENTRO da demo.
//
// 🔴 POR QUE não é um link (07/08/2026): os cards abriam o PDF com
// `target="_blank"`. Num PWA instalado no iOS isso sai para uma view SEM barra
// de navegação — medido no iPhone: o documento abre e **não há como voltar**
// para a demo. Fechar o app no multitarefa era a única saída, na frente do
// visitante. E, como é outro contexto de armazenamento, em modo avião essa view
// nem enxerga o cache do service worker.
//
// Aqui o documento é folheado como imagem das páginas (pré-renderizadas por
// `scripts/_conarh-paginas-pdf.ts`), num overlay com um botão FECHAR grande.
// Página como <img> em vez de canvas do pdf.js: o Safari decodifica sob demanda
// e libera sozinho — 10 canvas A4 em DPR 2 são ~180 MB e derrubam a aba do
// iPhone. E o nome do arquivo é estável, então entra no PRECACHE do worker
// (chunk de JS tem hash e só entraria no cache de runtime).

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import PAGINAS from '../_data/paginas-pdf.json';
import { COR, SANS, TOQUE } from './tema';

const MAPA = PAGINAS as Record<string, string[]>;

export function paginasDoDocumento(src: string): string[] {
  return MAPA[src] ?? [];
}

export function AbrirDocumento({
  src,
  titulo,
  className,
  style,
  children,
}: {
  src: string;
  titulo: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setAberto(true)} className={className} style={style}>
        {children}
      </button>
      {aberto && <Visualizador src={src} titulo={titulo} aoFechar={() => setAberto(false)} />}
    </>
  );
}

function Visualizador({
  src,
  titulo,
  aoFechar,
}: {
  src: string;
  titulo: string;
  aoFechar: () => void;
}) {
  const [montado, setMontado] = useState(false);
  const paginas = paginasDoDocumento(src);

  useEffect(() => setMontado(true), []);

  useEffect(() => {
    // Trava o scroll do fundo: sem isso, o iOS rola a demo por baixo do overlay
    // e o expositor volta com a tela em outro ponto.
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => {
      document.body.style.overflow = anterior;
      window.removeEventListener('keydown', aoTeclar);
    };
  }, [aoFechar]);

  if (!montado) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      className="fixed inset-0 flex flex-col"
      style={{ background: COR.fundo0, zIndex: 9999 }}
    >
      <header
        className="flex items-center justify-between gap-4 px-5 flex-shrink-0"
        style={{
          borderBottom: `1px solid ${COR.borda}`,
          background: COR.fundo1,
          // O web app roda com a barra de status translúcida: sem o inset o
          // título fica embaixo do relógio do iPhone.
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)',
          paddingBottom: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <p
            className="truncate"
            style={{ color: COR.texto, fontSize: 19, fontWeight: 700, fontFamily: SANS, margin: 0 }}
          >
            {titulo}
          </p>
          {paginas.length > 0 && (
            <p style={{ color: COR.texto3, fontSize: 14, fontFamily: SANS, margin: 0 }}>
              {paginas.length} páginas
            </p>
          )}
        </div>
        {/* Botão com a PALAVRA, não só o X: o expositor precisa achar a saída
            sem procurar, e um ícone sozinho some numa tela cheia de documento. */}
        <button
          type="button"
          onClick={aoFechar}
          className="inline-flex items-center gap-2 rounded-2xl px-6 font-bold flex-shrink-0"
          style={{
            minHeight: TOQUE - 12,
            background: 'rgba(52,197,204,0.14)',
            border: `1px solid ${COR.bordaAcento}`,
            color: COR.acento,
            fontSize: 18,
            fontFamily: SANS,
          }}
        >
          <X size={20} />
          Fechar
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-5" style={{ WebkitOverflowScrolling: 'touch' }}>
        {paginas.length === 0 ? (
          // Não deve acontecer — o guard de CI amarra tela e manifesto. Se
          // acontecer, falha VISÍVEL e com saída, nunca tela branca.
          <p
            className="mx-auto text-center"
            style={{ color: COR.texto2, fontSize: 18, fontFamily: SANS, maxWidth: 560, paddingTop: 40 }}
          >
            Este documento ainda não foi preparado para leitura offline. Rode
            <code style={{ color: COR.acento }}> npx tsx scripts/_conarh-paginas-pdf.ts</code>.
          </p>
        ) : (
          <div className="mx-auto flex flex-col gap-4" style={{ maxWidth: 980 }}>
            {paginas.map((pagina, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={pagina}
                src={pagina}
                alt={`${titulo} — página ${i + 1}`}
                // A primeira é `eager`: em modo avião ela vem do cache, e o
                // documento tem que aparecer no toque, não depois do scroll.
                loading={i === 0 ? 'eager' : 'lazy'}
                decoding="async"
                style={{
                  width: '100%',
                  height: 'auto',
                  borderRadius: 10,
                  border: `1px solid ${COR.borda}`,
                  background: '#fff',
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
