import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** `/admin` não tinha página (404). O home do admin é `/admin/dashboard` — redireciona. */
export default function AdminIndex() {
  redirect('/admin/dashboard');
}
