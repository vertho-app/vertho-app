'use client';
/** Ranking de Adequação — PREVIEW de admin. Mesma tela do gestor, mas escopada pela
 *  empresa da ROTA (admin escolhe qualquer empresa), gated p/ platform_admin. Dev/staff. */
import { useCallback, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAdminShell } from '@/app/admin/_shell/AdminShellContext';
import RankingAdequacaoView from '@/components/ranking-adequacao-view';
import { listarCargosComRankingAdmin, getRankingAdequacaoAdmin, exportarRankingPDFAdmin } from '@/actions/ranking-adequacao';

export default function AdminRankingPage() {
  const { empresaId } = useParams() as { empresaId: string };
  const router = useRouter();
  const { empresaFiltro } = useAdminShell();
  // Sincroniza com o filtro de empresa do header: a tela é route-scoped em [empresaId],
  // então trocar o filtro precisa NAVEGAR pra rota da nova empresa (senão fica na antiga).
  useEffect(() => {
    if (empresaFiltro && empresaFiltro !== 'all' && empresaFiltro !== empresaId) router.replace(`/admin/empresas/${empresaFiltro}/ranking`);
  }, [empresaFiltro, empresaId, router]);
  const listar = useCallback(() => listarCargosComRankingAdmin(empresaId), [empresaId]);
  const carregar = useCallback((c: string) => getRankingAdequacaoAdmin(empresaId, c), [empresaId]);
  const exportar = useCallback((c: string) => exportarRankingPDFAdmin(empresaId, c), [empresaId]);
  return (
    <div className="p-6 max-w-4xl mx-auto text-slate-200">
      <div className="mb-3 text-[11px] text-amber-400/80">Preview interno — é a tela que o gestor do cliente vê (`/dashboard/gestor/ranking`), escopada pela empresa da rota.</div>
      <RankingAdequacaoView listar={listar} carregar={carregar} exportar={exportar} />
    </div>
  );
}
