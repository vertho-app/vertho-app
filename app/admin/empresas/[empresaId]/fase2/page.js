'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Loader2, Bot, ChevronDown, CheckCircle, AlertTriangle,
  User, FileText, Filter
} from 'lucide-react';
import { loadRespostasAvaliadas } from '@/actions/fase3';

const NIVEL_COLORS = {
  1: 'text-red-400', 2: 'text-amber-400', 3: 'text-cyan-400', 4: 'text-green-400',
};

export default function Fase2Page({ params }) {
  const { empresaId } = use(params);
  const router = useRouter();

  const [respostas, setRespostas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);
  const [filtroColab, setFiltroColab] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');

  useEffect(() => {
    loadRespostasAvaliadas(empresaId).then(d => { setRespostas(d); setLoading(false); });
  }, [empresaId]);

  const colaboradores = [...new Set(respostas.map(r => r.colaborador_nome))].sort();
  const filtered = respostas.filter(r => {
    if (filtroColab && r.colaborador_nome !== filtroColab) return false;
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

      {/* Stats */}
      <div className="flex items-center gap-3 mb-4 flex-wrap text-[10px]">
        <span className="text-gray-400">Total: <span className="text-white font-bold">{stats.total}</span></span>
        <span className="text-gray-400">Avaliadas: <span className="text-cyan-400 font-bold">{stats.avaliadas}</span></span>
        {stats.aprovadas > 0 && <span className="bg-green-400/15 text-green-400 px-1.5 py-0.5 rounded font-bold">{stats.aprovadas} aprovadas</span>}
        {stats.revisar > 0 && <span className="bg-amber-400/15 text-amber-400 px-1.5 py-0.5 rounded font-bold">{stats.revisar} revisar</span>}
        {stats.pendentes > 0 && <span className="bg-gray-400/15 text-gray-400 px-1.5 py-0.5 rounded font-bold">{stats.pendentes} pendentes</span>}
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 mb-5">
        <Filter size={14} className="text-gray-500" />
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
                      {avaliacao?.nivel_geral && (
                        <span className={`text-sm font-bold ${NIVEL_COLORS[avaliacao.nivel_geral] || 'text-gray-400'}`}>N{avaliacao.nivel_geral}</span>
                      )}
                      {check?.nota !== undefined && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          check.nota >= 90 ? 'bg-green-400/15 text-green-400' : 'bg-amber-400/15 text-amber-400'
                        }`}>{check.nota}pts</span>
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
                      {avaliacao && (
                        <div>
                          <p className="text-[9px] font-bold text-purple-400 uppercase tracking-widest mb-2">Avaliação IA4</p>
                          <div className="p-3 rounded-lg space-y-2" style={{ background: '#091D35' }}>
                            <div className="flex items-center gap-3">
                              <span className={`text-lg font-bold ${NIVEL_COLORS[avaliacao.nivel_geral] || 'text-gray-400'}`}>
                                N{avaliacao.nivel_geral}
                              </span>
                              {avaliacao.nota_decimal && (
                                <span className="text-xs text-gray-500">({avaliacao.nota_decimal})</span>
                              )}
                            </div>

                            {/* Por pergunta */}
                            {avaliacao.por_pergunta?.length > 0 && (
                              <div className="space-y-1">
                                {avaliacao.por_pergunta.map((p, i) => (
                                  <div key={i} className="flex items-start gap-2 text-[10px]">
                                    <span className={`font-bold shrink-0 ${NIVEL_COLORS[p.nivel] || 'text-gray-400'}`}>P{p.pergunta}: N{p.nivel}</span>
                                    <span className="text-gray-500">{p.justificativa}</span>
                                  </div>
                                ))}
                              </div>
                            )}

                            {avaliacao.pontos_fortes?.length > 0 && (
                              <div>
                                <p className="text-[9px] text-green-400 font-bold">Pontos fortes:</p>
                                {avaliacao.pontos_fortes.map((p, i) => <p key={i} className="text-[10px] text-gray-400">• {p}</p>)}
                              </div>
                            )}

                            {avaliacao.pontos_desenvolvimento?.length > 0 && (
                              <div>
                                <p className="text-[9px] text-amber-400 font-bold">Desenvolvimento:</p>
                                {avaliacao.pontos_desenvolvimento.map((p, i) => <p key={i} className="text-[10px] text-gray-400">• {p}</p>)}
                              </div>
                            )}

                            {avaliacao.feedback && (
                              <p className="text-[10px] text-gray-400 pt-1 border-t border-white/[0.04]">{avaliacao.feedback}</p>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Check */}
                      {check && (
                        <div>
                          <p className="text-[9px] font-bold text-amber-400 uppercase tracking-widest mb-2">Check (Auditoria)</p>
                          <div className={`p-3 rounded-lg border ${
                            check.nota >= 90 ? 'border-green-400/20 bg-green-400/5' : 'border-amber-400/20 bg-amber-400/5'
                          }`}>
                            <div className="flex items-center gap-2 mb-2">
                              <span className={`text-sm font-bold ${check.nota >= 90 ? 'text-green-400' : 'text-amber-400'}`}>
                                {check.nota}pts — {check.status || (check.nota >= 90 ? 'Aprovado' : 'Revisar')}
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
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
