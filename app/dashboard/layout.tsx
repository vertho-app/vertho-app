import { connection } from 'next/server';
import type { Metadata, Viewport } from 'next';
import DashboardShell from './dashboard-shell';
import PwaRegister from './pwa-register';
import IosInstallPrompt from './ios-install-prompt';

export const metadata: Metadata = {
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Vertho',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  themeColor: '#0F2B54',
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await connection();

  return (
    <>
      <PwaRegister />
      <IosInstallPrompt />
      <DashboardShell>{children}</DashboardShell>
    </>
  );
}
