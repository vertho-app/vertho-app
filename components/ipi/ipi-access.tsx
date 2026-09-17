import { requireUserAction } from '@/lib/auth/action-context';
import { isIpiEmail } from '@/lib/ipi/contracts';
import IpiChat from './ipi-chat';

export default async function IpiAccess() {
  try {
    const auth = await requireUserAction();
    return isIpiEmail(auth.email) ? <IpiChat defaultEmpresaId={auth.isPlatformAdmin ? null : auth.empresaId} /> : null;
  } catch {
    return null;
  }
}
