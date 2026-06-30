'use client';
/** Ranking de Adequação — PREVIEW de admin. Mesma tela do gestor, mas escopada pela
 *  empresa da ROTA (admin escolhe qualquer empresa), gated p/ platform_admin. Dev/staff. */
import { useCallback } from 'react';
import { useParams } from 'next/navigation';
import RankingAdequacaoView from '@/components/ranking-adequacao-view';
import { listarCargosComRankingAdmin, getRankingAdequacaoAdmin } from '@/actions/ranking-adequacao';

export default function AdminRankingPage() {
  const { empresaId } = useParams() as { empresaId: string };
  const listar = useCallback(() => listarCargosComRankingAdmin(empresaId), [empresaId]);
  const carregar = useCallback((c: string) => getRankingAdequacaoAdmin(empresaId, c), [empresaId]);
  return (
    <div className="p-6 max-w-4xl mx-auto text-slate-200">
      <div className="mb-3 text-[11px] text-amber-400/80">Preview interno — é a tela que o gestor do cliente vê (`/dashboard/gestor/ranking`), escopada pela empresa da rota.</div>
      <RankingAdequacaoView listar={listar} carregar={carregar} />
    </div>
  );
}
