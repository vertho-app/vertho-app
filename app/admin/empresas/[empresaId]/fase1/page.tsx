'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Loader2, Trophy, Trash2, Plus, X, Search, ChevronDown,
  Briefcase, FileText, Target, Brain, RefreshCw, CheckCircle, AlertTriangle
} from 'lucide-react';
import {
  loadTop10TodosCargos, adicionarTop10, removerTop10, loadGabaritosCargos, loadCenarios,
  regenerarCenario, checkCenarioUm, limparCenariosAntigos
} from '@/actions/fase1';
import { loadCompetencias } from '@/app/admin/competencias/actions';
import { loadCargos, salvarTop5 } from '@/app/admin/cargos/actions';

export default function Fase1Page({ params }: { params: Promise<{ empresaId: string }> }) {
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

  // Top 5
  const [cargosData, setCargosData] = useState([]);
  const [top5Edits, setTop5Edits] = useState({});
  const [savingTop5, setSavingTop5] = useState({});

  // Cenários
  const [cenarios, setCenarios] = useState([]);
  const [cenOpen, setCenOpen] = useState(null);
  const [cenAction, setCenAction] = useState(null);

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

    // Top 5 (cargos com competências top10)
    const cargosR = await loadCargos(empresaId);
    if (cargosR.success) {
      setCargosData(cargosR.data || []);
      const edits = {};
      (cargosR.data || []).forEach(c => { edits[c.id] = c.top5_workshop || []; });
      setTop5Edits(edits);
    }

    // Cenários
    const cens = await loadCenarios(empresaId);
    setCenarios(cens);

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
  const DIM_MAX: Record<string, number> = {
    aderencia_competencia: 15, cobertura_descritores: 15, realismo_contextual: 15,
    contencao_sobriedade: 10, clareza_tradeoff: 15, poder_discriminante: 20, auditabilidade: 10,
    // Legacy
    aderencia: 20, realismo: 20, contencao: 20, decisao: 20, discriminante: 20,
  };
  const DIM_LABELS: Record<string, string> = {
    aderencia_competencia: 'Aderência', cobertura_descritores: 'Cobertura', realismo_contextual: 'Realismo',
    contencao_sobriedade: 'Contenção', clareza_tradeoff: 'Trade-off', poder_discriminante: 'Discriminante', auditabilidade: 'Auditab.',
    // Legacy
    aderencia: 'Aderência', realismo: 'Realismo', contencao: 'Contenção', decisao: 'Decisão', discriminante: 'Discriminante',
  };

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
          <p className="text-xs text-gray-500">Top 10, Top 5, Perfil de Cargo Ideal e Cenários</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 p-1 rounded-xl border border-white/[0.06]" style={{ background: '#091D35' }}>
        {[
          { key: 'top10', label: 'Top 10', icon: Trophy, color: 'text-amber-400', count: top10.length },
          { key: 'top5', label: 'Top 5', icon: Target, color: 'text-orange-400', count: cargosData.filter(c => c.top5_workshop?.length).length },
          { key: 'gabarito', label: 'Perfil de Cargo Ideal', icon: Target, color: 'text-purple-400', count: gabaritos.length },
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

      {/* ══════════════ TAB: TOP 5 ══════════════ */}
      {tab === 'top5' && (
        <div>
          {cargosData.length === 0 ? (
            <Empty icon={Target} text="Nenhum cargo encontrado. Selecione Top 5 na tela de Cargos & Top 5." />
          ) : cargosData.map(cargo => {
            const selected = cargo.top5_workshop || [];
            if (!selected.length) return (
              <div key={cargo.id} className="mb-4 rounded-xl border border-white/[0.06] p-4" style={{ background: '#0F2A4A' }}>
                <h3 className="text-sm font-bold text-white">{cargo.nome}</h3>
                <p className="text-[10px] text-gray-500 mt-1">Nenhuma Top 5 selecionada</p>
              </div>
            );
            return (
              <div key={cargo.id} className="mb-4 rounded-xl border border-white/[0.06] overflow-hidden" style={{ background: '#0F2A4A' }}>
                <div className="px-4 py-3 border-b border-white/[0.06]">
                  <h3 className="text-sm font-bold text-white">{cargo.nome}</h3>
                  <p className="text-[10px] text-gray-500">{selected.length} competências selecionadas</p>
                </div>
                <div className="p-4">
                  <div className="space-y-1.5">
                    {selected.map((comp, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-cyan-400/20 bg-cyan-400/5">
                        <span className="text-[10px] font-mono text-cyan-400 font-bold w-4 text-center">{i + 1}</span>
                        <span className="text-xs text-white font-medium">{comp}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
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

            // Compatibilidade: tela1/tela2 podem ser array (legado) ou objeto (novo)
            const t1Items = Array.isArray(gab.tela1) ? gab.tela1 : (gab.tela1?.caracteristicas || []);
            const t1Conf = gab.tela1?.confianca;
            const t2Items = Array.isArray(gab.tela2) ? gab.tela2 : (gab.tela2?.subcompetencias || []);
            const t2Conf = gab.tela2?.confianca;
            const t3 = gab.tela3 || {};
            const t3Conf = t3.confianca;
            const t4 = gab.tela4 || {};
            const t4Conf = t4.confianca;

            return (
              <div key={g.id} className="mb-3 rounded-xl border border-white/[0.06] overflow-hidden" style={{ background: '#0F2A4A' }}>
                <button onClick={() => setGabOpen(isOpen ? null : g.nome)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.02] transition-colors">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-sm font-bold text-white">{g.nome}</span>
                    {g.confianca_media_ia2 != null && (
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                        g.confianca_media_ia2 >= 0.8 ? 'bg-green-400/15 text-green-400' :
                        g.confianca_media_ia2 >= 0.6 ? 'bg-amber-400/15 text-amber-400' :
                        'bg-red-400/15 text-red-400'
                      }`}>{Math.round(g.confianca_media_ia2 * 100)}%</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {t3.executor != null && <span className="text-[10px] text-gray-500">
                      E:{t3.executor}% · M:{t3.motivador}% · Me:{t3.metodico}% · S:{t3.sistematico}%
                    </span>}
                    <ChevronDown size={14} className={`text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </div>
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 space-y-4 border-t border-white/[0.04]">
                    {/* Tela 1 */}
                    {t1Items.length > 0 && (
                      <div className="pt-3">
                        <div className="flex items-center gap-2 mb-2">
                          <SectionTitle color="cyan">Características do Perfil</SectionTitle>
                          {t1Conf != null && <span className="text-[9px] text-gray-500">conf: {Math.round(t1Conf * 100)}%</span>}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {t1Items.map((c: any, i: number) => {
                            const isObj = typeof c === 'object';
                            const label = isObj ? c.polo_escolhido : c;
                            const intensidade = isObj ? c.intensidade : null;
                            return (
                              <span key={i} className="text-[11px] px-2.5 py-1 rounded-full bg-cyan-400/10 text-cyan-300 inline-flex items-center gap-1" title={isObj ? c.justificativa : undefined}>
                                {label}
                                {intensidade && (
                                  <span className={`text-[8px] px-1 py-0.5 rounded ${
                                    intensidade === 'alta' ? 'bg-red-400/15 text-red-300' :
                                    intensidade === 'moderada' ? 'bg-amber-400/15 text-amber-300' :
                                    'bg-gray-400/15 text-gray-400'
                                  }`}>{intensidade}</span>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {/* Tela 2 */}
                    {t2Items.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <SectionTitle color="amber">Sub-competências CIS</SectionTitle>
                          {t2Conf != null && <span className="text-[9px] text-gray-500">conf: {Math.round(t2Conf * 100)}%</span>}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {t2Items.map((s: any, i: number) => (
                            <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: '#091D35' }}>
                              <span className={`text-xs font-bold w-4 ${discColor(s.dimensao)}`}>{s.dimensao}</span>
                              <span className="text-xs text-white font-medium flex-1">{s.nome}</span>
                              <span className="text-[10px] text-gray-500">{s.faixa_min} → {s.faixa_max}</span>
                              {s.prioridade && <span className={`text-[8px] font-bold px-1 py-0.5 rounded ${
                                s.prioridade === 'alta' ? 'bg-red-400/10 text-red-300' :
                                s.prioridade === 'media' ? 'bg-amber-400/10 text-amber-300' :
                                'bg-gray-400/10 text-gray-400'
                              }`}>{s.prioridade}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Tela 3 */}
                    {t3.executor != null && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <SectionTitle color="green">Estilos de Liderança</SectionTitle>
                          {t3.estilo_predominante && <span className="text-[10px] text-green-300/70">{t3.estilo_predominante}</span>}
                          {t3Conf != null && <span className="text-[9px] text-gray-500">conf: {Math.round(t3Conf * 100)}%</span>}
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                          {[
                            { key: 'executor', label: 'Executor', color: '#EF4444' },
                            { key: 'motivador', label: 'Motivador', color: '#F59E0B' },
                            { key: 'metodico', label: 'Metódico', color: '#22C55E' },
                            { key: 'sistematico', label: 'Sistemático', color: '#3B82F6' },
                          ].map(e => (
                            <div key={e.key} className="text-center p-3 rounded-lg" style={{ background: '#091D35' }}>
                              <div className="text-2xl font-bold" style={{ color: e.color }}>{t3[e.key]}%</div>
                              <div className="text-[10px] text-gray-500 mt-1">{e.label}</div>
                            </div>
                          ))}
                        </div>
                        {t3.justificativa && <p className="text-[10px] text-gray-400 mt-2 italic">{t3.justificativa}</p>}
                      </div>
                    )}
                    {/* Tela 4 */}
                    {(t4.D || t4.I || t4.S || t4.C) && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <SectionTitle color="red">Faixas DISC Ideais</SectionTitle>
                          {t4Conf != null && <span className="text-[9px] text-gray-500">conf: {Math.round(t4Conf * 100)}%</span>}
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                          {['D', 'I', 'S', 'C'].map(dim => {
                            const f = t4[dim];
                            return f ? (
                              <div key={dim} className="text-center p-3 rounded-lg" style={{ background: '#091D35' }}>
                                <span className={`text-lg font-bold ${discColor(dim)}`}>{dim}</span>
                                <p className="text-[10px] text-gray-400 mt-1">{f.min}</p>
                                <p className="text-[10px] text-gray-500">→ {f.max}</p>
                              </div>
                            ) : null;
                          })}
                        </div>
                        {t4.justificativa && <p className="text-[10px] text-gray-400 mt-2 italic">{t4.justificativa}</p>}
                      </div>
                    )}
                    {/* Raciocínio */}
                    {rac && (
                      <div className="pt-2 border-t border-white/[0.04]">
                        <SectionTitle color="gray">Raciocínio da IA</SectionTitle>
                        {rac.sinais_do_caso?.length > 0 && <p className="text-[11px] text-gray-400 mb-1"><span className="text-gray-500 font-semibold">Sinais:</span> {rac.sinais_do_caso.join('; ')}</p>}
                        {rac.hipotese_base && <p className="text-[11px] text-gray-400 mb-1"><span className="text-gray-500 font-semibold">Hipótese:</span> {rac.hipotese_base}</p>}
                        {rac.leitura_principal && <p className="text-[11px] text-gray-400 mb-1"><span className="text-gray-500 font-semibold">Leitura:</span> {rac.leitura_principal}</p>}
                        {rac.incertezas && <p className="text-[11px] text-amber-300/60 mb-1"><span className="text-amber-400/80 font-semibold">Incertezas:</span> {rac.incertezas}</p>}
                        {rac.diferenciais_vs_outros_cargos && <p className="text-[11px] text-gray-400"><span className="text-gray-500 font-semibold">Diferenciais:</span> {typeof rac.diferenciais_vs_outros_cargos === 'string' ? rac.diferenciais_vs_outros_cargos : (Array.isArray(rac.diferenciais_vs_outros_cargos) ? rac.diferenciais_vs_outros_cargos.join('; ') : '')}</p>}
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
          ) : (<>
            <div className="flex items-center gap-2 mb-4">
              <button onClick={async () => {
                if (!confirm('Remover cenários de competências que não estão no Top 5?')) return;
                const r = await limparCenariosAntigos(empresaId);
                flash(r.success ? r.message : 'Erro: ' + r.error);
                if (r.success) refresh();
              }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold text-gray-400 border border-white/10 hover:text-red-400 hover:border-red-400/30 transition-all">
                <Trash2 size={11} /> Limpar fora do Top 5
              </button>
            </div>
          {Object.entries(cenariosPorCargo).map(([cargo, cens]: [string, any]) => {
            const aprovados = cens.filter(c => c.status_check === 'aprovado').length;
            const ressalvas = cens.filter(c => c.status_check === 'aprovado_com_ressalvas').length;
            const revisar = cens.filter(c => c.status_check === 'revisar').length;
            const pendentes = cens.filter(c => !c.status_check).length;
            return (
              <div key={cargo} className="mb-6">
                <div className="flex items-center gap-3 mb-2 flex-wrap">
                  <h2 className="text-sm font-bold text-white">{cargo}</h2>
                  <span className="text-[10px] text-gray-500">{cens.length} cenários</span>
                  {aprovados > 0 && <span className="text-[9px] bg-green-400/15 text-green-400 px-1.5 py-0.5 rounded">{aprovados} aprovados</span>}
                  {ressalvas > 0 && <span className="text-[9px] bg-cyan-400/15 text-cyan-400 px-1.5 py-0.5 rounded">{ressalvas} ressalvas</span>}
                  {revisar > 0 && <span className="text-[9px] bg-amber-400/15 text-amber-400 px-1.5 py-0.5 rounded">{revisar} revisar</span>}
                  {pendentes > 0 && <span className="text-[9px] bg-gray-400/15 text-gray-400 px-1.5 py-0.5 rounded">{pendentes} pendentes</span>}
                  {(revisar > 0 || ressalvas > 0) && (
                    <button
                      disabled={!!cenAction}
                      onClick={async () => {
                        const paraRevisar = cens.filter(c => c.status_check === 'revisar' || c.status_check === 'aprovado_com_ressalvas');
                        let ok = 0, semCheck = 0;
                        for (const c of paraRevisar) {
                          setCenAction({ id: c.id, type: 'regen' });
                          try {
                            const r = await regenerarCenario(c.id);
                            if (r.success) {
                              const r2 = await checkCenarioUm(c.id);
                              if (r2.success) ok++; else semCheck++;
                            }
                          } catch (e) {
                            console.warn('regen lote:', e.message);
                            semCheck++;
                          }
                        }
                        setCenAction(null);
                        flash(`${ok} revisados${semCheck ? ` · ${semCheck} sem validação (clique 'Validar todos')` : ''}`);
                        refresh();
                      }}
                      className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold text-amber-300 border border-amber-400/40 hover:bg-amber-400/10 transition-all disabled:opacity-50 ml-auto">
                      <RefreshCw size={10} /> Revisar todos ({revisar + ressalvas})
                    </button>
                  )}
                  {pendentes > 0 && (
                    <button
                      disabled={!!cenAction}
                      onClick={async () => {
                        const semNota = cens.filter(c => !c.nota_check);
                        let ok = 0, erro = 0;
                        for (const c of semNota) {
                          setCenAction({ id: c.id, type: 'check' });
                          try {
                            const r = await checkCenarioUm(c.id);
                            if (r.success) ok++; else erro++;
                          } catch (e) { console.warn('check lote:', e.message); erro++; }
                        }
                        setCenAction(null);
                        flash(`${ok} validados${erro ? ` · ${erro} com erro` : ''}`);
                        refresh();
                      }}
                      className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold text-cyan-300 border border-cyan-400/40 hover:bg-cyan-400/10 transition-all disabled:opacity-50">
                      <CheckCircle size={10} /> Validar todos ({pendentes})
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {cens.map((c: any) => {
                    const isOpen = cenOpen === c.id;
                    const altObj = typeof c.alternativas === 'object' && !Array.isArray(c.alternativas) ? c.alternativas : {};
                    const perguntas = altObj.perguntas || (Array.isArray(c.alternativas) ? c.alternativas : []);
                    const isActing = cenAction?.id === c.id;
                    const dims = typeof c.dimensoes_check === 'string' ? JSON.parse(c.dimensoes_check) : c.dimensoes_check;

                    return (
                      <div key={c.id} className={`rounded-xl border overflow-hidden ${
                        c.status_check === 'aprovado' ? 'border-green-400/20' :
                        c.status_check === 'aprovado_com_ressalvas' ? 'border-cyan-400/20' :
                        c.status_check === 'revisar' ? 'border-amber-400/20' : 'border-white/[0.06]'
                      }`} style={{ background: '#0F2A4A' }}>
                        {/* Header */}
                        <button onClick={() => setCenOpen(isOpen ? null : c.id)}
                          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.02] transition-colors">
                          <div className="flex-1 min-w-0 flex items-center gap-2">
                            {c.status_check === 'aprovado' && <CheckCircle size={14} className="text-green-400 shrink-0" />}
                            {c.status_check === 'aprovado_com_ressalvas' && <CheckCircle size={14} className="text-cyan-400 shrink-0" />}
                            {c.status_check === 'revisar' && <AlertTriangle size={14} className="text-amber-400 shrink-0" />}
                            <span className="text-xs font-bold text-white">{c.titulo || 'Cenário'}</span>
                            {c.competencia_nome && <span className="text-[10px] text-cyan-400">{c.competencia_nome}</span>}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {c.nota_check != null && (
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                c.status_check === 'aprovado' ? 'bg-green-400/15 text-green-400' :
                                c.status_check === 'aprovado_com_ressalvas' ? 'bg-cyan-400/15 text-cyan-400' :
                                'bg-amber-400/15 text-amber-400'
                              }`}>{c.nota_check}pts</span>
                            )}
                            <ChevronDown size={14} className={`text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                          </div>
                        </button>

                        {isOpen && (
                          <div className="px-4 pb-4 border-t border-white/[0.04]">
                            {/* Contexto */}
                            <p className="text-xs text-gray-300 leading-relaxed mt-3 mb-4">{c.descricao}</p>

                            {/* Metadados do cenário */}
                            {(() => {
                              const alt = typeof c.alternativas === 'object' && !Array.isArray(c.alternativas) ? c.alternativas : {};
                              if (!alt.faceta_testada_principal && !alt.tradeoff_testado) return null;
                              return (
                                <div className="flex flex-wrap gap-2 mb-3">
                                  {alt.faceta_testada_principal && (
                                    <span className="text-[9px] px-2 py-1 rounded-full bg-purple-400/10 text-purple-300 border border-purple-400/15">
                                      Faceta: {alt.faceta_testada_principal}
                                    </span>
                                  )}
                                  {alt.tradeoff_testado && (
                                    <span className="text-[9px] px-2 py-1 rounded-full bg-cyan-400/10 text-cyan-300 border border-cyan-400/15">
                                      Trade-off: {alt.tradeoff_testado}
                                    </span>
                                  )}
                                </div>
                              );
                            })()}

                            {/* Perguntas */}
                            {perguntas.length > 0 && (
                              <div className="space-y-2 mb-4">
                                {perguntas.map((p, i) => (
                                  <div key={i} className="p-3 rounded-lg" style={{ background: '#091D35' }}>
                                    <p className="text-xs font-bold text-white mb-1">
                                      P{p.numero || i + 1}: {p.texto || (typeof p === 'string' ? p : JSON.stringify(p))}
                                    </p>
                                    {p.descritores_primarios && (
                                      <p className="text-[9px] text-cyan-400/60">Descritores: {Array.isArray(p.descritores_primarios) ? p.descritores_primarios.map(d => `D${d}`).join(', ') : p.descritores_primarios}</p>
                                    )}
                                    {p.o_que_diferencia_niveis && (
                                      <p className="text-[10px] text-gray-500 mt-1">{p.o_que_diferencia_niveis}</p>
                                    )}
                                    {p.objetivo_diagnostico && (
                                      <p className="text-[9px] text-purple-300/60 mt-1">🎯 {p.objetivo_diagnostico}</p>
                                    )}
                                    {p.resposta_generica_falha_porque && (
                                      <p className="text-[9px] text-amber-300/60 mt-1">⚡ Anti-genérico: {p.resposta_generica_falha_porque}</p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Resultado do Check */}
                            {c.nota_check != null && (
                              <div className={`p-3 rounded-lg border mb-3 ${
                                c.status_check === 'aprovado' ? 'border-green-400/20 bg-green-400/5' :
                                c.status_check === 'aprovado_com_ressalvas' ? 'border-cyan-400/20 bg-cyan-400/5' :
                                'border-amber-400/20 bg-amber-400/5'
                              }`}>
                                <div className="flex items-center gap-2 mb-2">
                                  <span className={`text-xs font-bold ${
                                    c.status_check === 'aprovado' ? 'text-green-400' :
                                    c.status_check === 'aprovado_com_ressalvas' ? 'text-cyan-400' : 'text-amber-400'
                                  }`}>
                                    Check: {c.nota_check}pts — {
                                      c.status_check === 'aprovado' ? 'Aprovado' :
                                      c.status_check === 'aprovado_com_ressalvas' ? 'Aprovado com ressalvas' : 'Revisar'
                                    }
                                  </span>
                                </div>
                                {/* Dimensões */}
                                {dims && (
                                  <div className="flex flex-wrap gap-2 mb-2">
                                    {Object.entries(dims).map(([k, v]: [string, any]) => {
                                      const max = DIM_MAX[k] || 20;
                                      const pct = (v / max) * 100;
                                      return (
                                        <span key={k} className={`text-[9px] px-1.5 py-0.5 rounded ${
                                          pct >= 85 ? 'bg-green-400/10 text-green-400' :
                                          pct >= 65 ? 'bg-amber-400/10 text-amber-400' :
                                          'bg-red-400/10 text-red-400'
                                        }`}>
                                          {DIM_LABELS[k] || k}: {v}/{max}
                                        </span>
                                      );
                                    })}
                                  </div>
                                )}
                                {c.justificativa_check && (
                                  <p className="text-[10px] text-gray-400 mb-1"><span className="font-semibold text-gray-500">Justificativa:</span> {c.justificativa_check}</p>
                                )}
                                {c.sugestao_check && (
                                  <p className="text-[10px] text-gray-400"><span className="font-semibold text-amber-400/80">Sugestão:</span> {c.sugestao_check}</p>
                                )}
                                {/* Campos enriquecidos do check */}
                                {(() => {
                                  const al = typeof c.alertas_check === 'object' && !Array.isArray(c.alertas_check) ? c.alertas_check : {};
                                  return (
                                    <>
                                      {al.ponto_mais_forte && (
                                        <p className="text-[10px] text-green-300/80 mt-1">✦ Ponto forte: {al.ponto_mais_forte}</p>
                                      )}
                                      {al.ponto_mais_fraco && (
                                        <p className="text-[10px] text-amber-300/80 mt-1">⚠ Ponto fraco: {al.ponto_mais_fraco}</p>
                                      )}
                                      {Array.isArray(al.descritores_sem_cobertura) && al.descritores_sem_cobertura.length > 0 && (
                                        <p className="text-[10px] text-red-300/80 mt-1">✗ Descritores sem cobertura: {al.descritores_sem_cobertura.join(', ')}</p>
                                      )}
                                      {Array.isArray(al.perguntas_com_risco) && al.perguntas_com_risco.length > 0 && (
                                        <div className="mt-2 space-y-1">
                                          {al.perguntas_com_risco.map((p: any, j: number) => (
                                            <div key={j} className="text-[10px] text-amber-300/70 pl-2 border-l border-amber-400/20">
                                              P{p.numero}: {p.problema}{p.correcao_recomendada ? ` → ${p.correcao_recomendada}` : ''}
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </>
                                  );
                                })()}
                              </div>
                            )}

                            {/* Ações */}
                            <div className="flex items-center gap-2">
                              {(c.status_check === 'revisar' || c.status_check === 'aprovado_com_ressalvas') && (
                                <button disabled={isActing} onClick={async () => {
                                  setCenAction({ id: c.id, type: 'regen' });
                                  // 1. Regenerar
                                  const r = await regenerarCenario(c.id);
                                  if (!r.success) { setCenAction(null); flash('Erro: ' + r.error); return; }
                                  flash(r.message);
                                  // 2. Re-checar automaticamente
                                  const r2 = await checkCenarioUm(c.id);
                                  setCenAction(null);
                                  if (r2.success) flash(`Re-check: ${r2.nota}pts (${r2.nota >= 90 ? 'aprovado' : 'revisar'})`);
                                  refresh();
                                }}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold text-amber-400 border border-amber-400/30 hover:bg-amber-400/10 transition-all disabled:opacity-50">
                                  {isActing && cenAction.type === 'regen' ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                                  Regenerar com feedback
                                </button>
                              )}
                              {!c.nota_check && (
                                <button disabled={isActing} onClick={async () => {
                                  setCenAction({ id: c.id, type: 'check' });
                                  const r = await checkCenarioUm(c.id);
                                  setCenAction(null);
                                  if (r.success) { flash(`${c.titulo}: ${r.nota}pts`); refresh(); }
                                  else flash('Erro: ' + r.error);
                                }}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10 transition-all disabled:opacity-50">
                                  {isActing && cenAction.type === 'check' ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />}
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
            );
          })}
          </>)}
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
