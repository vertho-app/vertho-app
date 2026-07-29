// CONARH 52 — entrada da demo. Tudo renderizado sai do pacote offline
// (_data/conteudo.json): zero fetch de conteúdo, funciona em modo avião.
// ?modo=visitante → versão auto-guiada de 3 min (QR no celular do visitante).

import type { Metadata } from 'next';
import conteudoJson from './_data/conteudo.json';
import type { ConteudoConarh } from './_data/types';
import { ConarhApp } from './_components/conarh-app';

export const metadata: Metadata = {
  title: 'CONARH 52 — Vertho',
  description: 'Demonstração ao vivo: cinco etapas para desenvolver com evidência.',
  robots: { index: false, follow: false },
};

const conteudo = conteudoJson as unknown as ConteudoConarh;

export default async function ConarhPage({
  searchParams,
}: {
  searchParams: Promise<{ modo?: string }>;
}) {
  const { modo } = await searchParams;
  return <ConarhApp conteudo={conteudo} modoVisitante={modo === 'visitante'} />;
}
