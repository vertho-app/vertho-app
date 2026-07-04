import { redirect } from 'next/navigation';

// Tela legada — o Top 10 é editado no workspace de competências do cargo
// (/admin/cargos) e inline no pipeline da empresa. Mantida como redirect
// para preservar bookmarks/links antigos. (Reorganização do admin, Fase 1.)
export default async function Top10Redirect({ searchParams }: { searchParams: Promise<{ empresa?: string }> }) {
  const { empresa } = await searchParams;
  redirect(empresa ? `/admin/cargos?empresa=${empresa}` : '/admin/cargos');
}
