import { requireAdminAction } from '@/lib/auth/action-context';
import { isIpiEmail } from '@/lib/ipi/contracts';
import IpiChat from './ipi-chat';

export default async function IpiAccess() {
  try {
    const auth = await requireAdminAction('admin.access');
    return isIpiEmail(auth.email) ? <IpiChat /> : null;
  } catch {
    return null;
  }
}
