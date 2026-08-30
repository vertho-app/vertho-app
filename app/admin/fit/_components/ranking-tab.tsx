'use client';
/** Tab "Ranking" do workspace Adequação — PREVIEW de admin. Mesma tela do RH
 *  (`/dashboard/gestor/ranking`), mas escopada pela empresa do contexto do admin
 *  (useEmpresaContexto na página), gated p/ platform_admin. Dev/staff.
 *  Extraída da rota legada /admin/empresas/[empresaId]/ranking (Reorganização, Fase 3);
 *  as actions continuam em @/actions/ranking-adequacao — só a UI mudou de lugar. */
import { useCallback } from 'react';
import RankingAdequacaoView from '@/components/ranking-adequacao-view';
import { listarCargosComRankingAdmin, getRankingAdequacaoAdmin, exportarRankingPDFAdmin } from '@/actions/ranking-adequacao';

export default function RankingTab({ empresaId }: { empresaId: string }) {
  const listar = useCallback(() => listarCargosComRankingAdmin(empresaId), [empresaId]);
  const carregar = useCallback((c: string) => getRankingAdequacaoAdmin(empresaId, c), [empresaId]);
  const exportar = useCallback((c: string) => exportarRankingPDFAdmin(empresaId, c), [empresaId]);
  return (
    <div className="max-w-4xl mx-auto text-slate-200">
      <div className="mb-3 text-[11px] text-amber-400/80">Preview interno — é a tela que o RH do cliente vê (`/dashboard/gestor/ranking`), escopada pela empresa selecionada.</div>
      <RankingAdequacaoView listar={listar} carregar={carregar} exportar={exportar} />
    </div>
  );
}
