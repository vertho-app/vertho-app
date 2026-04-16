'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft, Loader2, BarChart3, Trophy, Target, Users, Zap, ChevronDown,
  AlertTriangle, CheckCircle, TrendingUp, TrendingDown, RefreshCw,
  Sparkles, Download, FileText,
} from 'lucide-react';
import {
  loadCargosComFit, calcularFitLote, loadRankingCargo, loadFitIndividual,
  gerarLeituraExecutivaFit,
} from '@/actions/fit-v2';
import { baixarRelatorioComportamentalPdfPorId } from '@/app/dashboard/perfil-comportamental/relatorio/relatorio-actions';

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

function parseFaixa(faixa) {
  // "60-100" → { min: 60, max: 100 }
  if (!faixa || typeof faixa !== 'string') return null;
  const m = faixa.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
  if (!m) return null;
  return { min: Number(m[1]), max: Number(m[2]) };
}

/**
 * Barra visual 0-100 mostrando a faixa ideal destacada + marker no score atual.
 * Serve para gaps (mostra o quanto a pessoa está fora) e para forças.
 */
function GapBar({ valorReal, faixa, markerColor = '#22D3EE' }) {
  const range = parseFaixa(faixa);
  const val = Number.isFinite(valorReal) ? Math.max(0, Math.min(100, valorReal)) : null;
  if (!range || val == null) return null;

  const idealLeft = Math.max(0, Math.min(100, range.min));
  const idealWidth = Math.max(0, Math.min(100, range.max) - idealLeft);

  return (
    <div className="relative h-3 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
      {/* Faixa ideal (teal semi-transparente) */}
      <div
        className="absolute top-0 h-full"
        style={{ left: `${idealLeft}%`, width: `${idealWidth}%`, background: 'rgba(45,212,191,0.22)' }}
      />
      {/* Linhas do limite da faixa */}
      <div className="absolute top-0 h-full w-px" style={{ left: `${range.min}%`, background: 'rgba(45,212,191,0.6)' }} />
      <div className="absolute top-0 h-full w-px" style={{ left: `${range.max}%`, background: 'rgba(45,212,191,0.6)' }} />
      {/* Marker do valor atual */}
      <div
        className="absolute -top-0.5 w-1 h-4 rounded-sm shadow-sm"
        style={{ left: `calc(${val}% - 2px)`, background: markerColor, boxShadow: '0 0 4px rgba(34,211,238,0.8)' }}
      />
    </div>
  );
}

function GapItem({ g }) {
  const sev = g.distancia > 20 ? 'bg-red-400/15 text-red-400 border-red-400/30'
    : g.distancia > 10 ? 'bg-amber-400/15 text-amber-400 border-amber-400/30'
    : 'bg-emerald-400/15 text-emerald-400 border-emerald-400/30';
  return (
    <div className="rounded-lg px-3 py-2.5 border border-white/[0.06]" style={{ background: '#091D35' }}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] font-semibold text-white truncate">{g.nome}</span>
          {g.peso && <span className="text-[8px] font-bold px-1 py-px rounded bg-white/5 text-gray-400 uppercase tracking-wider">{g.peso}</span>}
        </div>
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${sev}`}>
          {g.tratabilidade || '—'}
        </span>
      </div>
      {Number.isFinite(g.valorReal) && g.faixa && (
        <div className="mb-1.5">
          <GapBar valorReal={g.valorReal} faixa={g.faixa} markerColor="#F87171" />
        </div>
      )}
      <div className="flex items-center justify-between text-[9px] text-gray-500">
        <span>Atual: <strong className="text-gray-300">{g.valorReal ?? '—'}</strong> · Ideal: <strong className="text-cyan-400">{g.faixa || '—'}</strong></span>
        {g.impacto != null && (
          <span>Impacto no fit: <strong className="text-amber-400">+{Number(g.impacto).toFixed(1)}</strong></span>
        )}
      </div>
    </div>
  );
}

function ForcaItem({ f }) {
  return (
    <div className="rounded-lg px-3 py-2 border border-white/[0.06]" style={{ background: '#091D35' }}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-semibold text-white">{f.nome}</span>
        <span className="text-[11px] font-bold text-emerald-400">{f.valorReal ?? f.score}</span>
      </div>
      {Number.isFinite(f.valorReal) && f.faixa && (
        <GapBar valorReal={f.valorReal} faixa={f.faixa} markerColor="#34D399" />
      )}
    </div>
  );
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
  const [sortBy, setSortBy] = useState('fit'); // fit|nome|mapeamento|competencias|lideranca|disc|classificacao
  const [sortDir, setSortDir] = useState('desc');
  const [detailColab, setDetailColab] = useState(null);
  const [leituraAi, setLeituraAi] = useState(null);
  const [leituraLoading, setLeituraLoading] = useState(false);
  const [baixandoRel, setBaixandoRel] = useState(false);

  function flash(msg) { setToast(msg); setTimeout(() => setToast(null), 3000); }

  function openDetail(r) {
    setDetailColab(r);
    setLeituraAi(null); // reset lazy text a cada abertura
  }

  async function handleGerarLeitura(force = false) {
    if (!detailColab || !cargoSel || !empresaId) return;
    setLeituraLoading(true);
    const r = await gerarLeituraExecutivaFit(empresaId, detailColab.colaborador.id, cargoSel, { force });
    setLeituraLoading(false);
    if (r.success) setLeituraAi(r.texto);
    else flash('Erro: ' + (r.error || 'falha ao gerar leitura'));
  }

  // Dispara a leitura IA automaticamente ao abrir o drill-down
  useEffect(() => {
    if (!detailColab || !cargoSel || !empresaId) return;
    if (leituraAi || leituraLoading) return;
    handleGerarLeitura(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailColab?.colaborador?.id, cargoSel, empresaId]);

  async function handleBaixarRelatorio() {
    if (!detailColab) return;
    setBaixandoRel(true);
    const r = await baixarRelatorioComportamentalPdfPorId(detailColab.colaborador.id);
    setBaixandoRel(false);
    if (r.error) { flash('Erro: ' + r.error); return; }
    const a = document.createElement('a');
    a.href = r.url;
    a.download = r.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

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

  async function handleCalcular(cargoNome, forcar = false) {
    setCalculating(true);
    try {
      const r = await calcularFitLote(empresaId, cargoNome, { forcar });
      if (!r.success) { flash('Erro: ' + r.error); return; }
      flash(r.message);
      if (r.erros_detalhados?.length) {
        const resumo = r.erros_detalhados.slice(0, 5).map(e => `• ${e.nome}: ${e.erro}`).join('\n');
        console.group('[Fit lote] Erros:');
        r.erros_detalhados.forEach(e => console.error(e.nome, '→', e.erro));
        console.groupEnd();
        alert(`${r.erros_detalhados.length} colaborador(es) com erro:\n\n${resumo}${r.erros_detalhados.length > 5 ? `\n\n... e mais ${r.erros_detalhados.length - 5}` : ''}`);
      }
      // Recarrega a lista de cargos e ranking
      await Promise.all([
        loadCargosComFit(empresaId).then(setCargos),
        handleSelectCargo(cargoNome),
      ]);
    } catch (err) {
      flash('Erro inesperado: ' + err.message);
      console.error('[handleCalcular]', err);
    } finally {
      setCalculating(false);
    }
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
            <div className="mt-2 flex items-center gap-3">
              <button onClick={(e) => { e.stopPropagation(); handleCalcular(c.nome); }} disabled={calculating || !c.temPerfilIdeal}
                className="flex items-center gap-1 text-[10px] font-semibold text-cyan-400 hover:text-cyan-300 disabled:text-gray-600 disabled:cursor-not-allowed">
                {calculating ? <Loader2 size={10} className="animate-spin" /> : <Zap size={10} />}
                {c.temPerfilIdeal ? 'Calcular Fit' : 'Sem perfil ideal'}
              </button>
              {c.totalFits > 0 && c.temPerfilIdeal && (
                <button onClick={(e) => { e.stopPropagation(); handleCalcular(c.nome, true); }} disabled={calculating}
                  className="flex items-center gap-1 text-[10px] font-semibold text-amber-400 hover:text-amber-300 disabled:text-gray-600">
                  <Loader2 size={10} className={calculating ? 'animate-spin' : 'hidden'} /> Recalcular todos
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Ranking */}
      {cargoSel && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-white">Ranking — {cargoSel}</h2>
            <div className="flex items-center gap-2">
              {Object.entries(distribuicao).map(([faixa, count]: [string, any]) => count > 0 && (
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
              {(() => {
                const toggleSort = (col) => {
                  if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
                  else { setSortBy(col); setSortDir(col === 'nome' || col === 'classificacao' ? 'asc' : 'desc'); }
                };
                const sortedRanking = [...ranking].sort((a, b) => {
                  let va, vb;
                  switch (sortBy) {
                    case 'nome': va = a.colaborador?.nome || ''; vb = b.colaborador?.nome || ''; break;
                    case 'mapeamento': va = a.blocos.mapeamento?.score ?? -1; vb = b.blocos.mapeamento?.score ?? -1; break;
                    case 'competencias': va = a.blocos.competencias?.score ?? -1; vb = b.blocos.competencias?.score ?? -1; break;
                    case 'lideranca': va = a.blocos.lideranca?.excluido ? -1 : (a.blocos.lideranca?.score ?? -1); vb = b.blocos.lideranca?.excluido ? -1 : (b.blocos.lideranca?.score ?? -1); break;
                    case 'disc': va = a.blocos.disc?.score ?? -1; vb = b.blocos.disc?.score ?? -1; break;
                    case 'classificacao': va = a.classificacao || ''; vb = b.classificacao || ''; break;
                    case 'fit':
                    default: va = a.fit_final; vb = b.fit_final;
                  }
                  if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
                  return sortDir === 'asc' ? va - vb : vb - va;
                });
                const SortHeader = ({ col, label, align = 'center' }) => {
                  const ativo = sortBy === col;
                  const arrow = ativo ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕';
                  return (
                    <th className={`px-4 py-2 text-${align} cursor-pointer hover:text-cyan-400`} onClick={() => toggleSort(col)}>
                      {label}<span className={ativo ? 'text-cyan-400' : 'text-gray-700'}>{arrow}</span>
                    </th>
                  );
                };
                return (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] text-[9px] font-bold text-gray-500 uppercase tracking-widest">
                    <th className="px-4 py-2 text-center w-10">#</th>
                    <SortHeader col="nome" label="Colaborador" align="left" />
                    <SortHeader col="fit" label="Fit" />
                    <SortHeader col="mapeamento" label="Mapeamento" />
                    <SortHeader col="competencias" label="Competências" />
                    <SortHeader col="lideranca" label="Liderança" />
                    <SortHeader col="disc" label="DISC" />
                    <SortHeader col="classificacao" label="Classificação" align="left" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03]">
                  {sortedRanking.map(r => {
                    const faixa = getFaixa(r.fit_final);
                    return (
                      <tr key={r.colaborador.id} className="hover:bg-white/[0.02] cursor-pointer" onClick={() => openDetail(r)}>
                        <td className="px-4 py-2.5 text-center text-amber-400 font-mono font-bold text-xs">{r.ranking.posicao}</td>
                        <td className="px-4 py-2.5 text-white font-semibold text-xs">{r.colaborador.nome || '—'}</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`text-sm font-bold ${FAIXA_COLORS[faixa]?.text}`}>{r.fit_final}</span>
                        </td>
                        <td className="px-4 py-2.5 text-center text-xs text-gray-400">{r.blocos.mapeamento?.score?.toFixed(0) ?? '—'}</td>
                        <td className="px-4 py-2.5 text-center text-xs text-gray-400">{r.blocos.competencias?.score?.toFixed(0) ?? '—'}</td>
                        <td className="px-4 py-2.5 text-center text-xs text-gray-400">{r.blocos.lideranca?.excluido ? 'n/a' : (r.blocos.lideranca?.score?.toFixed(0) ?? '—')}</td>
                        <td className="px-4 py-2.5 text-center text-xs text-gray-400">{r.blocos.disc?.score?.toFixed(0) ?? '—'}</td>
                        <td className="px-4 py-2.5">
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${FAIXA_COLORS[faixa]?.bg} ${FAIXA_COLORS[faixa]?.text}`}>
                            {r.classificacao}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
                );
              })()}
            </div>
          )}

          {/* Legenda das colunas */}
          {ranking.length > 0 && (
            <div className="mt-4 rounded-xl border border-white/[0.06] p-4 text-[11px] text-gray-400 leading-relaxed space-y-1.5" style={{ background: 'rgba(15,42,74,0.5)' }}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-400 mb-2">O que cada coluna significa</p>
              <p><span className="text-white font-bold">Fit</span> — índice final 0-100 combinando os 4 blocos. Quanto maior, mais aderente ao cargo.</p>
              <p><span className="text-white font-bold">Mapeamento</span> — aderência DISC Natural vs perfil ideal do cargo (quanto o colab é "naturalmente" assim).</p>
              <p><span className="text-white font-bold">Competências</span> — média das 16 competências comportamentais comparadas ao perfil ideal (score ponderado por relevância do cargo).</p>
              <p><span className="text-white font-bold">Liderança</span> — aderência do estilo de liderança (Executivo/Motivador/Metódico/Sistemático) ao modelo esperado do cargo.</p>
              <p><span className="text-white font-bold">DISC</span> — aderência DISC Adaptado (como se comporta no trabalho) vs perfil esperado. Diferença entre Mapeamento e DISC revela nível de ajuste/desgaste.</p>
              <p><span className="text-white font-bold">Classificação</span> — faixa qualitativa do Fit: Excelente (≥85) · Alta (70-84) · Razoável (50-69) · Baixa (30-49) · Crítica (&lt;30).</p>
            </div>
          )}
        </div>
      )}

      {/* Modal detalhe individual */}
      {detailColab && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-10 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={() => setDetailColab(null)}>
          <div className="w-full max-w-[860px] rounded-2xl border border-white/[0.08] p-6 mb-10" style={{ background: '#0A1D35' }}
            onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
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

            {/* 4 Blocos */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              {[
                { key: 'mapeamento', label: 'Mapeamento', color: '#06B6D4' },
                { key: 'competencias', label: 'Competências', color: '#F59E0B' },
                { key: 'lideranca', label: 'Liderança', color: '#22C55E' },
                { key: 'disc', label: 'DISC', color: '#8B5CF6' },
              ].map(b => {
                const score = detailColab.blocos[b.key]?.score ?? 0;
                const peso = detailColab.blocos[b.key]?.peso;
                return (
                  <div key={b.key} className="text-center p-3 rounded-lg" style={{ background: '#091D35' }}>
                    <div className="text-2xl font-bold" style={{ color: b.color }}>{score.toFixed(0)}</div>
                    <div className="text-[9px] text-gray-500 mt-1">{b.label}</div>
                    {peso != null && <div className="text-[8px] text-gray-600 mt-0.5">peso {Math.round(peso * 100)}%</div>}
                  </div>
                );
              })}
            </div>

            {/* Recomendação */}
            <div className="flex items-center gap-2 mb-5 p-3 rounded-lg" style={{ background: '#091D35' }}>
              <span className="text-[10px] text-gray-500">Recomendação do modelo:</span>
              <span className="text-xs font-bold text-white">{detailColab.recomendacao}</span>
            </div>

            {/* Gap Analysis em 2 colunas */}
            {detailColab.gap_analysis && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                {/* Gaps */}
                <div>
                  <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                    <TrendingDown size={12} /> Top Gaps — prioridade PDI
                  </p>
                  {detailColab.gap_analysis.top_gaps?.length > 0 ? (
                    <div className="space-y-2">
                      {detailColab.gap_analysis.top_gaps.slice(0, 5).map((g, i) => (
                        <GapItem key={i} g={g} />
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-gray-500 italic">Nenhum gap relevante — colaborador dentro das faixas ideais.</p>
                  )}
                </div>

                {/* Forças */}
                <div>
                  <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                    <TrendingUp size={12} /> Principais forças
                  </p>
                  {detailColab.gap_analysis.top_forcas?.length > 0 ? (
                    <div className="space-y-2">
                      {detailColab.gap_analysis.top_forcas.slice(0, 5).map((f, i) => (
                        <ForcaItem key={i} f={f} />
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-gray-500 italic">Sem forças destacadas no momento.</p>
                  )}

                  {/* Alertas de excesso */}
                  {detailColab.gap_analysis.alertas_excesso?.length > 0 && (
                    <div className="mt-4">
                      <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                        <AlertTriangle size={12} /> Alertas de excesso
                      </p>
                      <div className="space-y-1">
                        {detailColab.gap_analysis.alertas_excesso.map((a, i) => (
                          <p key={i} className="text-[10px] text-amber-300/90 px-2 py-1 rounded" style={{ background: 'rgba(245,158,11,0.08)' }}>
                            ⚠ {a.alerta}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Leitura executiva — gerada automaticamente ao abrir */}
            <div className="rounded-lg p-4 border border-cyan-400/20 mb-5" style={{ background: 'rgba(6,182,212,0.04)' }}>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-cyan-400 flex items-center gap-1.5 mb-2">
                <Sparkles size={12} /> Leitura executiva
              </p>
              {leituraLoading && !leituraAi ? (
                <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
                  <Loader2 size={12} className="animate-spin text-cyan-400" />
                  Gerando análise personalizada...
                </div>
              ) : leituraAi ? (
                <p className="text-xs text-gray-200 leading-relaxed">{leituraAi}</p>
              ) : detailColab.leitura_executiva ? (
                <p className="text-xs text-gray-400 leading-relaxed italic">{detailColab.leitura_executiva}</p>
              ) : null}
            </div>

            {/* Ações */}
            <div className="flex gap-2">
              <button onClick={handleBaixarRelatorio} disabled={baixandoRel}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-bold text-white disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #0D9488, #0F766E)' }}>
                {baixandoRel ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                Baixar relatório comportamental
              </button>
              <button onClick={() => setDetailColab(null)}
                className="px-4 py-2.5 rounded-lg text-xs font-semibold text-gray-400 border border-white/10 hover:text-white transition-colors">
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
