'use client';

import { useState, useEffect, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft, Loader2, Bot, ChevronDown, CheckCircle, AlertTriangle,
  User, FileText, Filter, RefreshCw, BookOpen, ExternalLink
} from 'lucide-react';
import { loadRespostasAvaliadas, reavaliarResposta, rechecarResposta } from '@/actions/fase3';
import { loadTrilhas } from '@/actions/trilhas-load';

const NIVEL_COLORS = {
  1: 'text-red-400', 2: 'text-amber-400', 3: 'text-cyan-400', 4: 'text-green-400',
};

export default function Fase2Page({ params }) {
  const { empresaId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();

  const [tab, setTab] = useState(searchParams.get('tab') || 'diagnostico');
  const [respostas, setRespostas] = useState([]);
  const [trilhas, setTrilhas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);
  const [filtroColab, setFiltroColab] = useState('');
  const [filtroCargo, setFiltroCargo] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [actionId, setActionId] = useState(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const [toast, setToast] = useState(null);
  function flash(msg) { setToast(msg); setTimeout(() => setToast(null), 3000); }

  async function handleRevisarTodos() {
    const paraRevisar = respostas.filter(r => r.status_ia4 === 'revisar');
    if (!paraRevisar.length) { flash('Nenhuma avaliação para revisar'); return; }
    setBatchRunning(true);
    flash(`Re-avaliando ${paraRevisar.length} respostas...`);
    let ok = 0, erros = 0;
    for (const r of paraRevisar) {
      const r1 = await reavaliarResposta(r.id);
      if (r1.success) {
        await rechecarResposta(r.id);
        ok++;
      } else { erros++; }
    }
    setBatchRunning(false);
    flash(`${ok} re-avaliadas${erros ? `, ${erros} erros` : ''}`);
    refresh();
  }

  async function refresh() {
    const [d, t] = await Promise.all([
      loadRespostasAvaliadas(empresaId),
      loadTrilhas(empresaId),
    ]);
    setRespostas(d);
    setTrilhas(t);
    setLoading(false);
  }

  useEffect(() => { refresh(); }, [empresaId]);

  const colaboradores = [...new Set(respostas.map(r => r.colaborador_nome))].sort();
  const cargos = [...new Set(respostas.map(r => r.cargo).filter(Boolean))].sort();
  const filtered = respostas.filter(r => {
    if (filtroColab && r.colaborador_nome !== filtroColab) return false;
    if (filtroCargo && r.cargo !== filtroCargo) return false;
    if (filtroStatus === 'avaliado' && !r.avaliacao_ia) return false;
    if (filtroStatus === 'pendente' && r.avaliacao_ia) return false;
    if (filtroStatus === 'aprovado' && r.status_ia4 !== 'aprovado') return false;
    if (filtroStatus === 'revisar' && r.status_ia4 !== 'revisar') return false;
    return true;
  });

  // Agrupar por colaborador
  const porColab = {};
  filtered.forEach(r => {
    if (!porColab[r.colaborador_nome]) porColab[r.colaborador_nome] = { cargo: r.colaborador_cargo, items: [] };
    porColab[r.colaborador_nome].items.push(r);
  });

  const stats = {
    total: respostas.length,
    avaliadas: respostas.filter(r => r.avaliacao_ia).length,
    aprovadas: respostas.filter(r => r.status_ia4 === 'aprovado').length,
    revisar: respostas.filter(r => r.status_ia4 === 'revisar').length,
    pendentes: respostas.filter(r => !r.avaliacao_ia).length,
  };

  if (loading) return <div className="flex items-center justify-center h-dvh"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-6 sm:px-6" style={{ minHeight: '100dvh' }}>
      {toast && <div className="fixed top-4 right-4 z-50 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold shadow-lg">{toast}</div>}

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push(`/admin/empresas/${empresaId}`)}
          className="w-9 h-9 flex items-center justify-center rounded-lg border border-white/10 text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Bot size={20} className="text-red-400" /> Fase 2 — Diagnóstico
          </h1>
          <p className="text-xs text-gray-500">Respostas, avaliações IA4 e check</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-5 border-b border-white/[0.06]">
        {[
          { id: 'diagnostico', label: 'Diagnóstico', icon: <Bot size={14} /> },
          { id: 'trilhas', label: `Trilhas (${trilhas.length})`, icon: <BookOpen size={14} /> },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold transition-all border-b-2 -mb-px ${
              tab === t.id ? 'text-cyan-400 border-cyan-400' : 'text-gray-500 border-transparent hover:text-gray-300'
            }`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === 'diagnostico' && <>
      {/* Stats */}
      <div className="flex items-center gap-3 mb-4 flex-wrap text-[10px]">
        <span className="text-gray-400">Total: <span className="text-white font-bold">{stats.total}</span></span>
        <span className="text-gray-400">Avaliadas: <span className="text-cyan-400 font-bold">{stats.avaliadas}</span></span>
        {stats.aprovadas > 0 && <span className="bg-green-400/15 text-green-400 px-1.5 py-0.5 rounded font-bold">{stats.aprovadas} aprovadas</span>}
        {stats.revisar > 0 && <span className="bg-amber-400/15 text-amber-400 px-1.5 py-0.5 rounded font-bold">{stats.revisar} revisar</span>}
        {stats.pendentes > 0 && <span className="bg-gray-400/15 text-gray-400 px-1.5 py-0.5 rounded font-bold">{stats.pendentes} pendentes</span>}
        {stats.revisar > 0 && (
          <button onClick={handleRevisarTodos} disabled={batchRunning}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold text-amber-400 border border-amber-400/30 hover:bg-amber-400/10 transition-all disabled:opacity-50">
            {batchRunning ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
            Re-avaliar todos ({stats.revisar})
          </button>
        )}
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 mb-5">
        <Filter size={14} className="text-gray-500" />
        <select value={filtroCargo} onChange={e => setFiltroCargo(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-xs text-white border border-white/10 outline-none" style={{ background: '#091D35' }}>
          <option value="">Todos os cargos</option>
          {cargos.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filtroColab} onChange={e => setFiltroColab(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-xs text-white border border-white/10 outline-none" style={{ background: '#091D35' }}>
          <option value="">Todos os colaboradores</option>
          {colaboradores.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-xs text-white border border-white/10 outline-none" style={{ background: '#091D35' }}>
          <option value="">Todos os status</option>
          <option value="pendente">Pendente</option>
          <option value="avaliado">Avaliado</option>
          <option value="aprovado">Aprovado</option>
          <option value="revisar">Revisar</option>
        </select>
      </div>

      {/* Lista */}
      {respostas.length === 0 ? (
        <div className="text-center py-12">
          <FileText size={32} className="text-gray-600 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Nenhuma resposta encontrada. Rode "Simular Respostas" primeiro.</p>
        </div>
      ) : Object.entries(porColab).map(([nome, { cargo, items }]) => (
        <div key={nome} className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <User size={14} className="text-cyan-400" />
            <h2 className="text-sm font-bold text-white">{nome}</h2>
            <span className="text-[10px] text-gray-500">{cargo} · {items.length} respostas</span>
          </div>

          <div className="space-y-2">
            {items.map(r => {
              const isOpen = openId === r.id;
              const avaliacao = typeof r.avaliacao_ia === 'string' ? JSON.parse(r.avaliacao_ia) : r.avaliacao_ia;
              const check = typeof r.payload_ia4 === 'string' ? JSON.parse(r.payload_ia4) : r.payload_ia4;
              const perguntas = Array.isArray(r.cenario_perguntas) ? r.cenario_perguntas : [];

              return (
                <div key={r.id} className={`rounded-xl border overflow-hidden ${
                  r.status_ia4 === 'aprovado' ? 'border-green-400/20' :
                  r.status_ia4 === 'revisar' ? 'border-amber-400/20' :
                  r.avaliacao_ia ? 'border-cyan-400/10' : 'border-white/[0.06]'
                }`} style={{ background: '#0F2A4A' }}>

                  {/* Header */}
                  <button onClick={() => setOpenId(isOpen ? null : r.id)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.02] transition-colors">
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      {r.status_ia4 === 'aprovado' && <CheckCircle size={14} className="text-green-400 shrink-0" />}
                      {r.status_ia4 === 'revisar' && <AlertTriangle size={14} className="text-amber-400 shrink-0" />}
                      <span className="text-xs font-bold text-white">{r.competencia_nome}</span>
                      {r.competencia_cod && <span className="text-[9px] font-mono text-cyan-400/60">{r.competencia_cod}</span>}
                      {r.nivel_simulado && <span className="text-[9px] text-gray-500">Simulado N{r.nivel_simulado}</span>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {avaliacao && (
                        <div className="flex items-center gap-1.5">
                          <span className={`text-sm font-bold ${NIVEL_COLORS[avaliacao.consolidacao?.nivel_geral || avaliacao.nivel_geral] || 'text-gray-400'}`}>
                            N{avaliacao.consolidacao?.nivel_geral || avaliacao.nivel_geral || '?'}
                          </span>
                          {(avaliacao.consolidacao?.media_descritores || avaliacao.nota_decimal) && (
                            <span className="text-[10px] text-gray-500">
                              ({(avaliacao.consolidacao?.media_descritores || avaliacao.nota_decimal || 0).toFixed(2)})
                            </span>
                          )}
                        </div>
                      )}
                      {check?.nota !== undefined && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          check.nota >= 90 ? 'bg-green-400/15 text-green-400' : 'bg-amber-400/15 text-amber-400'
                        }`}>Check {check.nota}pts</span>
                      )}
                      {!avaliacao && <span className="text-[9px] text-gray-600">Pendente</span>}
                      <ChevronDown size={14} className={`text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4 border-t border-white/[0.04] space-y-4">
                      {/* Respostas R1-R4 */}
                      <div className="mt-3">
                        <p className="text-[9px] font-bold text-cyan-400 uppercase tracking-widest mb-2">Respostas do Colaborador</p>
                        <div className="space-y-2">
                          {[r.r1, r.r2, r.r3, r.r4].map((resp, i) => (
                            <div key={i} className="p-3 rounded-lg" style={{ background: '#091D35' }}>
                              <p className="text-[9px] font-bold text-gray-500 mb-1">
                                P{i + 1}: {perguntas[i]?.texto || ''}
                              </p>
                              <p className="text-xs text-gray-300 leading-relaxed">{resp || '(sem resposta)'}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Avaliação IA4 */}
                      {avaliacao && (() => {
                        const nGeral = avaliacao.consolidacao?.nivel_geral || avaliacao.nivel_geral || r.nivel_ia4;
                        const nDecimal = avaliacao.consolidacao?.media_descritores || avaliacao.nota_decimal || r.nota_ia4;
                        const confianca = avaliacao.consolidacao?.confianca_geral;
                        const gap = avaliacao.consolidacao?.gap;
                        const travas = avaliacao.consolidacao?.travas_aplicadas;
                        const porResp = avaliacao.avaliacao_por_resposta;
                        const pontos = avaliacao.descritores_destaque || {};
                        const feedback = avaliacao.feedback;
                        const porPergunta = avaliacao.por_pergunta;

                        return (
                        <div>
                          <p className="text-[9px] font-bold text-purple-400 uppercase tracking-widest mb-2">Avaliação IA4</p>
                          <div className="p-3 rounded-lg space-y-2" style={{ background: '#091D35' }}>
                            <div className="flex items-center gap-3">
                              <span className={`text-lg font-bold ${NIVEL_COLORS[nGeral] || 'text-gray-400'}`}>
                                N{nGeral || '?'}
                              </span>
                              {nDecimal && (
                                <span className="text-xs text-gray-500">({Number(nDecimal).toFixed(2)})</span>
                              )}
                              {gap != null && gap > 0 && <span className="text-[9px] bg-red-400/15 text-red-400 px-1.5 py-0.5 rounded">GAP: {gap}</span>}
                              {confianca != null && <span className="text-[9px] text-gray-600">Confiança: {confianca}%</span>}
                            </div>

                            {/* Travas */}
                            {travas?.length > 0 && travas[0] !== 'Nenhuma' && travas[0] !== 'Nenhuma trava aplicada' && (
                              <div className="text-[9px] text-amber-400">Travas: {travas.join('; ')}</div>
                            )}

                            {/* Avaliação por resposta (formato GAS detalhado) */}
                            {porResp && Object.entries(porResp).map(([key, val]) => (
                              val?.descritores_avaliados?.length > 0 && (
                                <div key={key}>
                                  <p className="text-[9px] font-bold text-gray-500">{key}:</p>
                                  {val.descritores_avaliados.map((d, i) => (
                                    <div key={i} className="flex items-start gap-2 text-[10px] ml-2">
                                      <span className={`font-bold shrink-0 ${NIVEL_COLORS[Math.floor(d.nota_decimal || d.nivel)] || 'text-gray-400'}`}>
                                        D{d.numero}: {d.nota_decimal?.toFixed(2) || `N${d.nivel}`}
                                      </span>
                                      <span className="text-gray-500 truncate">{d.evidencia || d.nome || ''}</span>
                                      {d.confianca && <span className="text-gray-600 shrink-0">{d.confianca}%</span>}
                                    </div>
                                  ))}
                                </div>
                              )
                            ))}

                            {/* Por pergunta (formato simplificado) */}
                            {!porResp && porPergunta?.length > 0 && (
                              <div className="space-y-1">
                                {avaliacao.por_pergunta.map((p, i) => (
                                  <div key={i} className="flex items-start gap-2 text-[10px]">
                                    <span className={`font-bold shrink-0 ${NIVEL_COLORS[p.nivel] || 'text-gray-400'}`}>P{p.pergunta}: N{p.nivel}</span>
                                    <span className="text-gray-500">{p.justificativa}</span>
                                  </div>
                                ))}
                              </div>
                            )}

                            {(pontos.pontos_fortes || avaliacao.pontos_fortes)?.length > 0 && (
                              <div>
                                <p className="text-[9px] text-green-400 font-bold">Pontos fortes:</p>
                                {(pontos.pontos_fortes || avaliacao.pontos_fortes).map((p, i) => (
                                  <p key={i} className="text-[10px] text-gray-400">• {typeof p === 'string' ? p : `${p.descritor || p.nome}: ${p.evidencia_resumida || ''}`}</p>
                                ))}
                              </div>
                            )}

                            {(pontos.gaps_prioritarios || avaliacao.pontos_desenvolvimento)?.length > 0 && (
                              <div>
                                <p className="text-[9px] text-amber-400 font-bold">Gaps / Desenvolvimento:</p>
                                {(pontos.gaps_prioritarios || avaliacao.pontos_desenvolvimento).map((p, i) => (
                                  <p key={i} className="text-[10px] text-gray-400">• {typeof p === 'string' ? p : `${p.descritor || p.nome}: ${p.o_que_faltou || ''}`}</p>
                                ))}
                              </div>
                            )}

                            {feedback && (
                              <p className="text-[10px] text-gray-400 pt-1 border-t border-white/[0.04]">{feedback}</p>
                            )}
                          </div>
                        </div>
                        );
                      })()}

                      {/* Check */}
                      {check && (
                        <div>
                          <p className="text-[9px] font-bold text-amber-400 uppercase tracking-widest mb-2">Check (Auditoria)</p>
                          <div className={`p-3 rounded-lg border ${
                            check.nota >= 90 ? 'border-green-400/20 bg-green-400/5' : 'border-amber-400/20 bg-amber-400/5'
                          }`}>
                            <div className="flex items-center gap-2 mb-2">
                              <span className={`text-sm font-bold ${check.nota >= 90 ? 'text-green-400' : 'text-amber-400'}`}>
                                {check.nota}pts — {check.nota >= 90 ? 'Aprovado' : 'Revisar'}
                              </span>
                            </div>
                            {check.dimensoes && (
                              <div className="flex flex-wrap gap-2 mb-2">
                                {Object.entries(check.dimensoes).map(([k, v]) => (
                                  <span key={k} className={`text-[9px] px-1.5 py-0.5 rounded ${
                                    v >= 22 ? 'bg-green-400/10 text-green-400' : v >= 18 ? 'bg-amber-400/10 text-amber-400' : 'bg-red-400/10 text-red-400'
                                  }`}>{k}: {v}/25</span>
                                ))}
                              </div>
                            )}
                            {check.justificativa && <p className="text-[10px] text-gray-400 mb-1">{check.justificativa}</p>}
                            {check.revisao && <p className="text-[10px] text-amber-300"><span className="font-bold">Revisar:</span> {check.revisao}</p>}
                          </div>
                        </div>
                      )}

                      {/* Ações */}
                      <div className="flex items-center gap-2 pt-2">
                        {r.status_ia4 === 'revisar' && (
                          <button disabled={actionId === r.id} onClick={async () => {
                            setActionId(r.id);
                            flash('Re-avaliando...');
                            const r1 = await reavaliarResposta(r.id);
                            if (r1.success) {
                              flash('Re-checando...');
                              await rechecarResposta(r.id);
                            }
                            setActionId(null);
                            flash(r1.success ? r1.message : 'Erro: ' + r1.error);
                            refresh();
                          }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold text-amber-400 border border-amber-400/30 hover:bg-amber-400/10 transition-all disabled:opacity-50">
                            {actionId === r.id ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                            Re-avaliar + Re-checar
                          </button>
                        )}
                        {r.avaliacao_ia && !r.status_ia4 && (
                          <button disabled={actionId === r.id} onClick={async () => {
                            setActionId(r.id);
                            flash('Checando...');
                            const r1 = await rechecarResposta(r.id);
                            setActionId(null);
                            flash(r1.success ? r1.message : 'Erro: ' + r1.error);
                            refresh();
                          }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10 transition-all disabled:opacity-50">
                            {actionId === r.id ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />}
                            Validar
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      </>}

      {/* ── Trilhas Tab ─────────────────────────────────────────── */}
      {tab === 'trilhas' && (
        trilhas.length === 0 ? (
          <div className="text-center py-12">
            <BookOpen size={32} className="text-gray-600 mx-auto mb-3" />
            <p className="text-sm text-gray-500">Nenhuma trilha encontrada. Rode "Montar Trilhas" na pipeline primeiro.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {trilhas.map(t => {
              const cursos = Array.isArray(t.cursos) ? t.cursos : [];
              // Agrupar cursos por competência
              const porComp = {};
              cursos.forEach(c => {
                const key = c.competencia || 'Geral';
                if (!porComp[key]) porComp[key] = [];
                porComp[key].push(c);
              });

              return (
                <div key={t.id} className="rounded-xl border border-white/[0.06] overflow-hidden" style={{ background: '#0F2A4A' }}>
                  {/* Colaborador header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.04]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <User size={14} className="text-cyan-400" />
                      <span className="text-sm font-bold text-white">{t.colaborador_nome}</span>
                      <span className="text-[10px] text-gray-500">{t.colaborador_cargo}</span>
                      {t.competencia_foco && (
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-amber-400/15 text-amber-400">
                          Foco: {t.competencia_foco}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-gray-500">{cursos.length} {cursos.length === 1 ? 'curso' : 'cursos'}</span>
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${
                        t.status === 'pendente' ? 'bg-amber-400/15 text-amber-400' :
                        t.status === 'em_andamento' ? 'bg-cyan-400/15 text-cyan-400' :
                        t.status === 'concluida' ? 'bg-green-400/15 text-green-400' :
                        'bg-gray-400/15 text-gray-400'
                      }`}>{t.status}</span>
                    </div>
                  </div>

                  {/* Cursos agrupados por competência */}
                  <div className="px-4 py-3 space-y-3">
                    {Object.entries(porComp).map(([comp, cursosComp]) => (
                      <div key={comp}>
                        <p className="text-[9px] font-bold text-purple-400 uppercase tracking-widest mb-1.5">{comp}</p>
                        <div className="space-y-1">
                          {cursosComp.map((c, i) => (
                            <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{ background: '#091D35' }}>
                              <BookOpen size={12} className="text-cyan-400 shrink-0" />
                              <div className="flex-1 min-w-0">
                                {c.url ? (
                                  <a href={c.url} target="_blank" rel="noopener noreferrer"
                                    className="text-xs text-cyan-300 hover:text-cyan-200 font-medium flex items-center gap-1">
                                    {c.nome} <ExternalLink size={10} />
                                  </a>
                                ) : (
                                  <span className="text-xs text-gray-300 font-medium">{c.nome}</span>
                                )}
                              </div>
                              {c.nivel && (
                                <span className={`text-[10px] font-bold shrink-0 ${NIVEL_COLORS[c.nivel] || 'text-gray-400'}`}>
                                  N{c.nivel}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                    {cursos.length === 0 && (
                      <p className="text-xs text-gray-500 italic">
                        {t.competencia_foco
                          ? `Nenhum curso disponível no catálogo para "${t.competencia_foco}"`
                          : 'Nenhum curso recomendado'}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
