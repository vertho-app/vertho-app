import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: {
    default: 'Radar Vertho — Diagnóstico público de educação',
    template: '%s · Radar Vertho',
  },
  description:
    'Indicadores oficiais de Saeb, Ideb e ICA por escola e município. Diagnóstico público gratuito da educação básica brasileira.',
  metadataBase: new URL('https://radar.vertho.ai'),
  applicationName: 'Radar Vertho',
  authors: [{ name: 'Vertho Mentor IA', url: 'https://vertho.ai' }],
  keywords: [
    'saeb', 'ideb', 'ica', 'inep', 'educação básica', 'diagnóstico escolar',
    'indicadores educacionais', 'radar vertho', 'escola pública',
  ],
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: 'Radar Vertho',
    url: 'https://radar.vertho.ai',
    images: [
      { url: '/logo-vertho.png', width: 1200, height: 630, alt: 'Radar Vertho — Vertho Mentor IA' },
    ],
  },
  twitter: { card: 'summary_large_image', site: '@vertho_ai' },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
};

export default function RadarLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="radar-shell">
      {children}
    </div>
  );
}
