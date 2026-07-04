import { connection } from 'next/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { resolveTenantFromHeaders } from '@/lib/tenant-resolver';
import { resolveTheme } from '@/lib/ui-resolver';
import { getRepresentativeContext } from '@/lib/sales/permissions';
import { isPlatformAdmin } from '@/lib/authz';
import DashboardShell from './dashboard-shell';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await connection();

  // Representantes comerciais (RCs) não são colaboradores de tenant — o /dashboard
  // (área do colaborador) não tem contexto para eles. Se um RC ativo cair aqui
  // (login, bookmark ou link direto), leva ao portal comercial dele. Exceção:
  // quem é RC E platform admin (ex.: o dono testando) segue no dashboard/admin e
  // acessa /representante por URL quando quiser.
  const rep = await getRepresentativeContext();
  if (rep?.rep.status === 'active' && !(await isPlatformAdmin(rep.email))) {
    redirect('/representante');
  }

  // Resolve o tema do tenant (white-label) server-side. Sem branding → fallbacks
  // são o tema Vertho atual, então não há mudança visual para quem não customiza.
  const h = await headers();
  const tenant = await resolveTenantFromHeaders(h);
  const theme = resolveTheme(tenant?.ui_config);

  return <DashboardShell theme={theme}>{children}</DashboardShell>;
}
