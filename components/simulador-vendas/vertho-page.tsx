import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { contextoVertho } from '@/lib/simulador-vendas/vertho-access';
import { SimuladorError } from '@/lib/simulador-vendas/core';
import TreinoVendas from './treino';

export default async function TreinoVerthoPage() {
  const sb = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await sb.auth.getUser();
  if (error || !user?.email) redirect('/login?redirect=/treinamento-vendas');
  try {
    await contextoVertho({
      id: user.id,
      email: user.email.trim().toLowerCase(),
    });
  } catch (e) {
    if (!(e instanceof SimuladorError)) throw e;
    return (
      <div className="max-w-2xl mx-auto p-8 text-white">
        <h1 className="text-2xl mb-4">Treinamento comercial Vertho</h1>
        <p role="alert">{e.message}</p>
        <Link className="inline-block mt-6 text-cyan-300" href="/login">
          Voltar ao acesso
        </Link>
      </div>
    );
  }
  return <TreinoVendas vertho />;
}
