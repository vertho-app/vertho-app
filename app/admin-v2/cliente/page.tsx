import Link from 'next/link';
import { redirect } from 'next/navigation';
import { carregarClienteWorkspace } from '../actions';
import ClienteWorkspace from './ClienteWorkspace';

export const metadata = { title: 'Cliente' };
export const dynamic = 'force-dynamic';

export default async function ClientePage({ searchParams }: { searchParams: Promise<{ empresa?: string }> }) {
  const { empresa } = await searchParams;
  if (!empresa) redirect('/admin-v2/clientes');

  const { ws, erro } = await carregarClienteWorkspace(empresa);

  if (erro || !ws) {
    return (
      <div className="rounded-2xl border border-red-400/40 bg-red-400/5 px-5 py-4 text-sm text-red-200">
        Não foi possível carregar este cliente: {erro ?? 'sem dados'} ·{' '}
        <Link href="/admin-v2/clientes" className="underline">
          voltar à lista
        </Link>
      </div>
    );
  }

  return <ClienteWorkspace ws={ws} />;
}
