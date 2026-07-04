import { redirect } from 'next/navigation';

// Rota legada: a votação de competências agora vive como tab do workspace
// "Competências do Cargo" em /admin/cargos. Mantida como redirect para
// preservar bookmarks/links antigos. (Reorganização do admin, Fase 3.)
export default async function VotacaoRedirect({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  redirect(`/admin/cargos?empresa=${empresaId}&tab=votacao`);
}
