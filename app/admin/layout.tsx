import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ShieldAlert } from 'lucide-react';
import { checkAdminAccess } from './admin-actions';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations('AdminAccess');
  const access = await checkAdminAccess();

  if (access.reason === 'unauthenticated') {
    redirect('/login?redirect=/admin/dashboard');
  }

  if (!access.authorized) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-[#07162a] px-6 text-center">
        <ShieldAlert size={48} className="text-red-400" />
        <p className="text-lg font-semibold text-white">{t('title')}</p>
        <p className="text-sm text-gray-400">{t('description')}</p>
        <Link
          href="/dashboard"
          className="mt-2 rounded-lg border border-cyan-400/30 px-4 py-2 text-sm font-semibold text-cyan-400 transition-colors hover:bg-cyan-400/10"
        >
          {t('backDashboard')}
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
