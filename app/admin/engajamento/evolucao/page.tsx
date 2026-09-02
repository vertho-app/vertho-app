import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** Compatibilidade com favoritos e links criados antes da evolução virar aba. */
export default async function EngajamentoEvolucaoLegado({
  searchParams,
}: {
  searchParams: Promise<{ empresa?: string }>;
}) {
  const { empresa } = await searchParams;
  const params = new URLSearchParams({ view: 'evolucao' });
  if (empresa) params.set('empresa', empresa);
  redirect(`/admin/engajamento?${params.toString()}`);
}
