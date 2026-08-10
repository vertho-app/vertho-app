import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { checarAcessoPlataforma } from '@/lib/authz-plataforma';

export const metadata: Metadata = {
  title: {
    default: 'Radar Vertho — Bett 2026',
    template: '%s · Radar Vertho',
  },
  description:
    'Sua escola ou rede já sabe onde precisa agir primeiro? O Radar Vertho cruza dados públicos de aprendizagem e contexto escolar para gerar uma primeira leitura de oportunidades.',
  metadataBase: new URL('https://radarbett.vertho.ai'),
  applicationName: 'Radar Vertho',
  authors: [{ name: 'Vertho Mentor IA', url: 'https://vertho.ai' }],
  keywords: [
    'saeb', 'ideb', 'inep', 'educação básica', 'diagnóstico escolar',
    'gestão escolar', 'desenvolvimento de gestores', 'mentoria educacional',
    'vertho', 'bett 2026',
  ],
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: 'Radar Vertho',
    url: 'https://radarbett.vertho.ai',
    images: [
      { url: '/logo-vertho.png', width: 1200, height: 630, alt: 'Radar Vertho — Vertho Mentor IA' },
    ],
  },
  twitter: { card: 'summary_large_image', site: '@vertho_ai' },
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export const dynamic = 'force-dynamic';

/**
 * O `radarbett` foi descontinuado em 25/05/2026 (301 no subdomínio), mas as
 * páginas seguiam alcançáveis por `app.vertho.ai/radarbett/*` — o 301 é por
 * HOST. Elas consomem as mesmas actions do Radar, que ficaram internas em
 * 10/08/2026; sem este gate, a superfície pública continuaria de pé pela porta
 * dos fundos e as telas quebrariam na primeira busca.
 */
export default async function RadarBettLayout({ children }: { children: React.ReactNode }) {
  const acesso = await checarAcessoPlataforma();
  if (acesso.reason === 'unauthenticated') redirect('/login?redirect=/radarbett');
  if (!acesso.authorized) notFound();

  return (
    <div className="radarbett-shell">
      {children}
    </div>
  );
}
