'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Loader2, TrendingUp, FileText, ChevronDown,
  CheckCircle, AlertTriangle, RefreshCw, Zap,
} from 'lucide-react';
import { loadCenariosB } from '@/actions/fase5';
import { checkCenarioBUm, regenerarCenarioB, regenerarERecheckarCenariosBLote } from '../actions';

const AI_MODELS = [
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
  { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash' },
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro' },
  { id: 'gpt-5.4', label: 'GPT 5.4' },
  { id: 'gpt-5.4-mini', label: 'GPT 5.4 Mini' },
];

export default function Fase4Page({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = use(params);
  const router = useRouter();

  const [cenariosB, setCenariosB] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);
  const [toast, setToast] = useState(null);
  const [actionId, setActionId] = useState(null);
  const [genModel, setGenModel] = useState('claude-sonnet-4-6');
  const [checkModel, setCheckModel] = useState('gemini-3-flash-preview');
  function flash(msg) { setToast(msg); setTimeout(() => setToast(null), 3000); }

  async function refresh() {
    const data = await loadCenariosB(empresaId);
    setCenariosB(data);
    setLoading(false);
  }

  useEffect(() => { refresh(); }, [empresaId]);

  async function handleRechecar(id) {
    setActionId(id);
    flash('Rechecando...');
    const r = await checkCenarioBUm(id, checkModel);
    setActionId(null);
    flash(r.success ? (r as any).message : 'Erro: ' + (r as any).error);
    refresh();
  }

  async function handleRegenerar(id: string) {
    setActionId(id);
    flash('Regenerando...');
    const r1 = await regenerarCenarioB(id, { model: genModel });
    if (r1.success) {
      flash('Rechecando...');
      const r2 = await checkCenarioBUm(id, checkModel);
      flash(r2.success ? `Regenerado. ${(r2 as any).message}` : 'Regenerado. Erro check: ' + (r2 as any).error);
    } else {
      flash('Erro: ' + (r1 as any).error);
    }
    setActionId(null);
    refresh();
  }

  async function handleRegenerarLote() {
    const abaixoDe90 = cenariosB.filter(c => c.nota_check != null && c.nota_check < 90).length;
    if (!abaixoDe90) { flash('Nenhum cenário abaixo de 90'); return; }
    if (!confirm(`Regenerar + rechecar ${abaixoDe90} cenários abaixo de 90?`)) return;
    setActionId('lote');
    flash(`Processando ${abaixoDe90} cenários...`);
    const r = await regenerarERecheckarCenariosBLote(empresaId, { model: genModel, checkModel });
    setActionId(null);
    flash(r.success ? r.message : 'Erro: ' + r.error);
    refresh();
  }


  // Agrupar por cargo
  const porCargo = {};
  cenariosB.forEach(c => {
    if (!porCargo[c.cargo]) porCargo[c.cargo] = [];
    porCargo[c.cargo].push(c);
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
            <TrendingUp size={20} className="text-purple-400" /> Fase 4 — Reavalia{'\u00e7\u00e3o'}
          </h1>
          <p className="text-xs text-gray-500">Cen{'\u00e1'}rios B, Reavalia{'\u00e7\u00e3o'} e Evolu{'\u00e7\u00e3o'}</p>
        </div>
      </div>

      {/* Seletor de modelos */}
      <div className="flex items-center gap-3 mb-4 p-3 rounded-xl border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
        <div className="flex-1">
          <p className="text-[9px] font-bold text-cyan-400 uppercase tracking-widest mb-1">Gera{'\u00e7\u00e3o'}</p>
          <select value={genModel} onChange={e => setGenModel(e.target.value)}
            className="w-full px-2 py-1.5 rounded-lg text-[11px] text-white border border-white/10 outline-none" style={{ background: '#091D35' }}>
            {AI_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>
        <div className="flex-1">
          <p className="text-[9px] font-bold text-amber-400 uppercase tracking-widest mb-1">Valida{'\u00e7\u00e3o'}</p>
          <select value={checkModel} onChange={e => setCheckModel(e.target.value)}
            className="w-full px-2 py-1.5 rounded-lg text-[11px] text-white border border-white/10 outline-none" style={{ background: '#091D35' }}>
            {AI_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-3 mb-3 text-[10px] flex-wrap">
        <span className="text-gray-400">Cen{'\u00e1'}rios B: <span className="text-white font-bold">{cenariosB.length}</span></span>
        {cenariosB.filter(c => c.status_check === 'aprovado').length > 0 && (
          <span className="bg-green-400/15 text-green-400 px-1.5 py-0.5 rounded font-bold">
            {cenariosB.filter(c => c.status_check === 'aprovado').length} aprovados
          </span>
        )}
        {cenariosB.filter(c => c.status_check === 'revisar').length > 0 && (
          <span className="bg-amber-400/15 text-amber-400 px-1.5 py-0.5 rounded font-bold">
            {cenariosB.filter(c => c.status_check === 'revisar').length} revisar
          </span>
        )}
        {cenariosB.filter(c => !c.status_check).length > 0 && (
          <span className="bg-gray-400/15 text-gray-400 px-1.5 py-0.5 rounded font-bold">
            {cenariosB.filter(c => !c.status_check).length} pendentes
          </span>
        )}
      </div>

      {/* Ações em lote */}
      {cenariosB.filter(c => c.nota_check != null && c.nota_check < 90).length > 0 && (
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <button disabled={actionId === 'lote'} onClick={handleRegenerarLote}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-bold text-amber-400 border border-amber-400/30 hover:bg-amber-400/10 transition-all disabled:opacity-50">
            {actionId === 'lote' ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Regenerar + Rechecar {'<'}90 ({cenariosB.filter(c => c.nota_check != null && c.nota_check < 90).length})
          </button>
        </div>
      )}

      {/* Lista */}
      {cenariosB.length === 0 ? (
        <div className="text-center py-12">
          <FileText size={32} className="text-gray-600 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Nenhum cen{'\u00e1'}rio B encontrado. Rode "Gerar Cen{'\u00e1'}rios B" na pipeline.</p>
        </div>
      ) : (
        Object.entries(porCargo).map(([cargo, cens]: [string, any]) => {
          const aprovados = cens.filter((c: any) => c.status_check === 'aprovado').length;
          const revisar = cens.filter((c: any) => c.status_check === 'revisar').length;
          const pendentes = cens.filter((c: any) => !c.status_check).length;

          return (
            <div key={cargo} className="mb-6">
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-sm font-bold text-white">{cargo}</h2>
                <span className="text-[10px] text-gray-500">{cens.length} cen{'\u00e1'}rios</span>
                {aprovados > 0 && <span className="text-[9px] bg-green-400/15 text-green-400 px-1.5 py-0.5 rounded">{aprovados} aprovados</span>}
                {revisar > 0 && <span className="text-[9px] bg-amber-400/15 text-amber-400 px-1.5 py-0.5 rounded">{revisar} revisar</span>}
                {pendentes > 0 && <span className="text-[9px] bg-gray-400/15 text-gray-400 px-1.5 py-0.5 rounded">{pendentes} pendentes</span>}
              </div>

              <div className="space-y-2">
                {cens.map((c: any) => {
                  const isOpen = openId === c.id;
                  const dims = typeof c.dimensoes_check === 'string' ? JSON.parse(c.dimensoes_check) : c.dimensoes_check;
                  const alt = c.alternativas || {};
                  const dilema = alt.dilema_etico || alt.dilema_etico_embutido;
                  const faceta = alt.faceta_avaliada;
                  const refAval = alt.referencia_avaliacao;

                  return (
                    <div key={c.id} className={`rounded-xl border overflow-hidden ${
                      c.status_check === 'aprovado' ? 'border-green-400/20' :
                      c.status_check === 'revisar' ? 'border-amber-400/20' : 'border-white/[0.06]'
                    }`} style={{ background: '#0F2A4A' }}>
                      <button onClick={() => setOpenId(isOpen ? null : c.id)}
                        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.02] transition-colors">
                        <div className="flex-1 min-w-0 flex items-center gap-2">
                          {c.status_check === 'aprovado' && <CheckCircle size={14} className="text-green-400 shrink-0" />}
                          {c.status_check === 'revisar' && <AlertTriangle size={14} className="text-amber-400 shrink-0" />}
                          <span className="text-xs font-bold text-white">{c.titulo || 'Cen\u00e1rio B'}</span>
                          {c.competencia_nome && <span className="text-[10px] text-purple-400">{c.competencia_nome}</span>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {c.nota_check != null && (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                              c.nota_check >= 90 ? 'bg-green-400/15 text-green-400' : 'bg-amber-400/15 text-amber-400'
                            }`}>{c.nota_check}pts</span>
                          )}
                          <ChevronDown size={14} className={`text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                        </div>
                      </button>

                      {isOpen && (
                        <div className="px-4 pb-4 border-t border-white/[0.04]">
                          <p className="text-xs text-gray-300 leading-relaxed mt-3 mb-4">{c.descricao}</p>

                          {/* Perguntas P1-P4 */}
                          <div className="space-y-2 mb-4">
                            {[alt.p1, alt.p2, alt.p3, alt.p4].map((p, i) => p && (
                              <div key={i} className="p-3 rounded-lg" style={{ background: '#091D35' }}>
                                <p className="text-xs font-bold text-white">P{i + 1}: {p}</p>
                              </div>
                            ))}
                          </div>

                          {/* Faceta avaliada */}
                          {faceta && (
                            <div className="mb-3">
                              <p className="text-[9px] font-bold text-purple-400 uppercase tracking-widest mb-1">Faceta Avaliada</p>
                              <p className="text-xs text-gray-300">{faceta}</p>
                            </div>
                          )}

                          {/* Dilema ético */}
                          {dilema && (
                            <div className="mb-3 p-3 rounded-lg border border-amber-400/20 bg-amber-400/5">
                              <p className="text-[9px] font-bold text-amber-400 uppercase tracking-widest mb-1">Dilema {'\u00c9'}tico</p>
                              <p className="text-xs text-gray-300">Valor: {dilema.valor_testado}</p>
                              {dilema.caminho_facil && <p className="text-[10px] text-gray-500 mt-1">Caminho f{'\u00e1'}cil: {dilema.caminho_facil}</p>}
                              {dilema.caminho_etico && <p className="text-[10px] text-gray-500">{`Caminho \u00e9tico`}: {dilema.caminho_etico}</p>}
                            </div>
                          )}

                          {/* Referência de avaliação */}
                          {refAval && (
                            <div className="mb-3">
                              <p className="text-[9px] font-bold text-cyan-400 uppercase tracking-widest mb-1">{`Refer\u00eancia de Avalia\u00e7\u00e3o`}</p>
                              {Object.entries(refAval).map(([k, v]: [string, any]) => (
                                <p key={k} className="text-[10px] text-gray-400"><span className="text-white font-bold">{k}:</span> {v}</p>
                              ))}
                            </div>
                          )}

                          {/* Validação Gemini */}
                          {alt.validacao_gemini && (
                            <div className="mb-3 p-2 rounded-lg bg-cyan-400/5 border border-cyan-400/20">
                              <p className="text-[9px] font-bold text-cyan-400">Valida{'\u00e7\u00e3o'} Gemini: {alt.validacao_gemini.aprovado ? 'Aprovado' : 'Reprovado'}</p>
                              {alt.validacao_gemini.motivo && <p className="text-[10px] text-gray-400">{alt.validacao_gemini.motivo}</p>}
                            </div>
                          )}

                          {/* Check result */}
                          {c.nota_check != null && (
                            <div className={`p-3 rounded-lg border ${
                              c.status_check === 'aprovado' ? 'border-green-400/20 bg-green-400/5' : 'border-amber-400/20 bg-amber-400/5'
                            }`}>
                              <span className={`text-xs font-bold ${c.status_check === 'aprovado' ? 'text-green-400' : 'text-amber-400'}`}>
                                Check: {c.nota_check}pts — {c.status_check === 'aprovado' ? 'Aprovado' : 'Revisar'}
                              </span>
                              {dims && (
                                <div className="flex flex-wrap gap-2 mt-2">
                                  {Object.entries(dims).map(([k, v]: [string, any]) => (
                                    <span key={k} className={`text-[9px] px-1.5 py-0.5 rounded ${v >= 18 ? 'bg-green-400/10 text-green-400' : v >= 14 ? 'bg-amber-400/10 text-amber-400' : 'bg-red-400/10 text-red-400'}`}>
                                      {k}: {v}/20
                                    </span>
                                  ))}
                                </div>
                              )}
                              {c.justificativa_check && <p className="text-[10px] text-gray-400 mt-2">{c.justificativa_check}</p>}
                              {c.sugestao_check && <p className="text-[10px] text-amber-300 mt-1">{`Sugest\u00e3o`}: {c.sugestao_check}</p>}
                            </div>
                          )}

                          {/* Ações */}
                          <div className="flex items-center gap-2 pt-3 mt-3 border-t border-white/[0.04]">
                            {c.nota_check == null && (
                              <button disabled={actionId === c.id} onClick={() => handleRechecar(c.id)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10 transition-all disabled:opacity-50">
                                {actionId === c.id ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />}
                                Validar
                              </button>
                            )}
                            {c.nota_check != null && c.nota_check < 90 && (
                              <>
                                <button disabled={actionId === c.id} onClick={() => handleRegenerar(c.id)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold text-amber-400 border border-amber-400/30 hover:bg-amber-400/10 transition-all disabled:opacity-50">
                                  {actionId === c.id ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                                  Regenerar + Rechecar
                                </button>
                                <button disabled={actionId === c.id} onClick={() => handleRechecar(c.id)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10 transition-all disabled:opacity-50">
                                  {actionId === c.id ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
                                  S{'\u00f3'} Rechecar
                                </button>
                              </>
                            )}
                            {c.nota_check != null && c.nota_check >= 90 && (
                              <button disabled={actionId === c.id} onClick={() => handleRegenerar(c.id)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold text-gray-400 border border-white/10 hover:bg-white/5 transition-all disabled:opacity-50">
                                {actionId === c.id ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                                Regenerar
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
        })
      )}
    </div>
  );
}
