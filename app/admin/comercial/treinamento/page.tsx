import Link from 'next/link';
import { requireCommercialAdminAction } from '@/lib/sales/permissions';
import { can } from '@/lib/permissions';
import TreinoVerthoPage from '@/components/simulador-vendas/vertho-page';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const auth = await requireCommercialAdminAction(false);
  return (
    <>
      {(await can(auth, 'sales_channel.manage')) && (
        <div className="px-6 pt-5">
          <Link
            className="text-cyan-300 underline"
            href="/admin/comercial/treinamento/participantes"
          >
            Gerenciar acesso da equipe
          </Link>
        </div>
      )}
      <TreinoVerthoPage />
    </>
  );
}
