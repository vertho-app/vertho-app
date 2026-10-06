import { requireRepresentativeAction } from '@/lib/sales/permissions';
import TreinoVerthoPage from '@/components/simulador-vendas/vertho-page';
export const dynamic = 'force-dynamic';
export default async function Page() {
  await requireRepresentativeAction();
  return <TreinoVerthoPage />;
}
