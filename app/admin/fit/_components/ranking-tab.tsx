'use client';
/** Tab "Ranking" do workspace Adequação — PREVIEW de admin. Mesma tela do RH
 *  (`/dashboard/gestor/ranking`), mas escopada pela empresa do contexto do admin
 *  (useEmpresaContexto na página), gated p/ platform_admin. Dev/staff.
 *  Extraída da rota legada /admin/empresas/[empresaId]/ranking (Reorganização, Fase 3);
 *  as actions continuam em @/actions/ranking-adequacao — só a UI mudou de lugar. */
import { useCallback, useState } from 'react';
import RankingAdequacaoView from '@/components/ranking-adequacao-view';
import ProntidaoCargoView from '@/components/prontidao-cargo-view';
import { listarCargosComRankingAdmin, getRankingAdequacaoAdmin, exportarRankingPDFAdmin } from '@/actions/ranking-adequacao';
import { listarCargosParaProntidaoAdmin, compararCargosAdmin } from '@/actions/prontidao-cargo';
import { PRONTIDAO_VISIVEL } from '@/lib/adequacao-cargo/prontidao-flag';

export default function RankingTab({ empresaId }: { empresaId: string }) {
  const [aba, setAba] = useState<'ranking' | 'prontidao'>('ranking');
  const listar = useCallback(() => listarCargosComRankingAdmin(empresaId), [empresaId]);
  const carregar = useCallback((c: string) => getRankingAdequacaoAdmin(empresaId, c), [empresaId]);
  const exportar = useCallback((c: string) => exportarRankingPDFAdmin(empresaId, c), [empresaId]);
  // O preview espelha as MESMAS duas abas do RH: preview que mostra menos que a
  // tela real deixa de servir para conferir o que o cliente vê.
  const listarProntidao = useCallback(() => listarCargosParaProntidaoAdmin(empresaId), [empresaId]);
  const comparar = useCallback((o: string, a: string) => compararCargosAdmin(empresaId, o, a), [empresaId]);
  return (
    <div className="max-w-4xl mx-auto text-slate-200">
      <div className="mb-3 text-[11px] text-amber-400/80">Preview interno — é a tela que o RH do cliente vê (`/dashboard/gestor/ranking`), escopada pela empresa selecionada.</div>
      {PRONTIDAO_VISIVEL && <div className="mb-4 flex flex-wrap gap-2">
        {([['ranking', 'Ranking por cargo'], ['prontidao', 'Prontidão para o próximo cargo']] as const).map(([id, rotulo]) => (
          <button
            key={id}
            type="button"
            onClick={() => setAba(id)}
            className={`rounded-lg border px-3 py-1.5 text-xs ${aba === id ? 'border-brand-400 bg-brand-500/20 text-brand-200' : 'border-white/10 text-slate-300 hover:bg-white/5'}`}
          >
            {rotulo}
          </button>
        ))}
      </div>}
      {(!PRONTIDAO_VISIVEL || aba === 'ranking')
        ? <RankingAdequacaoView scopeKey={empresaId} listar={listar} carregar={carregar} exportar={exportar} />
        : <ProntidaoCargoView scopeKey={empresaId} listar={listarProntidao} comparar={comparar} />}
    </div>
  );
}
