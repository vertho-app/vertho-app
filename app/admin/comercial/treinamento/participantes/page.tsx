import { requireCommercialAdminAction } from '@/lib/sales/permissions';
import ParticipantesVertho from '@/components/simulador-vendas/participantes-vertho';
export const dynamic = 'force-dynamic';
export default async function Page() {
  await requireCommercialAdminAction();
  return <ParticipantesVertho />;
}
