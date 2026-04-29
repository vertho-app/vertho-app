'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Users, BarChart3, CheckCircle, AlertCircle, MessageCircle, Trophy } from 'lucide-react';
import { loadResultadosVotacao, toggleVotacao, aprovarTop5Votacao } from '@/actions/votacao';

const MEDAL = ['🥇', '🥈', '🥉', '4º', '5º'];

export default function VotacaoAdminPage({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = use(params);
  const router = useRouter();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [aprovando, setAprovando] = useState<string | null>(null);
  // selecaoPorCargo[cargo] = Set<string> de competências marcadas pra aprovação
  const [selecaoPorCargo, setSelecaoPorCargo] = useState<Record<string, Set<string>>>({});
  const [toast, setToast] = useState('');

  function flash(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000); }

  async function refresh() {
    const r = await loadResultadosVotacao(empresaId);
    setData(r);
    // Pre-popula seleção com top 5 do ranking (default razoável)
    if (r?.resultado) {
      const sel: Record<string, Set<string>> = {};
      for (const [cargo, dados] of Object.entries(r.resultado)) {
        const ranking = (dados as any).ranking || [];
        sel[cargo] = new Set(ranking.slice(0, 5).map((x: any) => x.nome));
      }
      setSelecaoPorCargo(sel);
    }
    setLoading(false);
  }

  useEffect(() => { refresh(); }, [empresaId]);

  async function handleToggle() {
    setToggling(true);
    const r = await toggleVotacao(empresaId, !data.votacaoAtiva);
    setToggling(false);
    flash(r.success ? r.message : r.error);
    refresh();
  }

  function toggleSel(cargo: string, comp: string) {
    setSelecaoPorCargo((prev) => {
      const atual = new Set(prev[cargo] || []);
      if (atual.has(comp)) atual.delete(comp);
      else atual.add(comp);
      return { ...prev, [cargo]: atual };
    });
  }

  async function handleAprovar(cargo: string, ranking: any[]) {
    const sel = selecaoPorCargo[cargo] || new Set();
    // Mantém a ordem do ranking pra os marcados
    const escolhidas = ranking.map((r: any) => r.nome).filter((n: string) => sel.has(n));
    if (escolhidas.length < 1) { flash(`Marque ao menos 1 competência para ${cargo}`); return; }
    setAprovando(cargo);
    const r = await aprovarTop5Votacao(empresaId, cargo, escolhidas);
    setAprovando(null);
    flash(r.success ? r.message : r.error);
  }

  if (loading) return <div className="flex items-center justify-center h-dvh"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;

  const cargos = data?.resultado ? Object.entries(data.resultado) : [];

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-6 sm:px-6" style={{ minHeight: '100dvh' }}>
      {toast && <div className="fixed top-4 right-4 z-50 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold shadow-lg">{toast}</div>}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push(`/admin/empresas/${empresaId}`)}
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-white/10 text-gray-400 hover:text-white">
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <BarChart3 size={20} className="text-cyan-400" /> Votação de Competências
            </h1>
            <p className="text-xs text-gray-500">Consolidação dos votos dos colaboradores</p>
          </div>
        </div>
        <button onClick={handleToggle} disabled={toggling}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
            data?.votacaoAtiva
              ? 'bg-red-400/15 text-red-400 border border-red-400/30 hover:bg-red-400/25'
              : 'bg-green-400/15 text-green-400 border border-green-400/30 hover:bg-green-400/25'
          }`}>
          {toggling ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null}
          {data?.votacaoAtiva ? 'Fechar votação' : 'Abrir votação'}
        </button>
      </div>

      {/* Status */}
      <div className={`rounded-xl p-4 mb-3 border ${data?.votacaoAtiva ? 'border-green-400/20 bg-green-400/5' : 'border-white/[0.06] bg-white/[0.02]'}`}>
        <div className="flex items-center gap-2">
          {data?.votacaoAtiva ? <CheckCircle size={16} className="text-green-400" /> : <AlertCircle size={16} className="text-gray-500" />}
          <span className={`text-sm font-bold ${data?.votacaoAtiva ? 'text-green-400' : 'text-gray-500'}`}>
            {data?.votacaoAtiva ? 'Votação aberta — colaboradores podem votar' : 'Votação fechada'}
          </span>
        </div>
      </div>

      {/* Dica: 2 caminhos */}
      <div className="rounded-xl p-3 mb-6 border border-cyan-400/15 bg-cyan-400/[0.04] text-[11px] text-cyan-100/85 leading-relaxed">
        <strong className="text-cyan-300">Como definir o Top final do cargo:</strong>{' '}
        <span className="text-cyan-100/70">
          (1) <strong>Votação dos colaboradores</strong> — esta tela. Marque as competências do
          ranking abaixo e aprove. (2) <strong>Workshop presencial</strong> — vá em{' '}
        </span>
        <button onClick={() => router.push(`/admin/empresas/${empresaId}/fase1?tab=top5`)}
          className="underline text-cyan-300 hover:text-cyan-200">
          Fase 1 → Top 5
        </button>
        <span className="text-cyan-100/70"> e selecione manualmente. Pode escolher qualquer quantidade (≥ 1).</span>
      </div>

      {cargos.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Users size={32} className="mx-auto mb-3 text-gray-600" />
          <p className="text-sm">Nenhum colaborador encontrado. Importe colaboradores primeiro.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {cargos.map(([cargo, dados]: [string, any]) => (
            <div key={cargo} className="rounded-xl border border-white/[0.06] overflow-hidden" style={{ background: '#0F2A4A' }}>
              {/* Cargo header */}
              <div className="px-4 py-3 border-b border-white/[0.04] flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-white">{cargo}</h2>
                  <p className="text-[10px] text-gray-500">
                    <span className="text-cyan-400 font-bold">{dados.votaram}</span> de {dados.total} votaram
                    {dados.faltam.length > 0 && (
                      <span className="text-gray-600"> · Faltam: {dados.faltam.join(', ')}</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {dados.votaram > 0 && dados.ranking.length > 0 && (() => {
                    const selCount = (selecaoPorCargo[cargo] || new Set()).size;
                    return (
                      <button onClick={() => handleAprovar(cargo, dados.ranking)}
                        disabled={aprovando === cargo || selCount === 0}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold text-green-400 border border-green-400/30 hover:bg-green-400/10 disabled:opacity-50">
                        {aprovando === cargo ? <Loader2 size={11} className="animate-spin" /> : <Trophy size={11} />}
                        Aprovar {selCount > 0 ? selCount : ''} selecionada{selCount === 1 ? '' : 's'}
                      </button>
                    );
                  })()}
                </div>
              </div>

              {/* Ranking */}
              {dados.ranking.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-gray-500">Nenhum voto recebido ainda</div>
              ) : (
                <div className="px-4 py-3 space-y-1.5">
                  {dados.ranking.map((r: any, idx: number) => {
                    const sel = selecaoPorCargo[cargo] || new Set();
                    const marcado = sel.has(r.nome);
                    return (
                      <button
                        type="button"
                        key={r.nome}
                        onClick={() => toggleSel(cargo, r.nome)}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                          marcado ? 'border border-cyan-400/30' : 'border border-transparent hover:border-white/[0.08]'
                        }`}
                        style={{ background: marcado ? 'rgba(52,197,204,0.08)' : '#091D35' }}>
                        {/* Checkbox */}
                        <span
                          className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                            marcado ? 'border-cyan-400 bg-cyan-400/20' : 'border-white/20 bg-transparent'
                          }`}>
                          {marcado && <CheckCircle size={11} className="text-cyan-400" />}
                        </span>
                        <span className="w-8 text-center text-sm shrink-0">
                          {idx < 3 ? MEDAL[idx] : <span className="text-[10px] text-gray-500">{idx + 1}º</span>}
                        </span>
                        <span className={`flex-1 text-sm ${marcado ? 'font-bold text-white' : 'text-gray-400'}`}>{r.nome}</span>
                        <div className="flex items-center gap-3 shrink-0 text-[10px]">
                          <span className="text-cyan-400 font-bold">{r.pontos} pts</span>
                          <span className="text-gray-500">{r.votos} voto{r.votos !== 1 ? 's' : ''}</span>
                        </div>
                        {marcado && (
                          <div className="w-24 h-1.5 rounded-full overflow-hidden bg-white/5 shrink-0">
                            <div className="h-full rounded-full bg-cyan-400" style={{ width: `${(r.pontos / (dados.votaram * 5)) * 100}%` }} />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Sugestões */}
              {dados.sugestoes.length > 0 && (
                <div className="px-4 py-3 border-t border-white/[0.04]">
                  <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                    <MessageCircle size={10} /> Sugestões de novas competências
                  </p>
                  {dados.sugestoes.map((s: any, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-xs mb-1">
                      <span className="text-gray-500 shrink-0">{s.nome}:</span>
                      <span className="text-amber-300">{s.sugestao}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
