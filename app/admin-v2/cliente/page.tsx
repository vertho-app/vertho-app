import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** Compatibilidade com os links do primeiro protótipo do admin-v2. */
export default async function ClienteLegadoPage({ searchParams }: { searchParams: Promise<{ empresa?: string }> }) {
  const { empresa } = await searchParams;
  redirect(empresa ? `/admin-v2/clientes/${empresa}` : '/admin-v2/clientes');
}
