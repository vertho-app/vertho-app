import { connection } from 'next/server';
import { headers } from 'next/headers';
import { resolveTenantFromHeaders } from '@/lib/tenant-resolver';
import { resolveTheme } from '@/lib/ui-resolver';
import DashboardShell from './dashboard-shell';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await connection();

  // Resolve o tema do tenant (white-label) server-side. Sem branding → fallbacks
  // são o tema Vertho atual, então não há mudança visual para quem não customiza.
  const h = await headers();
  const tenant = await resolveTenantFromHeaders(h);
  const theme = resolveTheme(tenant?.ui_config);

  return <DashboardShell theme={theme}>{children}</DashboardShell>;
}
