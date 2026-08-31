import { redirect } from 'next/navigation';
import { requireRoleAction } from '@/lib/auth/action-context';
import { carregarCentralRelatoriosRH } from '@/lib/relatorios/rh-center';
import RelatoriosRhView from './relatorios-rh-view';

export const dynamic = 'force-dynamic';

export default async function RelatoriosRhPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let auth: Awaited<ReturnType<typeof requireRoleAction>>;
  try {
    auth = await requireRoleAction(['rh']);
  } catch (error: any) {
    if (String(error?.message || '').includes('UNAUTHORIZED')) redirect('/login');
    redirect('/dashboard');
  }

  if (!auth.empresaId) redirect('/dashboard');

  // O recorte mora na URL (`?turma=`) e não em estado do cliente: o painel
  // inteiro é montado no servidor, então trocar de turma tem que refazer as
  // consultas. De quebra, o RH consegue mandar "a leitura dos diretores" para
  // alguém por link. A validação do id é do servidor (`carregarCentral...`).
  const params = await searchParams;
  const turmaParam = params?.turma;
  const turmaId = Array.isArray(turmaParam) ? turmaParam[0] : turmaParam;

  const reports = await carregarCentralRelatoriosRH(auth.empresaId, { turmaId: turmaId || null });
  return <RelatoriosRhView reports={reports} />;
}
