import { redirect } from 'next/navigation';

// Rota legada (Reorganização do admin, Fase 3): a ferramenta DEV de Calibração
// agora vive como tab do workspace "Adequação" em /admin/fit.
export default async function CalibracaoRedirect({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  redirect(`/admin/fit?empresa=${empresaId}&tab=calibracao`);
}
