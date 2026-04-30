import type { Metadata } from 'next';

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
  robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
};

export default function RadarBettLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="radarbett-shell">
      {children}
    </div>
  );
}
