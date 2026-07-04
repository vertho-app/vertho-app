import { redirect } from 'next/navigation';

// Rota legada (Reorganização do admin, Fase 3): tela fundida no workspace
// /admin/vertho/auditorias (tab sem14). Redirect server-side preservando ?empresa=.
export default async function AuditoriaSem14Redirect({ searchParams }: { searchParams: Promise<{ empresa?: string }> }) {
  const { empresa } = await searchParams;
  redirect(`/admin/vertho/auditorias?tab=sem14${empresa ? `&empresa=${encodeURIComponent(empresa)}` : ''}`);
}
