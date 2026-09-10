import { redirect } from 'next/navigation';
import { getRhEngagementCompany } from '@/lib/engajamento/rh-access';
import RhEngagementPanel from '@/components/engajamento/rh-panel';

export const dynamic = 'force-dynamic';

export default async function RhEngagementReportPage() {
  let company;
  try { company = await getRhEngagementCompany(); }
  catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('UNAUTHORIZED')) redirect('/login');
    if (message.includes('FORBIDDEN')) redirect('/dashboard');
    throw error;
  }
  return <RhEngagementPanel {...company} report />;
}
