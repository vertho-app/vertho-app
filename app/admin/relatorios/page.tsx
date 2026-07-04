import { redirect } from 'next/navigation';

// Tela legada — os relatórios vivem na versão por empresa
// (/admin/empresas/[empresaId]/relatorios), linkada no pipeline e no menu.
// Mantida como redirect para preservar bookmarks/links antigos.
// (Reorganização do admin, Fase 1.)
export default async function RelatoriosRedirect({ searchParams }: { searchParams: Promise<{ empresa?: string }> }) {
  const { empresa } = await searchParams;
  redirect(empresa ? `/admin/empresas/${empresa}/relatorios` : '/admin/dashboard');
}
