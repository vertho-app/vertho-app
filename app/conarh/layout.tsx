import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';

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

/**
 * ⛔ 31/08/2026 — bloco OFF-LINE (`lib/blocos-offline.ts`).
 *
 * O CONARH 52 é sazonal e terminou em 17/08. O layout era mínimo de propósito
 * (cada sub-rota montava a própria moldura), e é justamente por ser o ponto que
 * as 5 rotas atravessam que ele serve agora de interruptor único.
 *
 * ⚠️ Um 404 aqui NÃO desinstala o service worker já registrado. `conarh-sw.js`
 * (escopo `/conarh`) foi instalado nos iPads do estande para a demo abrir em
 * modo avião, e um SW com handler de `fetch` responde do cache antes de a rede
 * ser consultada — o tablet que ainda o tiver continua abrindo a demo antiga
 * até alguém limpar os dados do site. Isso é aceitável porque os aparelhos
 * saíram de circulação com a feira; se algum voltar a ser usado, limpar o site
 * nas configurações do Safari resolve.
 *
 * O `RegistrarSW` sai daqui para não instalar o worker em ninguém novo.
 */
export default function ConarhLayout() {
  notFound();
}
