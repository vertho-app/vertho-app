import type { Metadata, Viewport } from 'next';
import { RegistrarSW } from './_components/registrar-sw';

export const metadata: Metadata = {
  title: 'CONARH 52 — Vertho',
  manifest: '/conarh.webmanifest',
  appleWebApp: {
    capable: true,          // "Adicionar à Tela de Início" abre em tela cheia
    statusBarStyle: 'black-translucent',
    title: 'Vertho CONARH',
  },
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
  return (
    <>
      {/* O SW é o que faz a demo abrir em MODO AVIÃO no iPad — sem ele, o
          conteúdo é local mas a PÁGINA ainda precisa da rede para carregar. */}
      <RegistrarSW />
      {children}
    </>
  );
}
