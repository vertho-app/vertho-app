'use client';
import { toast } from 'sonner';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Loader2, TrendingUp, FileText, ChevronDown,
  CheckCircle, AlertTriangle, RefreshCw, Zap,
} from 'lucide-react';
import BackButton from '@/components/back-button';
import { useConfirm } from '@/components/admin/confirm-dialog';
import { loadCenariosB } from '@/actions/fase5';
import { checkCenarioBUm, regenerarCenarioB, regenerarERecheckarCenariosBLote } from '../actions';

const CHECK_DIM_MAX: Record<string, number> = {
  // Check B 8 dimensões
  aderencia_competencia: 15, diferenca_estrutural_vs_a: 15, complementaridade: 10,
  realismo_contextual: 10, clareza_tradeoff: 15, poder_discriminante: 15,
  adequacao_sem14: 10, utilidade_triangulacao: 10,
  // Check A 7 dimensões (fallback)
  cobertura_descritores: 15, contencao_sobriedade: 10, auditabilidade: 10,
  // Legacy
  aderencia: 20, realismo: 20, contencao: 20, decisao: 20, discriminante: 20,
};
const CHECK_DIM_LABEL_KEYS: Record<string, string> = {
  aderencia_competencia: 'adherence',
  diferenca_estrutural_vs_a: 'differenceVsA',
  complementaridade: 'complementarity',
  realismo_contextual: 'realism',
  clareza_tradeoff: 'tradeoffClarity',
  poder_discriminante: 'discriminatingPower',
  adequacao_sem14: 'week14Fit',
  utilidade_triangulacao: 'triangulation',
  cobertura_descritores: 'coverage',
  contencao_sobriedade: 'restraint',
  auditabilidade: 'auditability',
  aderencia: 'adherence',
  realismo: 'realism',
  contencao: 'restraint',
  decisao: 'decision',
  discriminante: 'discriminatingPower',
};

const AI_MODELS = [
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite' },
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
  { id: 'gpt-5.4-2026-03-05', label: 'GPT 5.4' },
  { id: 'gpt-5.4-mini', label: 'GPT 5.4 Mini' },
];

export default function Fase4Page({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = use(params);
  const router = useRouter();
  const t = useTranslations('AdminPhase4');
  const confirmDialog = useConfirm();

  const [cenariosB, setCenariosB] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);
  const [actionId, setActionId] = useState(null);
  const [genModel, setGenModel] = useState('claude-sonnet-4-6');
  const [checkModel, setCheckModel] = useState('gemini-3.1-flash-lite');
  function flash(msg) { toast(msg); }

  async function refresh() {
    const data = await loadCenariosB(empresaId);
    setCenariosB(data);
    setLoading(false);
  }

  useEffect(() => { refresh(); }, [empresaId]);

  async function handleRechecar(id) {
    setActionId(id);
    flash(t('messages.rechecking'));
    const r = await checkCenarioBUm(id, checkModel);
    setActionId(null);
    flash(r.success ? (r as any).message : t('messages.error', { error: (r as any).error }));
    refresh();
  }

  async function handleRegenerar(id: string) {
    setActionId(id);
    flash(t('messages.regenerating'));
    // O regen já audita a candidata e só aplica se a nota não piorar (trava
    // champion/challenger) — a mensagem traz o veredito; sem re-check por fora.
    const r1: any = await regenerarCenarioB(id, { model: genModel, checkModel } as any);
    flash(r1.success ? (r1.message || t('messages.regenerated', { message: '' })) : t('messages.error', { error: r1.error }));
    setActionId(null);
    refresh();
  }

  async function handleRegenerarLote() {
    const abaixoDe90 = cenariosB.filter(c => c.status_check === 'revisar' || c.status_check === 'aprovado_com_ressalvas').length;
    if (!abaixoDe90) { flash(t('messages.noneToRegenerate')); return; }
    const ok = await confirmDialog({
      title: t('confirm.regenerateBatch', { count: abaixoDe90 }),
      severity: 'danger',
      scopeNote: `Operação cara de IA — regenera e re-checa ${abaixoDe90} cenário(s) B em lote`,
    });
    if (!ok) return;
    setActionId('lote');
    flash(t('messages.processing', { count: abaixoDe90 }));
    const r = await regenerarERecheckarCenariosBLote(empresaId, { model: genModel, checkModel });
    setActionId(null);
    flash(r.success ? r.message : t('messages.error', { error: r.error }));
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

      {/* Header */}
      <BackButton onClick={() => router.push(`/admin/empresas/${empresaId}`)} />
      <div className="flex items-center gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <TrendingUp size={20} className="text-purple-400" /> {t('title')}
          </h1>
          <p className="text-xs text-gray-500">{t('subtitle')}</p>
        </div>
      </div>

      {/* Seletor de modelos */}
      <div className="flex items-center gap-3 mb-4 p-3 rounded-xl border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
        <div className="flex-1">
          <p className="text-[9px] font-bold text-cyan-400 uppercase tracking-widest mb-1">{t('model.generation')}</p>
          <select value={genModel} onChange={e => setGenModel(e.target.value)}
            className="w-full px-2 py-1.5 rounded-lg text-[11px] text-white border border-white/10 outline-none" style={{ background: '#091D35' }}>
            {AI_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>
        <div className="flex-1">
          <p className="text-[9px] font-bold text-amber-400 uppercase tracking-widest mb-1">{t('model.validation')}</p>
          <select value={checkModel} onChange={e => setCheckModel(e.target.value)}
            className="w-full px-2 py-1.5 rounded-lg text-[11px] text-white border border-white/10 outline-none" style={{ background: '#091D35' }}>
            {AI_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-3 mb-3 text-[10px] flex-wrap">
        <span className="text-gray-400">{t('stats.scenariosB')}: <span className="text-white font-bold">{cenariosB.length}</span></span>
        {cenariosB.filter(c => c.status_check === 'aprovado').length > 0 && (
          <span className="bg-green-400/15 text-green-400 px-1.5 py-0.5 rounded font-bold">
            {t('stats.approved', { count: cenariosB.filter(c => c.status_check === 'aprovado').length })}
          </span>
        )}
        {cenariosB.filter(c => c.status_check === 'aprovado_com_ressalvas').length > 0 && (
          <span className="bg-cyan-400/15 text-cyan-400 px-1.5 py-0.5 rounded font-bold">
            {t('stats.withNotes', { count: cenariosB.filter(c => c.status_check === 'aprovado_com_ressalvas').length })}
          </span>
        )}
        {cenariosB.filter(c => c.status_check === 'revisar').length > 0 && (
          <span className="bg-amber-400/15 text-amber-400 px-1.5 py-0.5 rounded font-bold">
            {t('stats.review', { count: cenariosB.filter(c => c.status_check === 'revisar').length })}
          </span>
        )}
        {cenariosB.filter(c => !c.status_check).length > 0 && (
          <span className="bg-gray-400/15 text-gray-400 px-1.5 py-0.5 rounded font-bold">
            {t('stats.pending', { count: cenariosB.filter(c => !c.status_check).length })}
          </span>
        )}
      </div>

      {/* Ações em lote */}
      {cenariosB.filter(c => c.status_check === 'revisar' || c.status_check === 'aprovado_com_ressalvas').length > 0 && (
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <button disabled={actionId === 'lote'} onClick={handleRegenerarLote}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-bold text-amber-400 border border-amber-400/30 hover:bg-amber-400/10 transition-all disabled:opacity-50">
            {actionId === 'lote' ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            {t('actions.regenerateReviewBatch', { count: cenariosB.filter(c => c.status_check === 'revisar' || c.status_check === 'aprovado_com_ressalvas').length })}
          </button>
        </div>
      )}

      {/* Lista */}
      {cenariosB.length === 0 ? (
        <div className="text-center py-12">
          <FileText size={32} className="text-gray-600 mx-auto mb-3" />
          <p className="text-sm text-gray-500">{t('empty')}</p>
        </div>
      ) : (
        Object.entries(porCargo).map(([cargo, cens]: [string, any]) => {
          const aprovados = cens.filter((c: any) => c.status_check === 'aprovado').length;
          const ressalvas = cens.filter((c: any) => c.status_check === 'aprovado_com_ressalvas').length;
          const revisar = cens.filter((c: any) => c.status_check === 'revisar').length;
          const pendentes = cens.filter((c: any) => !c.status_check).length;

          return (
            <div key={cargo} className="mb-6">
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-sm font-bold text-white">{cargo}</h2>
                <span className="text-[10px] text-gray-500">{t('stats.scenarios', { count: cens.length })}</span>
                {aprovados > 0 && <span className="text-[9px] bg-green-400/15 text-green-400 px-1.5 py-0.5 rounded">{t('stats.approved', { count: aprovados })}</span>}
                {ressalvas > 0 && <span className="text-[9px] bg-cyan-400/15 text-cyan-400 px-1.5 py-0.5 rounded">{t('stats.withNotes', { count: ressalvas })}</span>}
                {revisar > 0 && <span className="text-[9px] bg-amber-400/15 text-amber-400 px-1.5 py-0.5 rounded">{t('stats.review', { count: revisar })}</span>}
                {pendentes > 0 && <span className="text-[9px] bg-gray-400/15 text-gray-400 px-1.5 py-0.5 rounded">{t('stats.pending', { count: pendentes })}</span>}
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
                      c.status_check === 'aprovado_com_ressalvas' ? 'border-cyan-400/20' :
                      c.status_check === 'revisar' ? 'border-amber-400/20' : 'border-white/[0.06]'
                    }`} style={{ background: '#0F2A4A' }}>
                      <button onClick={() => setOpenId(isOpen ? null : c.id)}
                        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.02] transition-colors">
                        <div className="flex-1 min-w-0 flex items-center gap-2">
                          {c.status_check === 'aprovado' && <CheckCircle size={14} className="text-green-400 shrink-0" />}
                          {c.status_check === 'aprovado_com_ressalvas' && <CheckCircle size={14} className="text-cyan-400 shrink-0" />}
                          {c.status_check === 'revisar' && <AlertTriangle size={14} className="text-amber-400 shrink-0" />}
                          <span className="text-xs font-bold text-white">{c.titulo || t('fallbackScenarioTitle')}</span>
                          {c.competencia_nome && <span className="text-[10px] text-purple-400">{c.competencia_nome}</span>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {c.nota_check != null && (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                              c.status_check === 'aprovado' ? 'bg-green-400/15 text-green-400' :
                              c.status_check === 'aprovado_com_ressalvas' ? 'bg-cyan-400/15 text-cyan-400' :
                              'bg-amber-400/15 text-amber-400'
                            }`}>{t('details.points', { value: c.nota_check })}</span>
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
                                {alt.objetivo_diagnostico?.[`p${i+1}`] && (
                                  <p className="text-[9px] text-purple-300/60 mt-1">{'\uD83C\uDFAF'} {alt.objetivo_diagnostico[`p${i+1}`]}</p>
                                )}
                              </div>
                            ))}
                          </div>

                          {/* Faceta avaliada */}
                          {faceta && (
                            <div className="mb-3">
                              <p className="text-[9px] font-bold text-purple-400 uppercase tracking-widest mb-1">{t('details.evaluatedFacet')}</p>
                              <p className="text-xs text-gray-300">{faceta}</p>
                            </div>
                          )}

                          {/* Novos campos enriquecidos */}
                          {alt.diferenca_estrutural_vs_cenario_a && (
                            <div className="mb-2">
                              <p className="text-[9px] font-bold text-cyan-400 uppercase tracking-widest mb-0.5">{t('details.differenceVsA')}</p>
                              <p className="text-xs text-gray-300">{alt.diferenca_estrutural_vs_cenario_a}</p>
                            </div>
                          )}
                          {alt.por_que_essa_variacao_importa && (
                            <p className="text-[10px] text-gray-400 mb-2 italic">{'\u21B3'} {alt.por_que_essa_variacao_importa}</p>
                          )}
                          {alt.tradeoff_testado && (
                            <div className="mb-2">
                              <p className="text-[9px] font-bold text-amber-400 uppercase tracking-widest mb-0.5">{t('details.tradeoff')}</p>
                              <p className="text-xs text-gray-300">{alt.tradeoff_testado}</p>
                            </div>
                          )}
                          {alt.armadilha_de_resposta_generica && (
                            <div className="mb-2">
                              <p className="text-[9px] font-bold text-red-300 uppercase tracking-widest mb-0.5">{t('details.genericTrap')}</p>
                              <p className="text-xs text-gray-400">{alt.armadilha_de_resposta_generica}</p>
                            </div>
                          )}
                          {Array.isArray(alt.facetas_secundarias) && alt.facetas_secundarias.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-2">
                              {alt.facetas_secundarias.map((f: string, j: number) => (
                                <span key={j} className="text-[9px] px-1.5 py-0.5 rounded bg-purple-400/10 text-purple-300">{f}</span>
                              ))}
                            </div>
                          )}
                          {typeof alt.confianca_cenario === 'number' && (
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-[9px] text-gray-500">{t('details.confidence')}:</span>
                              <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden max-w-[100px]">
                                <div className="h-full rounded-full" style={{ width: `${Math.round(alt.confianca_cenario * 100)}%`, background: alt.confianca_cenario >= 0.8 ? '#34D399' : alt.confianca_cenario >= 0.6 ? '#FBBF24' : '#F87171' }} />
                              </div>
                              <span className="text-[9px] text-gray-400">{Math.round(alt.confianca_cenario * 100)}%</span>
                            </div>
                          )}

                          {/* Dilema ético */}
                          {dilema && (
                            <div className="mb-3 p-3 rounded-lg border border-amber-400/20 bg-amber-400/5">
                              <p className="text-[9px] font-bold text-amber-400 uppercase tracking-widest mb-1">{t('details.ethicalDilemma')}</p>
                              <p className="text-xs text-gray-300">{t('details.value')}: {dilema.valor_testado}</p>
                              {dilema.caminho_facil && <p className="text-[10px] text-gray-500 mt-1">{t('details.easyPath')}: {dilema.caminho_facil}</p>}
                              {dilema.caminho_etico && <p className="text-[10px] text-gray-500">{t('details.ethicalPath')}: {dilema.caminho_etico}</p>}
                            </div>
                          )}

                          {/* Referência de avaliação */}
                          {refAval && (
                            <div className="mb-3">
                              <p className="text-[9px] font-bold text-cyan-400 uppercase tracking-widest mb-1">{t('details.evaluationReference')}</p>
                              {Object.entries(refAval).map(([k, v]: [string, any]) => (
                                <p key={k} className="text-[10px] text-gray-400"><span className="text-white font-bold">{k}:</span> {v}</p>
                              ))}
                            </div>
                          )}

                          {/* Validação Gemini */}
                          {alt.validacao_gemini && (
                            <div className="mb-3 p-2 rounded-lg bg-cyan-400/5 border border-cyan-400/20">
                              <p className="text-[9px] font-bold text-cyan-400">{t('details.geminiValidation')}: {alt.validacao_gemini.aprovado ? t('status.approved') : t('status.rejected')}</p>
                              {alt.validacao_gemini.motivo && <p className="text-[10px] text-gray-400">{alt.validacao_gemini.motivo}</p>}
                            </div>
                          )}

                          {/* Check result */}
                          {c.nota_check != null && (
                            <div className={`p-3 rounded-lg border ${
                              c.status_check === 'aprovado' ? 'border-green-400/20 bg-green-400/5' :
                              c.status_check === 'aprovado_com_ressalvas' ? 'border-cyan-400/20 bg-cyan-400/5' :
                              'border-amber-400/20 bg-amber-400/5'
                            }`}>
                              <span className={`text-xs font-bold ${
                                c.status_check === 'aprovado' ? 'text-green-400' :
                                c.status_check === 'aprovado_com_ressalvas' ? 'text-cyan-400' :
                                'text-amber-400'
                              }`}>
                                {t('details.check')}: {t('details.points', { value: c.nota_check })} — {c.status_check === 'aprovado' ? t('status.approved') : c.status_check === 'aprovado_com_ressalvas' ? t('status.approvedWithNotes') : t('status.review')}
                              </span>
                              {dims && (
                                <div className="flex flex-wrap gap-2 mt-2">
                                  {Object.entries(dims).map(([k, v]: [string, any]) => {
                                    const mx = CHECK_DIM_MAX[k] || 20;
                                    const pct = (v / mx) * 100;
                                    const labelKey = CHECK_DIM_LABEL_KEYS[k];
                                    const label = labelKey ? t(`checkDimensions.${labelKey}`) : k;
                                    return (
                                      <span key={k} className={`text-[9px] px-1.5 py-0.5 rounded ${pct >= 90 ? 'bg-green-400/10 text-green-400' : pct >= 70 ? 'bg-amber-400/10 text-amber-400' : 'bg-red-400/10 text-red-400'}`}>
                                        {label}: {v}/{mx}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                              {c.justificativa_check && <p className="text-[10px] text-gray-400 mt-2">{c.justificativa_check}</p>}
                              {c.sugestao_check && <p className="text-[10px] text-amber-300 mt-1">{t('details.suggestion')}: {c.sugestao_check}</p>}
                              {(() => {
                                const al = typeof c.alertas_check === 'object' && !Array.isArray(c.alertas_check) ? c.alertas_check : {};
                                return (
                                  <>
                                    {al.ponto_mais_forte && <p className="text-[10px] text-green-300/80 mt-1">{'\u2726'} {al.ponto_mais_forte}</p>}
                                    {al.ponto_mais_fraco && <p className="text-[10px] text-amber-300/80 mt-1">{'\u26A0'} {al.ponto_mais_fraco}</p>}
                                    {al.problema_principal_vs_cenario_a && (
                                      <p className="text-[10px] text-purple-300/80 mt-1">↔ {t('details.vsScenarioA')}: {al.problema_principal_vs_cenario_a}</p>
                                    )}
                                    {Array.isArray(al.riscos_de_triangulacao) && al.riscos_de_triangulacao.length > 0 && (
                                      <p className="text-[10px] text-red-300/80 mt-1">△ {t('details.triangulationRisks')}: {al.riscos_de_triangulacao.join('; ')}</p>
                                    )}
                                    {Array.isArray(al.descritores_sem_cobertura) && al.descritores_sem_cobertura.length > 0 && (
                                      <p className="text-[10px] text-red-300/80 mt-1">{'\u2717'} {t('details.noCoverage')}: {al.descritores_sem_cobertura.join(', ')}</p>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                          )}

                          {/* Ações */}
                          <div className="flex items-center gap-2 pt-3 mt-3 border-t border-white/[0.04]">
                            {c.nota_check == null && (
                              <button disabled={actionId === c.id} onClick={() => handleRechecar(c.id)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10 transition-all disabled:opacity-50">
                                {actionId === c.id ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />}
                                {t('actions.validate')}
                              </button>
                            )}
                            {c.nota_check != null && (c.status_check === 'revisar' || c.status_check === 'aprovado_com_ressalvas') && (
                              <>
                                <button disabled={actionId === c.id} onClick={() => handleRegenerar(c.id)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold text-amber-400 border border-amber-400/30 hover:bg-amber-400/10 transition-all disabled:opacity-50">
                                  {actionId === c.id ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                                  {t('actions.regenerateAndRecheck')}
                                </button>
                                <button disabled={actionId === c.id} onClick={() => handleRechecar(c.id)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10 transition-all disabled:opacity-50">
                                  {actionId === c.id ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
                                  {t('actions.recheckOnly')}
                                </button>
                              </>
                            )}
                            {c.nota_check != null && c.status_check === 'aprovado' && (
                              <button disabled={actionId === c.id} onClick={() => handleRegenerar(c.id)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold text-gray-400 border border-white/10 hover:bg-white/5 transition-all disabled:opacity-50">
                                {actionId === c.id ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                                {t('actions.regenerate')}
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
