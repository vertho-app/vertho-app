import { redirect } from 'next/navigation';
import { requireRoleAction } from '@/lib/auth/action-context';
import { carregarCentralRelatoriosRH } from '@/lib/relatorios/rh-center';
import RelatoriosRhView from './relatorios-rh-view';

export const dynamic = 'force-dynamic';

export default async function RelatoriosRhPage() {
  let auth: Awaited<ReturnType<typeof requireRoleAction>>;
  try {
    auth = await requireRoleAction(['rh']);
  } catch (error: any) {
    if (String(error?.message || '').includes('UNAUTHORIZED')) redirect('/login');
    redirect('/dashboard');
  }

  if (!auth.empresaId) redirect('/dashboard');

  const reports = await carregarCentralRelatoriosRH(auth.empresaId);
  return <RelatoriosRhView reports={reports} />;
}
