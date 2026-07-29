import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'CONARH 52 — Vertho',
};

export const viewport: Viewport = {
  themeColor: '#06172C',
  width: 'device-width',
  initialScale: 1,
};

// Layout intencionalmente mínimo: cada sub-rota (/conarh, /fila, /painel,
// /prancheta) monta a própria moldura — a demo conduzida, as telas da
// equipe e a página de impressão têm necessidades opostas.
export default function ConarhLayout({ children }: { children: React.ReactNode }) {
  return children;
}
