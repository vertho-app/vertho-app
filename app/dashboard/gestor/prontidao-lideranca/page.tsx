/** Prontidão para Liderança — RH self-service (escopo = empresa da sessão). Molde: ../ranking/page.tsx */
import { redirect } from 'next/navigation';
import { PageContainer } from '@/components/page-shell';
import ProntidaoLiderancaView from '@/components/prontidao-lideranca-view';
import { requireRoleAction } from '@/lib/auth/action-context';
import { getProntidaoLideranca, getParecerLideranca } from '@/actions/prontidao-lideranca';

export const dynamic = 'force-dynamic';

export default async function ProntidaoLiderancaPage() {
  try {
    await requireRoleAction(['rh']);
  } catch (error: any) {
    if (String(error?.message || '').includes('UNAUTHORIZED')) redirect('/login');
    redirect('/dashboard');
  }

  return (
    <PageContainer>
      <ProntidaoLiderancaView scopeKey="rh-session" carregar={getProntidaoLideranca} parecer={getParecerLideranca} />
    </PageContainer>
  );
}
