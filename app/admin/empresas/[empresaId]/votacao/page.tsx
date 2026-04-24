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
  const [toast, setToast] = useState('');

  function flash(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000); }

  async function refresh() {
    const r = await loadResultadosVotacao(empresaId);
    setData(r);
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

  async function handleAprovar(cargo: string, ranking: any[]) {
    const top5 = ranking.slice(0, 5).map((r: any) => r.nome);
    if (top5.length < 5) { flash(`Menos de 5 competências votadas para ${cargo}`); return; }
    setAprovando(cargo);
    const r = await aprovarTop5Votacao(empresaId, cargo, top5);
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
      <div className={`rounded-xl p-4 mb-6 border ${data?.votacaoAtiva ? 'border-green-400/20 bg-green-400/5' : 'border-white/[0.06] bg-white/[0.02]'}`}>
        <div className="flex items-center gap-2">
          {data?.votacaoAtiva ? <CheckCircle size={16} className="text-green-400" /> : <AlertCircle size={16} className="text-gray-500" />}
          <span className={`text-sm font-bold ${data?.votacaoAtiva ? 'text-green-400' : 'text-gray-500'}`}>
            {data?.votacaoAtiva ? 'Votação aberta — colaboradores podem votar' : 'Votação fechada'}
          </span>
        </div>
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
                  {dados.votaram > 0 && dados.ranking.length >= 5 && (
                    <button onClick={() => handleAprovar(cargo, dados.ranking)}
                      disabled={aprovando === cargo}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold text-green-400 border border-green-400/30 hover:bg-green-400/10 disabled:opacity-50">
                      {aprovando === cargo ? <Loader2 size={11} className="animate-spin" /> : <Trophy size={11} />}
                      Aprovar Top 5
                    </button>
                  )}
                </div>
              </div>

              {/* Ranking */}
              {dados.ranking.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-gray-500">Nenhum voto recebido ainda</div>
              ) : (
                <div className="px-4 py-3 space-y-1.5">
                  {dados.ranking.map((r: any, idx: number) => {
                    const isTop5 = idx < 5;
                    return (
                      <div key={r.nome} className={`flex items-center gap-3 px-3 py-2 rounded-lg ${
                        isTop5 ? 'border border-cyan-400/15' : ''
                      }`} style={{ background: isTop5 ? 'rgba(52,197,204,0.04)' : '#091D35' }}>
                        <span className="w-8 text-center text-sm shrink-0">
                          {idx < 3 ? MEDAL[idx] : <span className="text-[10px] text-gray-500">{idx + 1}º</span>}
                        </span>
                        <span className={`flex-1 text-sm ${isTop5 ? 'font-bold text-white' : 'text-gray-400'}`}>{r.nome}</span>
                        <div className="flex items-center gap-3 shrink-0 text-[10px]">
                          <span className="text-cyan-400 font-bold">{r.pontos} pts</span>
                          <span className="text-gray-500">{r.votos} voto{r.votos !== 1 ? 's' : ''}</span>
                        </div>
                        {isTop5 && (
                          <div className="w-24 h-1.5 rounded-full overflow-hidden bg-white/5 shrink-0">
                            <div className="h-full rounded-full bg-cyan-400" style={{ width: `${(r.pontos / (dados.votaram * 5)) * 100}%` }} />
                          </div>
                        )}
                      </div>
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
