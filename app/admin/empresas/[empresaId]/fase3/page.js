'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Loader2, GraduationCap, User, BookOpen, RefreshCw,
  ChevronDown, CheckCircle, Clock, AlertTriangle, Users, BarChart3,
  ExternalLink, MessageSquare,
} from 'lucide-react';
import { loadProgressoCapacitacao, syncProgressoMoodle } from '@/actions/capacitacao';

const STATUS_MAP = {
  aguardando_inicio: { label: 'Aguardando', color: 'text-gray-400', bg: 'bg-gray-400/15' },
  em_andamento: { label: 'Em andamento', color: 'text-cyan-400', bg: 'bg-cyan-400/15' },
  concluido: { label: 'Concluído', color: 'text-green-400', bg: 'bg-green-400/15' },
};

function ProgressBar({ pct, size = 'sm' }) {
  const h = size === 'sm' ? 'h-1.5' : 'h-2.5';
  const color = pct >= 80 ? 'bg-green-400' : pct >= 40 ? 'bg-cyan-400' : pct > 0 ? 'bg-amber-400' : 'bg-gray-600';
  return (
    <div className={`w-full ${h} rounded-full bg-white/[0.06] overflow-hidden`}>
      <div className={`${h} rounded-full ${color} transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

export default function Fase3Page({ params }) {
  const { empresaId } = use(params);
  const router = useRouter();

  const [data, setData] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [metaColetiva, setMetaColetiva] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [filtroGestor, setFiltroGestor] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [toast, setToast] = useState(null);
  function flash(msg) { setToast(msg); setTimeout(() => setToast(null), 3000); }

  async function refresh() {
    const r = await loadProgressoCapacitacao(empresaId);
    if (r.success) {
      setData(r.data || []);
      setResumo(r.resumo);
      setMetaColetiva(r.metaColetiva || []);
    }
    setLoading(false);
  }

  async function handleSync() {
    setSyncing(true);
    flash('Sincronizando com Moodle...');
    const r = await syncProgressoMoodle(empresaId);
    flash(r.success ? r.message : 'Erro: ' + r.error);
    setSyncing(false);
    refresh();
  }

  useEffect(() => { refresh(); }, [empresaId]);

  const gestores = [...new Set(data.map(d => d.gestor || 'Sem gestor'))].sort();
  const filtered = data.filter(d => {
    if (filtroGestor && (d.gestor || 'Sem gestor') !== filtroGestor) return false;
    if (filtroStatus && d.status !== filtroStatus) return false;
    return true;
  });

  if (loading) return <div className="flex items-center justify-center h-dvh"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-6 sm:px-6" style={{ minHeight: '100dvh' }}>
      {toast && <div className="fixed top-4 right-4 z-50 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold shadow-lg">{toast}</div>}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push(`/admin/empresas/${empresaId}`)}
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-white/10 text-gray-400 hover:text-white transition-colors">
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <GraduationCap size={20} className="text-green-400" /> Fase 3 — Capacitação
            </h1>
            <p className="text-xs text-gray-500">Acompanhamento de trilhas e progresso no Moodle</p>
          </div>
        </div>
        <button onClick={handleSync} disabled={syncing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10 disabled:opacity-50 transition-all">
          {syncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          Sync Moodle
        </button>
      </div>

      {/* Resumo */}
      {resumo && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
          {[
            { label: 'Total', value: resumo.total, icon: Users },
            { label: 'Provisionados', value: resumo.provisionados, icon: BookOpen },
            { label: 'Em andamento', value: resumo.em_andamento, icon: Clock, color: 'text-cyan-400' },
            { label: 'Concluídos', value: resumo.concluido, icon: CheckCircle, color: 'text-green-400' },
            { label: 'Progresso médio', value: `${resumo.pct_medio}%`, icon: BarChart3, color: 'text-amber-400' },
            { label: 'Semana média', value: `${resumo.semana_media}/${resumo.total_semanas}`, icon: GraduationCap },
          ].map((s, i) => (
            <div key={i} className="p-3 rounded-xl border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
              <div className="flex items-center gap-1.5 mb-1">
                <s.icon size={12} className={s.color || 'text-gray-500'} />
                <span className="text-[9px] text-gray-500 uppercase tracking-widest">{s.label}</span>
              </div>
              <span className={`text-lg font-bold ${s.color || 'text-white'}`}>{s.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Meta Coletiva por Gestor */}
      {metaColetiva.length > 0 && (
        <div className="mb-6 p-4 rounded-xl border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
          <p className="text-[9px] font-bold text-green-400 uppercase tracking-widest mb-3">Meta Coletiva por Gestor</p>
          <div className="space-y-2">
            {metaColetiva.map(m => (
              <div key={m.gestor} className="flex items-center gap-3">
                <span className="text-xs text-white font-medium w-40 shrink-0 truncate">{m.gestor}</span>
                <div className="flex-1">
                  <ProgressBar pct={m.pct} size="sm" />
                </div>
                <span className="text-[10px] text-gray-400 w-24 text-right shrink-0">
                  {m.acima75}/{m.total} ({m.pct}%) ≥75%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex items-center gap-3 mb-5">
        <select value={filtroGestor} onChange={e => setFiltroGestor(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-xs text-white border border-white/10 outline-none" style={{ background: '#091D35' }}>
          <option value="">Todos os gestores</option>
          {gestores.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-xs text-white border border-white/10 outline-none" style={{ background: '#091D35' }}>
          <option value="">Todos os status</option>
          <option value="aguardando_inicio">Aguardando</option>
          <option value="em_andamento">Em andamento</option>
          <option value="concluido">Concluído</option>
        </select>
        <span className="text-[10px] text-gray-500 ml-auto">{filtered.length} de {data.length}</span>
      </div>

      {/* Lista de Colaboradores */}
      {data.length === 0 ? (
        <div className="text-center py-12">
          <GraduationCap size={32} className="text-gray-600 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Nenhum progresso encontrado. Rode "Criar Estrutura" e "Provisionar Moodle" na pipeline.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(p => {
            const isOpen = openId === p.id;
            const st = STATUS_MAP[p.status] || STATUS_MAP.aguardando_inicio;
            const cursos = Array.isArray(p.cursos_progresso) ? p.cursos_progresso : [];

            return (
              <div key={p.id} className="rounded-xl border border-white/[0.06] overflow-hidden" style={{ background: '#0F2A4A' }}>
                {/* Header */}
                <button onClick={() => setOpenId(isOpen ? null : p.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors">
                  <User size={14} className="text-cyan-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-white">{p.nome}</span>
                      <span className="text-[10px] text-gray-500">{p.cargo}</span>
                      {p.competencia_foco && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-400 font-bold">
                          {p.competencia_foco}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 max-w-[200px]">
                        <ProgressBar pct={p.pct_conclusao} />
                      </div>
                      <span className="text-[10px] text-gray-500">{p.pct_conclusao}%</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-gray-500">S{p.semana_atual}/14</span>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${st.bg} ${st.color}`}>{st.label}</span>
                    {p.moodle_ok && <BookOpen size={12} className="text-green-400" title="Moodle OK" />}
                    {!p.moodle_ok && <AlertTriangle size={12} className="text-amber-400" title="Sem Moodle" />}
                    <ChevronDown size={14} className={`text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </div>
                </button>

                {/* Detalhes */}
                {isOpen && (
                  <div className="px-4 pb-4 border-t border-white/[0.04] space-y-3">
                    {/* Info */}
                    <div className="flex flex-wrap gap-3 mt-3 text-[10px] text-gray-500">
                      {p.gestor && <span>Gestor: <span className="text-white">{p.gestor}</span></span>}
                      {p.iniciado_em && <span>Início: <span className="text-white">{new Date(p.iniciado_em).toLocaleDateString('pt-BR')}</span></span>}
                      {p.ultimo_sync && <span>Último sync: <span className="text-white">{new Date(p.ultimo_sync).toLocaleDateString('pt-BR')}</span></span>}
                      {p.nudge_enviado_em && <span className="text-amber-400">Nudge: {new Date(p.nudge_enviado_em).toLocaleDateString('pt-BR')}</span>}
                    </div>

                    {/* Cursos */}
                    <div>
                      <p className="text-[9px] font-bold text-purple-400 uppercase tracking-widest mb-2">Cursos da Trilha</p>
                      {cursos.length === 0 ? (
                        <p className="text-xs text-gray-500 italic">Nenhum curso na trilha</p>
                      ) : (
                        <div className="space-y-1.5">
                          {cursos.map((c, i) => (
                            <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{ background: '#091D35' }}>
                              {c.concluido ? (
                                <CheckCircle size={14} className="text-green-400 shrink-0" />
                              ) : (
                                <Clock size={14} className="text-gray-500 shrink-0" />
                              )}
                              <span className="text-xs text-gray-300 flex-1 min-w-0 truncate">{c.nome}</span>
                              <div className="w-20 shrink-0">
                                <ProgressBar pct={c.pct || 0} />
                              </div>
                              <span className={`text-[10px] font-bold w-10 text-right shrink-0 ${
                                (c.pct || 0) >= 80 ? 'text-green-400' : (c.pct || 0) > 0 ? 'text-cyan-400' : 'text-gray-600'
                              }`}>{c.pct || 0}%</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
