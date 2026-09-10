'use client';
/**
 * As duas leituras de adequação, lado a lado — e separadas de propósito.
 *
 * **Ranking** é documento de decisão: view pura de um snapshot assado, para que
 * dois leitores do mesmo processo vejam a mesma ordem.
 * **Prontidão** é exploratória: o par (cargo atual → cargo de destino) é
 * escolhido na hora e o motor recomputa.
 *
 * Elas moram na mesma página porque respondem à mesma pergunta do RH ("quem
 * encaixa neste cargo?"), e ficam em abas separadas porque as garantias são
 * diferentes — misturá-las faria um resultado exploratório herdar a autoridade
 * do documento.
 *
 * A aba escolhida vive em `useState` de propósito: é conveniência de leitura,
 * não gate de acesso (esse fica no servidor, nas duas actions).
 */
import { useState } from 'react';
import { ListOrdered, TrendingUp } from 'lucide-react';
import RankingAdequacaoView from '@/components/ranking-adequacao-view';
import ProntidaoCargoView from '@/components/prontidao-cargo-view';
import { listarCargosComRanking, getRankingAdequacao, exportarRankingPDF } from '@/actions/ranking-adequacao';
import { listarCargosParaProntidao, compararCargos } from '@/actions/prontidao-cargo';

const ABAS = [
  { id: 'ranking' as const, rotulo: 'Ranking por cargo', Icone: ListOrdered },
  { id: 'prontidao' as const, rotulo: 'Prontidão para o próximo cargo', Icone: TrendingUp },
];

export default function RankingTabs() {
  const [aba, setAba] = useState<'ranking' | 'prontidao'>('ranking');

  return (
    <>
      <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Leituras de adequação">
        {ABAS.map(({ id, rotulo, Icone }) => {
          const ativa = aba === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={ativa}
              onClick={() => setAba(id)}
              className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold transition ${
                ativa
                  ? 'border-brand-400 bg-brand-500/20 text-brand-200'
                  : 'border-white/10 text-slate-300 hover:bg-white/5'
              }`}
            >
              <Icone size={14} /> {rotulo}
            </button>
          );
        })}
      </div>

      {aba === 'ranking' ? (
        <RankingAdequacaoView
          scopeKey="rh-session"
          listar={listarCargosComRanking}
          carregar={getRankingAdequacao}
          exportar={exportarRankingPDF}
        />
      ) : (
        <ProntidaoCargoView
          scopeKey="rh-session"
          listar={listarCargosParaProntidao}
          comparar={compararCargos}
        />
      )}
    </>
  );
}
