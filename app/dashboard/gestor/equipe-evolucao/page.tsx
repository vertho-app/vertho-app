'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase-browser';
import { ArrowLeft, Loader2, Users, TrendingUp, TrendingDown, Minus, ChevronRight, Clock, X, FileDown, Download } from 'lucide-react';
import { PageContainer, GlassCard } from '@/components/page-shell';
import { listarEquipeEvolucao, loadLideradoConcluida, listarCheckpointsPendentes, salvarCheckpointGestor } from './actions';

const STATUS_CFG = {
  em_andamento:         { cor: 'cyan',    icon: Clock,        label: 'Em andamento' },
  evolucao_confirmada:  { cor: 'emerald', icon: TrendingUp,   label: 'Evolução confirmada' },
  evolucao_parcial:     { cor: 'amber',   icon: TrendingUp,   label: 'Evolução parcial' },
  estagnacao:           { cor: 'gray',    icon: Minus,        label: 'Estagnação' },
  regressao:            { cor: 'red',     icon: TrendingDown, label: 'Regressão' },
  sem_trilha:           { cor: 'gray',    icon: X,            label: 'Sem trilha' },
  arquivada:            { cor: 'gray',    icon: X,            label: 'Arquivada' },
};

export default function EquipeEvolucaoPage() {
  const router = useRouter();
  const sb = getSupabase();
  const [rows, setRows] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [ordem, setOrdem] = useState('delta_desc');
  const [detalhe, setDetalhe] = useState(null);
  const [loadingDetalhe, setLoadingDetalhe] = useState(false);
  const [checkpoints, setCheckpoints] = useState([]);

  async function carregar() {
    setLoading(true);
    const [r, cp] = await Promise.all([
      listarEquipeEvolucao(),
      listarCheckpointsPendentes(),
    ]);
    if (r.error) setError(r.error);
    else { setRows(r.rows); setResumo(r.resumo); }
    if (cp.ok) setCheckpoints(cp.rows);
    setLoading(false);
  }

  async function handleCheckpoint(cp, avaliacao) {
    const obs = avaliacao !== 'evoluindo' ? prompt(`Por que ${cp.colab} está ${avaliacao}? (opcional)`) : null;
    if (avaliacao !== 'evoluindo' && obs === null) return; // cancelou
    const r = await salvarCheckpointGestor({
      trilhaId: cp.trilhaId, semana: cp.semana, avaliacao, observacao: obs || null,
    });
    if (r.error) alert(r.error);
    else await carregar();
  }

  useEffect(() => { carregar(); }, []);

  async function abrir(colabEmail) {
    setLoadingDetalhe(true);
    setDetalhe({ colabEmail });
    const r = await loadLideradoConcluida(colabEmail);
    setLoadingDetalhe(false);
    if (r.error) { alert(r.error); setDetalhe(null); return; }
    setDetalhe({ ...r, colabEmail });
  }

  const filtrados = useMemo(() => {
    let list = filtro === 'todos' ? rows : rows.filter(r => r.status === filtro);
    list = [...list].sort((a, b) => {
      if (ordem === 'delta_desc') return (b.delta ?? -999) - (a.delta ?? -999);
      if (ordem === 'delta_asc') return (a.delta ?? 999) - (b.delta ?? 999);
      if (ordem === 'nome') return (a.colab || '').localeCompare(b.colab || '');
      return 0;
    });
    return list;
  }, [rows, filtro, ordem]);

  if (error) return <Center><p className="text-red-400">{error}</p></Center>;

  return (
    <PageContainer>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <button onClick={() => router.push('/dashboard')} className="flex items-center gap-2 text-xs text-gray-400 hover:text-cyan-400">
          <ArrowLeft size={14} /> Dashboard
        </button>
        <button onClick={async () => {
          const { data: { session } } = await sb.auth.getSession();
          const res = await fetch('/api/gestor/plenaria/pdf', {
            headers: { Authorization: `Bearer ${session?.access_token}` },
          });
          if (!res.ok) { alert('Erro ao gerar plenária'); return; }
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'plenaria-equipe.pdf';
          a.click();
          URL.revokeObjectURL(url);
        }} className="flex items-center gap-2 text-xs text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10 rounded-full px-3 py-1.5">
          <FileDown size={12} /> Plenária PDF
        </button>
      </div>

      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Users size={20} className="text-cyan-400" />
          <h1 className="text-2xl font-bold text-white">Evolução da equipe</h1>
        </div>
        <p className="text-sm text-gray-400">Visão consolidada do desenvolvimento dos liderados.</p>
      </div>

      {resumo && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 mb-6">
          <Card label="Total" valor={resumo.total} cor="text-white" />
          <Card label="Em andamento" valor={resumo.emAndamento} cor="text-cyan-300" />
          <Card label="Confirmadas" valor={resumo.evolucaoConfirmada} cor="text-emerald-300" />
          <Card label="Parciais" valor={resumo.evolucaoParcial} cor="text-amber-300" />
          <Card label="Estagnação" valor={resumo.estagnacao} cor="text-gray-400" />
          <Card label="Regressão" valor={resumo.regressao} cor="text-red-400" />
        </div>
      )}

      {checkpoints.length > 0 && (
        <div className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/[0.05] p-4">
          <p className="text-xs uppercase tracking-widest text-amber-400 font-bold mb-3">
            ⚠ Checkpoints pendentes ({checkpoints.length})
          </p>
          <div className="space-y-2">
            {checkpoints.map((cp, i) => (
              <div key={i} className="flex items-center gap-3 flex-wrap bg-white/[0.02] rounded-lg p-3 border border-amber-500/20">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">{cp.colab}</p>
                  <p className="text-[11px] text-gray-400">Sem {cp.semana} · {cp.competencia}</p>
                </div>
                <div className="flex gap-1 flex-wrap">
                  <button onClick={() => handleCheckpoint(cp, 'evoluindo')}
                    className="text-[10px] px-2 py-1 rounded bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 hover:bg-emerald-500/25">Evoluindo</button>
                  <button onClick={() => handleCheckpoint(cp, 'estagnado')}
                    className="text-[10px] px-2 py-1 rounded bg-amber-500/15 border border-amber-400/30 text-amber-300 hover:bg-amber-500/25">Estagnado</button>
                  <button onClick={() => handleCheckpoint(cp, 'regredindo')}
                    className="text-[10px] px-2 py-1 rounded bg-red-500/15 border border-red-400/30 text-red-300 hover:bg-red-500/25">Regredindo</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <select value={filtro} onChange={e => setFiltro(e.target.value)}
          className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white">
          <option value="todos" className="bg-[#0d1426]">Todos</option>
          {Object.entries(STATUS_CFG).map(([k, c]) => (
            <option key={k} value={k} className="bg-[#0d1426]">{c.label}</option>
          ))}
        </select>
        <select value={ordem} onChange={e => setOrdem(e.target.value)}
          className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white">
          <option value="delta_desc" className="bg-[#0d1426]">Maior delta</option>
          <option value="delta_asc" className="bg-[#0d1426]">Menor delta</option>
          <option value="nome" className="bg-[#0d1426]">Nome A-Z</option>
        </select>
      </div>

      {loading ? (
        <Center><Loader2 size={28} className="animate-spin text-cyan-400" /></Center>
      ) : filtrados.length === 0 ? (
        <p className="text-center py-12 text-sm text-gray-500">Nenhum liderado encontrado.</p>
      ) : (
        <div className="space-y-2">
          {filtrados.map(r => {
            const cfg = STATUS_CFG[r.status] || STATUS_CFG.sem_trilha;
            const Icon = cfg.icon;
            const canOpen = r.status !== 'sem_trilha' && r.statusTrilha === 'concluida';
            return (
              <button key={r.colaboradorId}
                onClick={() => canOpen && abrir(r.colabEmail)}
                disabled={!canOpen}
                className={`w-full text-left rounded-xl border border-${cfg.cor}-500/20 bg-${cfg.cor}-500/[0.03] p-4 ${canOpen ? 'hover:bg-white/[0.03]' : 'opacity-70 cursor-not-allowed'}`}>
                <div className="flex items-center gap-3 flex-wrap">
                  <Icon size={18} className={`text-${cfg.cor}-400 shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-white truncate">{r.colab}</p>
                      <span className="text-[10px] text-gray-400">· {r.cargo}</span>
                    </div>
                    <p className="text-[11px] text-gray-400 truncate">
                      {r.competencia ? <>{r.competencia} · T{r.temporada}</> : 'sem trilha ativa'}
                      {r.delta != null && (
                        <>
                          {' · '}
                          <span className={`text-${cfg.cor}-400 font-bold`}>
                            {r.mediaPre.toFixed(1)} → {r.mediaPos.toFixed(1)} ({r.delta > 0 ? '+' : ''}{r.delta.toFixed(1)})
                          </span>
                        </>
                      )}
                    </p>
                    <p className={`text-[10px] uppercase tracking-widest text-${cfg.cor}-400 mt-0.5`}>{cfg.label}</p>
                  </div>
                  {canOpen && <ChevronRight size={14} className="text-gray-500" />}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {detalhe && (
        <DetalheModal data={detalhe} loading={loadingDetalhe} onClose={() => setDetalhe(null)} sb={sb} />
      )}
    </PageContainer>
  );
}

function Center({ children }) {
  return <div className="min-h-[60vh] flex items-center justify-center">{children}</div>;
}

function Card({ label, valor, cor }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <p className="text-[10px] uppercase text-gray-500 tracking-widest">{label}</p>
      <p className={`text-2xl font-extrabold ${cor}`}>{valor}</p>
    </div>
  );
}

function DetalheModal({ data, loading, onClose, sb }) {
  const report = data?.evolutionReport;
  const descritores = report?.descritores || [];

  async function baixarPdf() {
    const { data: { session } } = await sb.auth.getSession();
    const res = await fetch(`/api/temporada/concluida/pdf?email=${encodeURIComponent(data.colabEmail)}`, {
      headers: { Authorization: `Bearer ${session?.access_token}` },
    });
    if (!res.ok) { alert('Erro ao gerar PDF'); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `temporada-${data.trilha?.numeroTemporada || ''}-${(data.colab?.nome || 'colab').replace(/\s+/g, '-')}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="max-w-3xl w-full bg-[#0a0e1a] border border-white/10 rounded-2xl my-8" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 flex items-center justify-between p-4 border-b border-white/10 bg-[#0a0e1a] rounded-t-2xl">
          <h2 className="text-sm font-bold text-white">Detalhe do liderado</h2>
          <div className="flex gap-2">
            {data?.colab && (
              <button onClick={baixarPdf}
                className="flex items-center gap-1 text-[10px] text-cyan-400 border border-cyan-400/30 rounded-full px-2 py-1 hover:bg-cyan-400/10">
                <Download size={10} /> PDF
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={18} /></button>
          </div>
        </div>
        {loading || !data?.colab ? (
          <div className="py-12 flex justify-center"><Loader2 size={24} className="animate-spin text-cyan-400" /></div>
        ) : (
          <div className="p-5 space-y-4 text-sm">
            <section>
              <p className="text-[10px] uppercase tracking-widest text-gray-500">Contexto</p>
              <p className="text-white">{data.colab.nome} ({data.colab.cargo})</p>
              <p className="text-xs text-gray-400">Competência: <span className="text-cyan-400">{data.trilha.competencia}</span> · Temporada {data.trilha.numeroTemporada}</p>
            </section>
            {report?.insight_geral && (
              <section>
                <p className="text-[10px] uppercase tracking-widest text-cyan-400 mb-1">Insight geral</p>
                <p className="text-xs text-gray-200 italic border-l-2 border-cyan-500/40 pl-3">{report.insight_geral}</p>
              </section>
            )}
            <section>
              <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Descritor a descritor</p>
              <div className="space-y-1.5">
                {descritores.map((d, i) => {
                  const cfg = STATUS_CFG[d.convergencia] || STATUS_CFG.estagnacao;
                  return (
                    <div key={i} className={`p-2 rounded border border-${cfg.cor}-500/20`}>
                      <div className="flex justify-between text-xs">
                        <p className="font-bold text-white truncate">{d.descritor}</p>
                        <span className={`text-${cfg.cor}-400 font-bold shrink-0`}>
                          {d.nota_pre} → {d.nota_pos} ({(d.nota_pos - d.nota_pre).toFixed(1)})
                        </span>
                      </div>
                      {d.depois && <p className="text-[10px] text-gray-400 mt-1">{d.depois}</p>}
                    </div>
                  );
                })}
              </div>
            </section>
            {report?.proximo_passo && (
              <section>
                <p className="text-[10px] uppercase tracking-widest text-emerald-400 mb-1">Recomendação de acompanhamento</p>
                <p className="text-xs text-gray-200">{report.proximo_passo}</p>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
