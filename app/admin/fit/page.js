'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft, Loader2, BarChart3, Trophy, Target, Users, Zap, ChevronDown,
  AlertTriangle, CheckCircle, TrendingUp, TrendingDown, RefreshCw
} from 'lucide-react';
import {
  loadCargosComFit, calcularFitLote, loadRankingCargo, loadFitIndividual
} from '@/actions/fit-v2';

const FAIXA_COLORS = {
  excelente: { bg: 'bg-green-400/15', text: 'text-green-400', label: 'Excelente' },
  alta: { bg: 'bg-cyan-400/15', text: 'text-cyan-400', label: 'Alta' },
  razoavel: { bg: 'bg-amber-400/15', text: 'text-amber-400', label: 'Razoável' },
  baixa: { bg: 'bg-orange-400/15', text: 'text-orange-400', label: 'Baixa' },
  critica: { bg: 'bg-red-400/15', text: 'text-red-400', label: 'Crítica' },
};

function getFaixa(fit) {
  if (fit >= 85) return 'excelente';
  if (fit >= 70) return 'alta';
  if (fit >= 50) return 'razoavel';
  if (fit >= 30) return 'baixa';
  return 'critica';
}

export default function FitPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const empresaId = searchParams.get('empresa');

  const [cargos, setCargos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cargoSel, setCargoSel] = useState(null);
  const [ranking, setRanking] = useState([]);
  const [distribuicao, setDistribuicao] = useState({});
  const [loadingRanking, setLoadingRanking] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [toast, setToast] = useState(null);
  const [detailColab, setDetailColab] = useState(null);

  function flash(msg) { setToast(msg); setTimeout(() => setToast(null), 3000); }

  useEffect(() => {
    if (!empresaId) { setLoading(false); return; }
    loadCargosComFit(empresaId).then(d => { setCargos(d); setLoading(false); });
  }, [empresaId]);

  async function handleSelectCargo(cargoNome) {
    setCargoSel(cargoNome);
    setLoadingRanking(true);
    setDetailColab(null);
    const r = await loadRankingCargo(empresaId, cargoNome);
    if (r.success) { setRanking(r.data); setDistribuicao(r.distribuicao); }
    setLoadingRanking(false);
  }

  async function handleCalcular(cargoNome) {
    setCalculating(true);
    const r = await calcularFitLote(empresaId, cargoNome);
    setCalculating(false);
    flash(r.success ? r.message : 'Erro: ' + r.error);
    if (r.success) handleSelectCargo(cargoNome);
  }

  if (!empresaId) return <div className="max-w-[1100px] mx-auto px-4 py-6 text-center"><p className="text-gray-400">Acesse via pipeline da empresa.</p></div>;
  if (loading) return <div className="flex items-center justify-center h-dvh"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-6 sm:px-6" style={{ minHeight: '100dvh' }}>
      {toast && <div className="fixed top-4 right-4 z-50 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold shadow-lg">{toast}</div>}

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="w-9 h-9 flex items-center justify-center rounded-lg border border-white/10 text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2"><BarChart3 size={20} className="text-cyan-400" /> Modelo de Fit v2</h1>
          <p className="text-xs text-gray-500">Aderência colaborador × cargo</p>
        </div>
      </div>

      {/* Cargos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        {cargos.map(c => (
          <div key={c.id} className={`rounded-xl border p-4 cursor-pointer transition-all ${
            cargoSel === c.nome ? 'border-cyan-400/40 bg-cyan-400/5' : 'border-white/[0.06] hover:border-white/15'
          }`} style={{ background: cargoSel === c.nome ? undefined : '#0F2A4A' }}
            onClick={() => handleSelectCargo(c.nome)}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold text-white">{c.nome}</span>
              {c.temPerfilIdeal && <CheckCircle size={12} className="text-green-400" />}
            </div>
            <div className="flex items-center gap-3 text-[10px]">
              <span className="text-gray-500">{c.totalFits} fits calculados</span>
              {c.mediaFit != null && <span className={`font-bold ${getFaixa(c.mediaFit) === 'excelente' || getFaixa(c.mediaFit) === 'alta' ? 'text-green-400' : getFaixa(c.mediaFit) === 'razoavel' ? 'text-amber-400' : 'text-red-400'}`}>Média: {c.mediaFit}</span>}
            </div>
            <button onClick={(e) => { e.stopPropagation(); handleCalcular(c.nome); }} disabled={calculating || !c.temPerfilIdeal}
              className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-cyan-400 hover:text-cyan-300 disabled:text-gray-600 disabled:cursor-not-allowed">
              {calculating ? <Loader2 size={10} className="animate-spin" /> : <Zap size={10} />}
              {c.temPerfilIdeal ? 'Calcular Fit' : 'Sem perfil ideal'}
            </button>
          </div>
        ))}
      </div>

      {/* Ranking */}
      {cargoSel && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-white">Ranking — {cargoSel}</h2>
            <div className="flex items-center gap-2">
              {Object.entries(distribuicao).map(([faixa, count]) => count > 0 && (
                <span key={faixa} className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${FAIXA_COLORS[faixa]?.bg} ${FAIXA_COLORS[faixa]?.text}`}>
                  {FAIXA_COLORS[faixa]?.label}: {count}
                </span>
              ))}
            </div>
          </div>

          {loadingRanking ? (
            <div className="flex justify-center py-8"><Loader2 size={24} className="animate-spin text-cyan-400" /></div>
          ) : ranking.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-500">Nenhum fit calculado. Clique em "Calcular Fit" no cargo.</div>
          ) : (
            <div className="rounded-xl border border-white/[0.06] overflow-hidden" style={{ background: '#0F2A4A' }}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] text-[9px] font-bold text-gray-500 uppercase tracking-widest">
                    <th className="px-4 py-2 text-center w-10">#</th>
                    <th className="px-4 py-2 text-left">Colaborador</th>
                    <th className="px-4 py-2 text-center">Fit</th>
                    <th className="px-4 py-2 text-center">Mapeamento</th>
                    <th className="px-4 py-2 text-center">Competências</th>
                    <th className="px-4 py-2 text-center">Liderança</th>
                    <th className="px-4 py-2 text-center">DISC</th>
                    <th className="px-4 py-2 text-left">Classificação</th>
                    <th className="px-4 py-2 text-center">%il</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03]">
                  {ranking.map(r => {
                    const faixa = getFaixa(r.fit_final);
                    return (
                      <tr key={r.colaborador.id} className="hover:bg-white/[0.02] cursor-pointer" onClick={() => setDetailColab(r)}>
                        <td className="px-4 py-2.5 text-center text-amber-400 font-mono font-bold text-xs">{r.ranking.posicao}</td>
                        <td className="px-4 py-2.5 text-white font-semibold text-xs">{r.colaborador.nome || '—'}</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`text-sm font-bold ${FAIXA_COLORS[faixa]?.text}`}>{r.fit_final}</span>
                        </td>
                        <td className="px-4 py-2.5 text-center text-xs text-gray-400">{r.blocos.mapeamento?.score?.toFixed(0) ?? '—'}</td>
                        <td className="px-4 py-2.5 text-center text-xs text-gray-400">{r.blocos.competencias?.score?.toFixed(0) ?? '—'}</td>
                        <td className="px-4 py-2.5 text-center text-xs text-gray-400">{r.blocos.lideranca?.score?.toFixed(0) ?? '—'}</td>
                        <td className="px-4 py-2.5 text-center text-xs text-gray-400">{r.blocos.disc?.score?.toFixed(0) ?? '—'}</td>
                        <td className="px-4 py-2.5">
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${FAIXA_COLORS[faixa]?.bg} ${FAIXA_COLORS[faixa]?.text}`}>
                            {r.classificacao}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-center text-xs text-gray-500">{r.ranking.percentil}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal detalhe individual */}
      {detailColab && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-10 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={() => setDetailColab(null)}>
          <div className="w-full max-w-[700px] rounded-2xl border border-white/[0.08] p-6 mb-10" style={{ background: '#0A1D35' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-white">{detailColab.colaborador.nome}</h3>
                <p className="text-xs text-gray-500">{cargoSel}</p>
              </div>
              <div className="text-right">
                <div className={`text-3xl font-bold ${FAIXA_COLORS[getFaixa(detailColab.fit_final)]?.text}`}>{detailColab.fit_final}</div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${FAIXA_COLORS[getFaixa(detailColab.fit_final)]?.bg} ${FAIXA_COLORS[getFaixa(detailColab.fit_final)]?.text}`}>
                  {detailColab.classificacao}
                </span>
              </div>
            </div>

            {/* Leitura executiva */}
            {detailColab.leitura_executiva && (
              <p className="text-xs text-gray-300 leading-relaxed mb-4 p-3 rounded-lg" style={{ background: '#091D35' }}>{detailColab.leitura_executiva}</p>
            )}

            {/* 4 Blocos */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              {[
                { key: 'mapeamento', label: 'Mapeamento', color: '#06B6D4' },
                { key: 'competencias', label: 'Competências', color: '#F59E0B' },
                { key: 'lideranca', label: 'Liderança', color: '#22C55E' },
                { key: 'disc', label: 'DISC', color: '#8B5CF6' },
              ].map(b => {
                const score = detailColab.blocos[b.key]?.score ?? 0;
                return (
                  <div key={b.key} className="text-center p-3 rounded-lg" style={{ background: '#091D35' }}>
                    <div className="text-2xl font-bold" style={{ color: b.color }}>{score.toFixed(0)}</div>
                    <div className="text-[9px] text-gray-500 mt-1">{b.label}</div>
                  </div>
                );
              })}
            </div>

            {/* Recomendação */}
            <div className="flex items-center gap-2 mb-4 p-3 rounded-lg" style={{ background: '#091D35' }}>
              <span className="text-[10px] text-gray-500">Recomendação:</span>
              <span className="text-xs font-bold text-white">{detailColab.recomendacao}</span>
            </div>

            {/* Gap Analysis */}
            {detailColab.gap_analysis && (
              <div className="space-y-3">
                {detailColab.gap_analysis.top_gaps?.length > 0 && (
                  <div>
                    <p className="text-[9px] font-bold text-red-400 uppercase tracking-widest mb-1">Top Gaps</p>
                    {detailColab.gap_analysis.top_gaps.map((g, i) => (
                      <div key={i} className="flex items-center justify-between text-[10px] py-1">
                        <span className="text-gray-300">{g.nome}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500">{g.tratabilidade}</span>
                          <TrendingDown size={10} className="text-red-400" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {detailColab.gap_analysis.top_forcas?.length > 0 && (
                  <div>
                    <p className="text-[9px] font-bold text-green-400 uppercase tracking-widest mb-1">Forças</p>
                    {detailColab.gap_analysis.top_forcas.map((f, i) => (
                      <div key={i} className="flex items-center justify-between text-[10px] py-1">
                        <span className="text-gray-300">{f.nome}</span>
                        <TrendingUp size={10} className="text-green-400" />
                      </div>
                    ))}
                  </div>
                )}
                {detailColab.gap_analysis.alertas_excesso?.length > 0 && (
                  <div>
                    <p className="text-[9px] font-bold text-amber-400 uppercase tracking-widest mb-1">Alertas de Excesso</p>
                    {detailColab.gap_analysis.alertas_excesso.map((a, i) => (
                      <div key={i} className="text-[10px] text-amber-300 py-0.5">⚠ {a.alerta}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button onClick={() => setDetailColab(null)} className="mt-4 w-full py-2.5 rounded-lg text-sm font-semibold text-gray-400 border border-white/10 hover:text-white transition-colors">Fechar</button>
          </div>
        </div>
      )}
    </div>
  );
}
