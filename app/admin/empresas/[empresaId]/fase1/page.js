'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Loader2, Trophy, Trash2, Plus, X, Search, ChevronDown,
  Briefcase, FileText, Target, Brain
} from 'lucide-react';
import {
  loadTop10TodosCargos, adicionarTop10, removerTop10, loadGabaritosCargos
} from '@/actions/fase1';
import { loadCompetencias } from '@/app/admin/competencias/actions';

export default function Fase1Page({ params }) {
  const { empresaId } = use(params);
  const router = useRouter();

  const [tab, setTab] = useState('top10');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  // Top10
  const [top10, setTop10] = useState([]);
  const [allComps, setAllComps] = useState([]);
  const [showAdd, setShowAdd] = useState(null);
  const [addSearch, setAddSearch] = useState('');

  // Gabarito
  const [gabaritos, setGabaritos] = useState([]);
  const [gabOpen, setGabOpen] = useState(null);

  // Cenários
  const [cenarios, setCenarios] = useState([]);
  const [cenOpen, setCenOpen] = useState(null);

  function flash(msg) { setToast(msg); setTimeout(() => setToast(null), 2500); }

  const refresh = useCallback(async () => {
    const [t, c, g] = await Promise.all([
      loadTop10TodosCargos(empresaId),
      loadCompetencias(empresaId),
      loadGabaritosCargos(empresaId),
    ]);
    setTop10(t);
    if (c.success) setAllComps(c.data || []);
    setGabaritos(g);

    // Cenários: buscar do banco_cenarios via server action
    try {
      const res = await fetch(`/api/cenarios?empresa=${empresaId}`);
      if (res.ok) setCenarios(await res.json());
    } catch { /* cenários podem não ter API ainda */ }

    setLoading(false);
  }, [empresaId]);

  useEffect(() => { refresh(); }, [refresh]);

  // ── Top10 helpers ──
  const cargosTop10 = [...new Set(top10.map(t => t.cargo))].sort();

  const selItems = showAdd ? top10.filter(t => t.cargo === showAdd) : [];
  const selectedIds = new Set(selItems.map(t => t.competencia_id));
  const selectedCods = new Set(selItems.map(t => t.competencia?.cod_comp).filter(Boolean));
  const availComps = showAdd ? (() => {
    const seen = new Set();
    return allComps.filter(c => {
      if (c.cargo && c.cargo !== showAdd) return false;
      const key = c.cod_comp || c.nome;
      if (seen.has(key)) return false; seen.add(key);
      if (selectedIds.has(c.id)) return false;
      if (c.cod_comp && selectedCods.has(c.cod_comp)) return false;
      if (addSearch) { const s = addSearch.toLowerCase(); return c.nome.toLowerCase().includes(s) || (c.pilar || '').toLowerCase().includes(s); }
      return true;
    });
  })() : [];

  // ── Gabarito helpers ──
  const parseJSON = (v) => { try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return null; } };

  // ── Cenários helpers ──
  const cenariosPorCargo = {};
  cenarios.forEach(c => {
    if (!cenariosPorCargo[c.cargo]) cenariosPorCargo[c.cargo] = [];
    cenariosPorCargo[c.cargo].push(c);
  });

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
            <Brain size={20} className="text-blue-400" /> Fase 1 — Parametrização
          </h1>
          <p className="text-xs text-gray-500">Top 10, Gabarito CIS e Cenários</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 p-1 rounded-xl border border-white/[0.06]" style={{ background: '#091D35' }}>
        {[
          { key: 'top10', label: 'Top 10', icon: Trophy, color: 'text-amber-400', count: top10.length },
          { key: 'gabarito', label: 'Gabarito CIS', icon: Target, color: 'text-purple-400', count: gabaritos.length },
          { key: 'cenarios', label: 'Cenários', icon: FileText, color: 'text-green-400', count: cenarios.length },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition-all ${
              tab === t.key ? 'bg-white/[0.06] text-white' : 'text-gray-500 hover:text-gray-300'
            }`}>
            <t.icon size={14} className={tab === t.key ? t.color : ''} />
            {t.label}
            {t.count > 0 && <span className="text-[9px] bg-white/[0.08] px-1.5 py-0.5 rounded">{t.count}</span>}
          </button>
        ))}
      </div>

      {/* ══════════════ TAB: TOP 10 ══════════════ */}
      {tab === 'top10' && (
        <div>
          {top10.length === 0 ? (
            <Empty icon={Trophy} text="Nenhuma seleção. Rode IA1 no pipeline." />
          ) : cargosTop10.map(cargo => {
            const items = top10.filter(t => t.cargo === cargo);
            return (
              <div key={cargo} className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-bold text-white">{cargo}</h2>
                  <div className="flex items-center gap-2">
                    <Badge count={items.length} max={10} />
                    <button onClick={() => { setShowAdd(cargo); setAddSearch(''); }}
                      className="text-[10px] font-semibold text-green-400 hover:text-green-300 flex items-center gap-0.5">
                      <Plus size={10} /> Adicionar
                    </button>
                  </div>
                </div>
                <div className="rounded-xl border border-white/[0.06] overflow-hidden" style={{ background: '#0F2A4A' }}>
                  {items.map((t, i) => (
                    <div key={t.id} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-white/[0.04]' : ''}`}>
                      <span className="text-[10px] font-mono text-amber-400 font-bold w-5 text-center shrink-0">{t.posicao}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-white">{t.competencia?.nome || '—'}</span>
                          {t.competencia?.cod_comp && <span className="text-[9px] font-mono text-cyan-400/70 bg-cyan-400/10 px-1.5 py-0.5 rounded">{t.competencia.cod_comp}</span>}
                        </div>
                        {t.justificativa && <p className="text-[10px] text-gray-500 mt-0.5">{t.justificativa}</p>}
                      </div>
                      <button onClick={async () => { const r = await removerTop10(t.id); if (r.success) { flash('Removida'); refresh(); } }}
                        className="text-gray-600 hover:text-red-400 shrink-0"><Trash2 size={13} /></button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Modal adicionar */}
          {showAdd && (
            <Modal onClose={() => setShowAdd(null)} title={`Adicionar — ${showAdd}`}>
              <div className="relative mb-2">
                <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input value={addSearch} onChange={e => setAddSearch(e.target.value)} placeholder="Buscar..."
                  className="w-full pl-8 pr-3 py-2 rounded-lg text-xs text-white border border-white/10 outline-none focus:border-cyan-400/50" style={{ background: '#091D35' }} />
              </div>
              <div className="max-h-[400px] overflow-y-auto space-y-0.5">
                {availComps.length === 0 ? (
                  <p className="text-[10px] text-gray-500 text-center py-4">Nenhuma disponível</p>
                ) : availComps.map(c => (
                  <button key={c.id} onClick={async () => {
                    const r = await adicionarTop10(empresaId, showAdd, c.id);
                    if (r.success) { flash('Adicionada'); refresh(); }
                  }} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-left hover:bg-white/[0.04] transition-colors">
                    <Plus size={10} className="text-green-400 shrink-0" />
                    <span className="text-[11px] text-white font-medium">{c.nome}</span>
                    {c.pilar && <span className="text-[9px] text-gray-500">{c.pilar}</span>}
                  </button>
                ))}
              </div>
            </Modal>
          )}
        </div>
      )}

      {/* ══════════════ TAB: GABARITO CIS ══════════════ */}
      {tab === 'gabarito' && (
        <div>
          {gabaritos.length === 0 ? (
            <Empty icon={Target} text="Nenhum gabarito. Rode IA2 no pipeline." />
          ) : gabaritos.map(g => {
            const gab = parseJSON(g.gabarito);
            const rac = parseJSON(g.raciocinio_ia2);
            const isOpen = gabOpen === g.nome;
            if (!gab) return null;

            return (
              <div key={g.id} className="mb-3 rounded-xl border border-white/[0.06] overflow-hidden" style={{ background: '#0F2A4A' }}>
                <button onClick={() => setGabOpen(isOpen ? null : g.nome)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.02] transition-colors">
                  <span className="text-sm font-bold text-white">{g.nome}</span>
                  <div className="flex items-center gap-3">
                    {gab.tela3 && <span className="text-[10px] text-gray-500">
                      E:{gab.tela3.executor}% · M:{gab.tela3.motivador}% · Me:{gab.tela3.metodico}% · S:{gab.tela3.sistematico}%
                    </span>}
                    <ChevronDown size={14} className={`text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </div>
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 space-y-4 border-t border-white/[0.04]">
                    {/* Tela 1 */}
                    {gab.tela1?.length > 0 && (
                      <div className="pt-3">
                        <SectionTitle color="cyan">Características do Perfil</SectionTitle>
                        <div className="flex flex-wrap gap-1.5">
                          {gab.tela1.map((c, i) => <span key={i} className="text-[11px] px-2.5 py-1 rounded-full bg-cyan-400/10 text-cyan-300">{c}</span>)}
                        </div>
                      </div>
                    )}
                    {/* Tela 2 */}
                    {gab.tela2?.length > 0 && (
                      <div>
                        <SectionTitle color="amber">Sub-competências CIS</SectionTitle>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {gab.tela2.map((s, i) => (
                            <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: '#091D35' }}>
                              <span className={`text-xs font-bold w-4 ${discColor(s.dimensao)}`}>{s.dimensao}</span>
                              <span className="text-xs text-white font-medium flex-1">{s.nome}</span>
                              <span className="text-[10px] text-gray-500">{s.faixa_min} → {s.faixa_max}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Tela 3 */}
                    {gab.tela3 && (
                      <div>
                        <SectionTitle color="green">Estilos de Liderança</SectionTitle>
                        <div className="grid grid-cols-4 gap-2">
                          {[
                            { key: 'executor', label: 'Executor', color: '#EF4444' },
                            { key: 'motivador', label: 'Motivador', color: '#F59E0B' },
                            { key: 'metodico', label: 'Metódico', color: '#22C55E' },
                            { key: 'sistematico', label: 'Sistemático', color: '#3B82F6' },
                          ].map(e => (
                            <div key={e.key} className="text-center p-3 rounded-lg" style={{ background: '#091D35' }}>
                              <div className="text-2xl font-bold" style={{ color: e.color }}>{gab.tela3[e.key]}%</div>
                              <div className="text-[10px] text-gray-500 mt-1">{e.label}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Tela 4 */}
                    {gab.tela4 && (
                      <div>
                        <SectionTitle color="red">Faixas DISC Ideais</SectionTitle>
                        <div className="grid grid-cols-4 gap-2">
                          {['D', 'I', 'S', 'C'].map(dim => {
                            const f = gab.tela4[dim];
                            return f ? (
                              <div key={dim} className="text-center p-3 rounded-lg" style={{ background: '#091D35' }}>
                                <span className={`text-lg font-bold ${discColor(dim)}`}>{dim}</span>
                                <p className="text-[10px] text-gray-400 mt-1">{f.min}</p>
                                <p className="text-[10px] text-gray-500">→ {f.max}</p>
                              </div>
                            ) : null;
                          })}
                        </div>
                      </div>
                    )}
                    {/* Raciocínio */}
                    {rac && (
                      <div className="pt-2 border-t border-white/[0.04]">
                        <SectionTitle color="gray">Raciocínio da IA</SectionTitle>
                        {rac.sinais_do_caso?.length > 0 && <p className="text-[11px] text-gray-400 mb-1"><span className="text-gray-500 font-semibold">Sinais:</span> {rac.sinais_do_caso.join('; ')}</p>}
                        {rac.leitura_principal && <p className="text-[11px] text-gray-400 mb-1"><span className="text-gray-500 font-semibold">Leitura:</span> {rac.leitura_principal}</p>}
                        {rac.diferenciais_vs_outros_cargos && <p className="text-[11px] text-gray-400"><span className="text-gray-500 font-semibold">Diferenciais:</span> {rac.diferenciais_vs_outros_cargos}</p>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ══════════════ TAB: CENÁRIOS ══════════════ */}
      {tab === 'cenarios' && (
        <div>
          {cenarios.length === 0 ? (
            <Empty icon={FileText} text="Nenhum cenário. Rode IA3 no pipeline." />
          ) : Object.entries(cenariosPorCargo).map(([cargo, cens]) => (
            <div key={cargo} className="mb-6">
              <h2 className="text-sm font-bold text-white mb-2">{cargo} <span className="text-[10px] text-gray-500 font-normal">({cens.length} cenários)</span></h2>
              <div className="space-y-2">
                {cens.map(c => {
                  const isOpen = cenOpen === c.id;
                  const perguntas = Array.isArray(c.alternativas) ? c.alternativas : [];
                  return (
                    <div key={c.id} className="rounded-xl border border-white/[0.06] overflow-hidden" style={{ background: '#0F2A4A' }}>
                      <button onClick={() => setCenOpen(isOpen ? null : c.id)}
                        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.02] transition-colors">
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-bold text-white">{c.titulo || 'Cenário'}</span>
                          {c.competencia_nome && <span className="text-[10px] text-cyan-400 ml-2">{c.competencia_nome}</span>}
                        </div>
                        <ChevronDown size={14} className={`text-gray-500 transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {isOpen && (
                        <div className="px-4 pb-4 border-t border-white/[0.04]">
                          {/* Contexto */}
                          <p className="text-xs text-gray-300 leading-relaxed mt-3 mb-4">{c.descricao}</p>
                          {/* Perguntas */}
                          {perguntas.length > 0 && (
                            <div className="space-y-3">
                              {perguntas.map((p, i) => (
                                <div key={i} className="p-3 rounded-lg" style={{ background: '#091D35' }}>
                                  <p className="text-xs font-bold text-white mb-1">
                                    P{p.numero || i + 1}: {p.texto || p.letra && `${p.letra}) ${p.texto}` || JSON.stringify(p)}
                                  </p>
                                  {p.descritores_primarios && (
                                    <p className="text-[9px] text-cyan-400/60">Descritores: {Array.isArray(p.descritores_primarios) ? p.descritores_primarios.map(d => `D${d}`).join(', ') : p.descritores_primarios}</p>
                                  )}
                                  {p.o_que_diferencia_niveis && (
                                    <p className="text-[10px] text-gray-500 mt-1">{p.o_que_diferencia_niveis}</p>
                                  )}
                                </div>
                              ))}
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
      )}
    </div>
  );
}

// ── Componentes auxiliares ──

function Empty({ icon: Icon, text }) {
  return (
    <div className="text-center py-12">
      <Icon size={32} className="text-gray-600 mx-auto mb-3" />
      <p className="text-sm text-gray-500">{text}</p>
    </div>
  );
}

function Badge({ count, max }) {
  const color = count >= max ? 'bg-green-400/15 text-green-400' : count >= max * 0.7 ? 'bg-amber-400/15 text-amber-400' : 'bg-red-400/15 text-red-400';
  return <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${color}`}>{count}/{max}</span>;
}

function Modal({ onClose, title, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-10 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div className="w-full max-w-[550px] rounded-xl border border-white/[0.08] p-4" style={{ background: '#0A1D35' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold text-white">{title}</p>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function SectionTitle({ color, children }) {
  const colors = { cyan: 'text-cyan-400', amber: 'text-amber-400', green: 'text-green-400', red: 'text-red-400', purple: 'text-purple-400', gray: 'text-gray-500' };
  return <p className={`text-[9px] font-bold uppercase tracking-widest mb-2 ${colors[color] || 'text-gray-500'}`}>{children}</p>;
}

function discColor(dim) {
  return dim === 'D' ? 'text-red-400' : dim === 'I' ? 'text-yellow-400' : dim === 'S' ? 'text-green-400' : 'text-blue-400';
}
