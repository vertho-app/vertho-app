import { redirect } from 'next/navigation';

// Rota legada (Reorganização do admin, Fase 3): o preview do Ranking de Adequação
// agora vive como tab do workspace "Adequação" em /admin/fit.
export default async function RankingRedirect({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  redirect(`/admin/fit?empresa=${empresaId}&tab=ranking`);
}
