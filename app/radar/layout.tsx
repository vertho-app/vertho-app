import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: {
    default: 'Radar Vertho — Diagnóstico público de educação',
    template: '%s · Radar Vertho',
  },
  description:
    'Indicadores oficiais de Saeb, Ideb e ICA por escola e município. Diagnóstico público gratuito da educação básica brasileira.',
  metadataBase: new URL('https://radar.vertho.ai'),
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: 'Radar Vertho',
  },
  twitter: { card: 'summary_large_image' },
  robots: { index: true, follow: true },
};

export default function RadarLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="radar-shell">
      {children}
    </div>
  );
}
