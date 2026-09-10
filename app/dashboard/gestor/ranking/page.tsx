/** Ranking de Adequação — RH self-service (escopo = empresa da sessão). */
import { redirect } from 'next/navigation';
import { PageContainer } from '@/components/page-shell';
import RankingTabs from './ranking-tabs';
import { requireRoleAction } from '@/lib/auth/action-context';

export const dynamic = 'force-dynamic';

export default async function RankingPage() {
  try {
    await requireRoleAction(['rh']);
  } catch (error: any) {
    if (String(error?.message || '').includes('UNAUTHORIZED')) redirect('/login');
    redirect('/dashboard');
  }

  return (
    <PageContainer>
      <RankingTabs />
    </PageContainer>
  );
}
