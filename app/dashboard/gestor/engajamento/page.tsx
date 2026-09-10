import { redirect } from 'next/navigation';
import { requireUserAction } from '@/lib/auth/action-context';
import { getRhEngagementCompany } from '@/lib/engajamento/rh-access';
import RhEngagementPanel from '@/components/engajamento/rh-panel';
import TeamEngagement from './team-engagement';

export const dynamic = 'force-dynamic';

export default async function EngagementPage() {
  let ctx;
  try { ctx = await requireUserAction(); }
  catch { redirect('/login'); }
  if (ctx.role === 'rh' || ctx.isPlatformAdmin) {
    const company = await getRhEngagementCompany();
    return <RhEngagementPanel {...company} />;
  }
  if (ctx.role !== 'gestor' && ctx.role !== 'tutor') redirect('/dashboard');
  return <TeamEngagement />;
}
