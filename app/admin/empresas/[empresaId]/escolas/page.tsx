import { redirect } from 'next/navigation';

// Rota legada (Reorganização do admin, Fase 3): a tela de escolas foi fundida
// no workspace "Escolas & PPP" (/admin/ppp) como tab. Mantemos o redirect
// server-side para não quebrar links/bookmarks antigos.
export default async function EscolasPageLegacyRedirect({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  redirect(`/admin/ppp?empresa=${empresaId}&tab=escolas`);
}
