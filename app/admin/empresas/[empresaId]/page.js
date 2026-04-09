'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';

function fmt(n) { return (n ?? 0).toLocaleString('pt-BR'); }

import { getCustomLabel, isHidden } from '@/lib/ui-resolver';
import {
  ArrowLeft, Building2, Users, Brain, Mail, Bot, GraduationCap, TrendingUp,
  Zap, Database, FileText, Send, ClipboardCheck, BarChart3, Target, Clock,
  Play, BookOpen, Layers, MessageSquare, FileBarChart, CheckCircle,
  Loader2, AlertTriangle, X, ChevronDown, ChevronUp, Trash2, Settings, Trophy, Plus, Filter, Search
} from 'lucide-react';

import { loadTop10TodosCargos, adicionarTop10, removerTop10, loadGabaritosCargos, listarFilaIA3, rodarIA3Uma, checkCenarioUm } from '@/actions/fase1';
import { listarPendentesSimulacao, simularUmaResposta } from '@/actions/simulador-conversas';
import { loadCompetencias } from '@/app/admin/competencias/actions';
import {
  loadEmpresaPipeline, excluirEmpresa, limparRegistros, limparMapeamento, loadColaboradoresLista,
  rodarIA1, rodarIA2, rodarIA3,
  verStatusEnvios,
  rodarIA4, checkAvaliacoes, gerarRelatoriosIndividuais, gerarRelatorioGestor, gerarRelatorioRH, enviarRelIndividuais, enviarRelGestor, enviarRelRH,
  gerarPDIs, gerarPDIsDescritores, montarTrilhasLote, criarEstruturaFase4, iniciarFase4ParaTodos, triggerSegundaFase4, triggerQuintaFase4, getStatusFase4, moodleImportarCatalogo, catalogarConteudosMoodle, gerarCoberturaConteudo,
  iniciarReavaliacaoLote, gerarRelatoriosEvolucaoLote, gerarPlenariaEvolucao, gerarRelatorioRHManual, gerarRelatorioPlenaria, enviarLinksPerfil, gerarDossieGestor, checkCenarios, dispararRelatoriosLote,
} from './actions';

// ── AI Models ──
const AI_MODELS = [
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', provider: 'claude' },
  { id: 'claude-opus-4-6', label: 'Claude Opus 4.6', provider: 'claude' },
  { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash', provider: 'gemini' },
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', provider: 'gemini' },
  { id: 'gpt-5.4', label: 'GPT 5.4', provider: 'openai' },
  { id: 'gpt-5.4-mini', label: 'GPT 5.4 Mini', provider: 'openai' },
];

const AI_ACTIONS = new Set([
  'ia1', 'ia2', 'ia3', 'ia4', 'check', 'rel-ind', 'rel-gestor', 'rel-rh',
  'pdis', 'moodle-cat', 'reav', 'evolucao', 'plenaria', 'rh-rel', 'rh-plen', 'rh-dossie', 'rh-check',
]);

const STATUS_COLORS = {
  pendente:  { bg: '#374151', text: '#9CA3AF', label: 'Pendente', dot: '#6B7280' },
  andamento: { bg: '#92400E', text: '#FCD34D', label: 'Em Andamento', dot: '#F59E0B' },
  concluido: { bg: '#065F46', text: '#6EE7B7', label: 'Concluído', dot: '#10B981' },
};

const PHASE_CONFIG = [
  { num: 0, icon: Building2, color: '#06B6D4', groups: [
    { label: 'Cadastro', actions: [
      { key: 'gerenciar', label: 'Colaboradores & Cargos', icon: Users, href: '/admin/empresas/gerenciar' },
      { key: 'competencias', label: 'Competências', icon: BookOpen, href: '/admin/competencias' },
      { key: 'ppp', label: 'Extrair PPPs', icon: FileText, href: '/admin/ppp' },
    ]},
    { label: 'Moodle', actions: [
      { key: 'moodle-imp', label: 'Importar Catálogo', icon: BookOpen },
      { key: 'moodle-cat', label: 'Catalogar Conteúdos', icon: BookOpen, ai: true },
      { key: 'cobertura', label: 'Cobertura', icon: BarChart3 },
    ]},
    { label: 'Sistema', actions: [
      { key: 'config', label: 'Configurações', icon: Settings, hrefFn: (id) => `/admin/empresas/${id}/configuracoes` },
    ]},
  ]},
  { num: 1, icon: Brain, color: '#3B82F6', actions: [
    { key: 'ia1', label: 'IA1 — Top 10', icon: Zap, ai: true },
    { key: 'cargos-top5', label: 'Top 5', icon: Target, href: '/admin/cargos' },
    { key: 'ia2', label: 'IA2 — Gabarito', icon: Zap, ai: true },
    { key: 'ia3', label: 'IA3 — Cenários + Check', icon: Zap, ai: 'dual' },
    { key: 'fit', label: 'Fit v2', icon: BarChart3, href: '/admin/fit' },
    { key: 'envios', label: 'Envios', icon: Send, href: '/admin/whatsapp' },
  ]},
  { num: 2, icon: Bot, color: '#EF4444', groups: [
    { label: 'Diagnóstico', actions: [
      { key: 'simular', label: 'Simular Respostas', icon: MessageSquare, ai: true },
      { key: 'ia4', label: 'Rodar IA4', icon: Zap, ai: true },
      { key: 'check', label: 'Check Avaliações', icon: CheckCircle, ai: true },
    ]},
    { label: 'Relatórios', actions: [
      { key: 'rel-ind', label: 'Individuais', icon: FileText, ai: true },
      { key: 'pdf-ind', label: 'PDF Individuais', icon: FileBarChart, href: '/admin/relatorios' },
      { key: 'rel-gestor', label: 'Gestor', icon: FileBarChart, ai: true },
      { key: 'rel-rh', label: 'RH', icon: FileBarChart, ai: true },
    ]},
    { label: 'Enviar', actions: [
      { key: 'env-ind', label: 'Individuais', icon: Send },
      { key: 'env-gestor', label: 'Gestor', icon: Send },
      { key: 'env-rh', label: 'RH', icon: Send },
      { key: 'enviar-lote', label: 'PDF + WhatsApp (Lote)', icon: Send },
    ]},
  ]},
  { num: 3, icon: GraduationCap, color: '#22C55E', groups: [
    { label: 'PDI', actions: [
      { key: 'pdis', label: 'Gerar PDIs', icon: Target, ai: true },
      { key: 'pdis-desc', label: 'PDIs Descritores', icon: FileText },
    ]},
    { label: 'Trilhas', actions: [
      { key: 'trilhas', label: 'Montar Trilhas', icon: Layers },
      { key: 'estrutura', label: 'Criar Estrutura', icon: Database },
      { key: 'iniciar', label: 'Iniciar Todos', icon: Play },
      { key: 'status-f4', label: 'Status', icon: BarChart3 },
    ]},
  ]},
  { num: 4, icon: TrendingUp, color: '#A78BFA', actions: [
    { key: 'reav', label: 'Reavaliação', icon: MessageSquare, ai: true },
    { key: 'evolucao', label: 'Evolução', icon: TrendingUp, ai: true },
    { key: 'plenaria', label: 'Plenária', icon: FileBarChart, ai: true },
  ]},
];

// Action dispatcher map
const ACTION_MAP = {
  ia1: rodarIA1, ia2: rodarIA2, ia3: rodarIA3,
  ia4: rodarIA4, check: checkAvaliacoes,
  'rel-ind': gerarRelatoriosIndividuais, 'rel-gestor': gerarRelatorioGestor, 'rel-rh': gerarRelatorioRH,
  'env-ind': enviarRelIndividuais, 'env-gestor': enviarRelGestor, 'env-rh': enviarRelRH, 'enviar-lote': dispararRelatoriosLote,
  pdis: gerarPDIs, 'pdis-desc': gerarPDIsDescritores, trilhas: montarTrilhasLote,
  estrutura: criarEstruturaFase4, iniciar: iniciarFase4ParaTodos,
  'trig-seg': triggerSegundaFase4, 'trig-qui': triggerQuintaFase4, 'status-f4': getStatusFase4,
  'moodle-imp': moodleImportarCatalogo, 'moodle-cat': catalogarConteudosMoodle, cobertura: gerarCoberturaConteudo,
  reav: iniciarReavaliacaoLote, evolucao: gerarRelatoriosEvolucaoLote, plenaria: gerarPlenariaEvolucao,
  'rh-rel': gerarRelatorioRHManual, 'rh-plen': gerarRelatorioPlenaria,
  'rh-links': enviarLinksPerfil, 'rh-dossie': gerarDossieGestor, 'rh-check': checkCenarios,
};

export default function EmpresaPipelinePage({ params }) {
  const { empresaId } = use(params);
  const router = useRouter();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingAction, setPendingAction] = useState(null);
  const [logs, setLogs] = useState([]);
  const [expandedPhase, setExpandedPhase] = useState(null);
  const [modelPicker, setModelPicker] = useState(null); // { actionKey, label, dual? }
  const [dualModel1, setDualModel1] = useState('claude-sonnet-4-6');
  const [dualModel2, setDualModel2] = useState('gemini-3-flash-preview');
  const [showDanger, setShowDanger] = useState(false);
  const [dangerLoading, setDangerLoading] = useState(false);
  const [dangerColabId, setDangerColabId] = useState(''); // '' = todos
  const [dangerColabs, setDangerColabs] = useState([]);

  // Top 10 state
  const [top10, setTop10] = useState([]);
  const [top10Comps, setTop10Comps] = useState([]);
  const [top10Loaded, setTop10Loaded] = useState(false);
  const [top10Cargo, setTop10Cargo] = useState('');
  const [showAddComp, setShowAddComp] = useState(null);
  const [addSearch, setAddSearch] = useState('');
  const [gabaritos, setGabaritos] = useState([]);
  const [gabExpanded, setGabExpanded] = useState(null);
  const [envioStatus, setEnvioStatus] = useState(null);

  const refreshTop10 = useCallback(async () => {
    const [t, c, g] = await Promise.all([
      loadTop10TodosCargos(empresaId),
      loadCompetencias(empresaId),
      loadGabaritosCargos(empresaId),
    ]);
    setTop10(t);
    if (c.success) setTop10Comps(c.data || []);
    setGabaritos(g);
    setTop10Loaded(true);
  }, [empresaId]);

  const addLog = useCallback((msg, type = 'info') => {
    setLogs(prev => [{ msg, type, ts: Date.now() }, ...prev].slice(0, 30));
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    const r = await loadEmpresaPipeline(empresaId);
    if (r.success) {
      setData(r);
      const active = r.fases.find(f => f.status === 'andamento');
      if (active && !expandedPhase) setExpandedPhase(active.num);
    } else {
      setError(r.error);
    }
    setLoading(false);
  }, [empresaId]);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleAction(actionKey, label, aiConfig) {
    const fn = ACTION_MAP[actionKey];

    setPendingAction(actionKey);
    const modelLabel = aiConfig ? ` [${AI_MODELS.find(m => m.id === aiConfig.model)?.label || aiConfig.model}]` : '';
    addLog(`▶ ${label}${modelLabel}`, 'info');

    try {
      // Simular respostas: uma por vez (Hobby 60s)
      if (actionKey === 'simular') {
        const fila = await listarPendentesSimulacao(empresaId);
        if (!fila?.success || !fila.data?.length) {
          addLog(`❌ ${fila?.error || 'Nenhuma simulação pendente'}`, 'error');
          setPendingAction(null);
          return;
        }
        const pendentes = fila.data.filter(f => !f.jaRespondido);
        const items = pendentes.length > 0 ? pendentes : fila.data;
        addLog(`📋 ${items.length} respostas para simular`, 'info');

        let ok = 0, erros = 0;
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          addLog(`⏳ [${i + 1}/${items.length}] ${item.nome} — ${item.cenario_titulo}`, 'info');
          const r = await simularUmaResposta(empresaId, item.colaborador_id, item.cenario_id, aiConfig || undefined);
          if (r.success) { ok++; addLog(`✅ ${r.message}`, 'success'); }
          else { erros++; addLog(`⚠ ${item.nome}: ${r.error}`, 'error'); }
        }
        addLog(`✅ Simulação concluída: ${ok} respostas${erros ? `, ${erros} erros` : ''}`, 'success');
        loadData();
        setPendingAction(null);
        return;
      }

      // IA3: gera cenário + valida, uma competência por vez
      if (actionKey === 'ia3') {
        const fila = await listarFilaIA3(empresaId);
        if (!fila?.success || !fila.data?.length) {
          addLog(`❌ ${fila?.error || 'Nenhuma competência na fila'}`, 'error');
          setPendingAction(null);
          return;
        }
        const pendentes = fila.data.filter(f => !f.jaGerado);
        const items = pendentes.length > 0 ? pendentes : fila.data;
        const checkModel = aiConfig?.checkModel;
        addLog(`📋 ${items.length} cenários para gerar${checkModel ? ' + validar' : ''}`, 'info');

        let gerados = 0, aprovados = 0, revisar = 0, erros = 0;
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          // 1. Gerar cenário
          addLog(`⏳ [${i + 1}/${items.length}] Gerando: ${item.nome} (${item.cargo})`, 'info');
          const r = await rodarIA3Uma(empresaId, item.cargo, item.competencia_id, aiConfig || undefined);
          if (!r.success) { erros++; addLog(`⚠ ${item.nome}: ${r.error}`, 'error'); continue; }
          gerados++;

          // 2. Validar (se modelo de check foi selecionado)
          if (checkModel) {
            addLog(`🔍 [${i + 1}/${items.length}] Validando: ${item.nome} [${checkModel}]`, 'info');
            try {
              const checkResult = await checkCenarioUm(null, empresaId, item.cargo, item.competencia_id, checkModel);
              if (checkResult.success) {
                if (checkResult.nota >= 90) { aprovados++; addLog(`✅ ${item.nome}: ${checkResult.nota}pts`, 'success'); }
                else { revisar++; addLog(`⚠ ${item.nome}: ${checkResult.nota}pts — revisar`, 'info'); }
              } else {
                addLog(`⚠ Check ${item.nome}: ${checkResult.error}`, 'error');
              }
            } catch (ce) {
              addLog(`⚠ Check erro: ${ce.message}`, 'error');
            }
          } else {
            addLog(`ℹ Sem modelo de validação selecionado`, 'info');
          }
        }
        let msg = `IA3 concluída: ${gerados} cenários gerados`;
        if (checkModel) msg += ` | ${aprovados} aprovados, ${revisar} para revisar`;
        if (erros) msg += ` | ${erros} erros`;
        addLog(`✅ ${msg}`, 'success');
        loadData();
        refreshTop10();
        setPendingAction(null);
        return;
      }

      if (!fn) { addLog(`Ação "${actionKey}" não encontrada`, 'error'); setPendingAction(null); return; }
      const result = await fn(empresaId, aiConfig || undefined);
      if (result?.success) {
        addLog(`✅ ${result.message || label + ' concluído'}`, 'success');
        loadData();
        if (actionKey === 'ia1' || actionKey === 'ia2') refreshTop10();
        if (actionKey === 'disparo') setEnvioStatus(null); // força refresh
      } else {
        addLog(`❌ ${result?.error || 'Erro desconhecido'}`, 'error');
      }
    } catch (e) {
      addLog(`❌ ${e.message}`, 'error');
    }
    setPendingAction(null);
  }

  function onActionClick(actionKey, label, isAI) {
    if (pendingAction) return;
    if (isAI) {
      setModelPicker({ actionKey, label, dual: isAI === 'dual' });
    } else {
      handleAction(actionKey, label);
    }
  }

  if (loading && !data) {
    return <div className="flex items-center justify-center h-dvh"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;
  }

  if (error && !data) {
    return (
      <div className="flex items-center justify-center h-dvh">
        <div className="text-center">
          <AlertTriangle size={40} className="text-red-400 mx-auto mb-3" />
          <p className="text-sm text-red-400">{error}</p>
          <button onClick={() => router.push('/admin/dashboard')} className="mt-4 text-xs text-cyan-400 hover:underline">Voltar</button>
        </div>
      </div>
    );
  }

  const { empresa, totalColab, fases } = data;
  const uiConfig = empresa.ui_config || null;
  const activeFase = fases.find(f => f.status === 'andamento');

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <img src="/logo-vertho.png" alt="Vertho" style={{ height: '24px' }} className="shrink-0" />
          <div className="text-center flex-1 px-4">
            <h1 className="text-xl font-bold text-white">{empresa.nome}</h1>
            <div className="flex items-center justify-center gap-4 mt-1">
              <span className="text-xs text-gray-500">
                {empresa.segmento === 'educacao' ? '🎓 Educação' : empresa.segmento === 'corporativo' ? '🏢 Corporativo' : '—'}
              </span>
              <span className="flex items-center gap-1 text-xs text-gray-400">
                <Users size={12} /> {fmt(totalColab)} colaboradores
              </span>
              {activeFase && (
                <span className="flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: '#92400E40', color: '#FCD34D' }}>
                  <span className="w-2 h-2 rounded-full animate-pulse inline-block" style={{ background: '#F59E0B' }} />
                  Fase {activeFase.num}
                </span>
              )}
            </div>
          </div>
          <button onClick={() => router.push('/admin/dashboard')} className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-white transition-colors shrink-0">
            <ArrowLeft size={16} /> Voltar
          </button>
        </div>
      </div>

      {/* Pipeline */}
      <div className="space-y-3 mb-6">
        {fases.map((fase, idx) => {
          const config = PHASE_CONFIG.find(p => p.num === fase.num);
          if (!config) return null;
          const Icon = config.icon;
          const st = STATUS_COLORS[fase.status];
          const isExpanded = expandedPhase === fase.num;
          const isActive = fase.status === 'andamento';

          return (
            <div key={fase.num} className="relative z-10 rounded-xl border overflow-hidden transition-all"
              style={{ borderColor: isActive ? config.color + '40' : 'rgba(255,255,255,0.04)', background: '#0F2A4A' }}>
              <button onClick={() => setExpandedPhase(isExpanded ? null : fase.num)}
                className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-white/[0.02] transition-colors">
                {/* Icon + status dot */}
                <div className="relative">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: config.color + '15' }}>
                    <Icon size={18} style={{ color: config.color }} />
                  </div>
                  <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 ${isActive ? 'animate-pulse' : ''}`}
                    style={{ background: st.dot, borderColor: '#0F2A4A' }} />
                </div>

                {/* Title + metrics */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">Fase {fase.num}</span>
                    <span className="text-xs text-gray-500">—</span>
                    <span className="text-xs text-gray-400 truncate">{getCustomLabel(`fase${fase.num}-titulo`, fase.titulo, uiConfig)}</span>
                  </div>
                  {fase.metricas?.length > 0 && (
                    <div className="flex items-center gap-3 mt-1">
                      {fase.metricas.map((m, i) => (
                        <span key={i} className="text-[10px] text-gray-500">
                          {m.label}: <span className="font-bold text-gray-300">{fmt(m.valor)}</span>
                          {m.total !== undefined && <span className="text-gray-600">/{fmt(m.total)}</span>}
                        </span>
                      ))}
                    </div>
                  )}
                  {/* Progress bar */}
                  {fase.progresso !== undefined && fase.progresso > 0 && (
                    <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: '#1F2937' }}>
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${fase.progresso}%`, background: config.color }} />
                    </div>
                  )}
                </div>

                {/* Status badge + progress % */}
                <div className="flex items-center gap-2 shrink-0">
                  {fase.progresso !== undefined && fase.progresso > 0 && (
                    <span className="text-[10px] font-bold" style={{ color: config.color }}>{fase.progresso}%</span>
                  )}
                  <span className="text-[10px] font-bold px-2 py-1 rounded-full" style={{ background: st.bg, color: st.text }}>{st.label}</span>
                  {isExpanded ? <ChevronUp size={14} className="text-gray-600" /> : <ChevronDown size={14} className="text-gray-600" />}
                </div>
              </button>

              {isExpanded && (
                <div className="px-5 pb-4 pt-1 border-t border-white/[0.04]">
                  {/* Fase 1: resumo compacto + link para detalhes */}
                  {fase.num === 1 && (() => {
                    if (!top10Loaded) refreshTop10();
                    const cargosTop10 = [...new Set(top10.map(t => t.cargo))].sort();
                    const hasData = top10.length > 0 || gabaritos.length > 0;
                    return hasData ? (
                      <div className="mb-3 mt-2 flex items-center gap-3 flex-wrap">
                        {cargosTop10.map(cargo => {
                          const count = top10.filter(t => t.cargo === cargo).length;
                          return <span key={cargo} className="text-[10px] text-gray-400">
                            <span className="text-white font-semibold">{cargo}</span>: {count} comp
                          </span>;
                        })}
                        {gabaritos.length > 0 && <span className="text-[10px] text-purple-400">{gabaritos.length} gabaritos</span>}
                        <button onClick={() => router.push(`/admin/empresas/${empresaId}/fase1`)}
                          className="text-[10px] font-bold text-cyan-400 hover:text-cyan-300 ml-auto">
                          Ver detalhes →
                        </button>
                      </div>
                    ) : null;
                  })()}

                  {/* Fase 1: status visual dos envios */}
                  {fase.num === 1 && (() => {
                    if (!envioStatus) {
                      verStatusEnvios(empresaId).then(r => { if (r.success) setEnvioStatus(r.resumo); });
                    }
                    return envioStatus && envioStatus.total > 0 ? (
                      <div className="mb-3 flex items-center gap-4 text-[10px]">
                        <span className="text-gray-500">Convites:</span>
                        <span className="text-gray-400">Total: <span className="text-white font-bold">{envioStatus.total}</span></span>
                        {envioStatus.pendente > 0 && <span className="text-gray-400">Pendente: <span className="text-amber-400 font-bold">{envioStatus.pendente}</span></span>}
                        {envioStatus.enviado > 0 && <span className="text-gray-400">Enviado: <span className="text-cyan-400 font-bold">{envioStatus.enviado}</span></span>}
                        {envioStatus.respondido > 0 && <span className="text-gray-400">Respondido: <span className="text-green-400 font-bold">{envioStatus.respondido}</span></span>}
                      </div>
                    ) : null;
                  })()}

                  {config.groups ? (
                    config.groups.map((group, gi) => {
                      const visibleActions = group.actions.filter(a => !isHidden(`btn-fase${fase.num}-${a.key}`, uiConfig));
                      if (visibleActions.length === 0) return null;
                      return (
                        <div key={gi} className="mb-3 last:mb-0">
                          {group.label && <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">{group.label}</p>}
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {visibleActions.map(a => (
                              <ActionBtn key={a.key} action={a} phase={fase} config={config}
                                pending={pendingAction} isActive={isActive}
                                onAction={onActionClick} empresaId={empresaId} uiConfig={uiConfig} />
                            ))}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {config.actions.filter(a => !isHidden(`btn-fase${fase.num}-${a.key}`, uiConfig)).map(a => (
                        <ActionBtn key={a.key} action={a} phase={fase} config={config}
                          pending={pendingAction} isActive={isActive}
                          onAction={onActionClick} empresaId={empresaId} uiConfig={uiConfig} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Danger zone */}
      <div className="mb-6">
        <button onClick={() => setShowDanger(!showDanger)}
          className="flex items-center gap-2 text-[11px] font-semibold text-gray-600 hover:text-gray-400 transition-colors">
          <Settings size={12} /> Configurações avançadas
        </button>
        {showDanger && (
          <div className="mt-3 p-4 rounded-xl border border-red-400/15" style={{ background: 'rgba(239,68,68,0.03)' }}>
            <p className="text-[10px] font-bold text-red-400/70 uppercase tracking-widest mb-3">Zona de Perigo</p>

            {/* Seletor de escopo */}
            <div className="mb-4 p-3 rounded-lg border border-white/[0.06]" style={{ background: '#091D35' }}>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Escopo da limpeza</p>
              <select
                value={dangerColabId}
                onChange={e => setDangerColabId(e.target.value)}
                onFocus={async () => { if (dangerColabs.length === 0) { const c = await loadColaboradoresLista(empresaId); setDangerColabs(c); } }}
                className="w-full px-3 py-2 rounded-lg text-xs text-white border border-white/10 outline-none"
                style={{ background: '#0F2A4A' }}>
                <option value="">Todos os colaboradores</option>
                {dangerColabs.map(c => (
                  <option key={c.id} value={c.id}>{c.nome_completo || c.email}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2 mb-4">
              {[
                { label: 'Limpar Mapeamento Comportamental', action: 'mapeamento' },
                { label: 'Limpar Fase 1 (cenários, cargos)', tabelas: ['banco_cenarios', 'cargos'] },
                { label: 'Limpar Fase 2 (envios)', tabelas: ['envios_diagnostico'] },
                { label: 'Limpar Fase 3 (respostas, avaliações)', tabelas: ['respostas', 'sessoes_avaliacao', 'mensagens_chat'] },
                { label: 'Limpar Fase 4 (trilhas, capacitação)', tabelas: ['trilhas', 'capacitacao', 'fase4_envios'] },
                { label: 'Limpar Fase 5 (evolução)', tabelas: ['evolucao', 'evolucao_descritores'] },
                { label: 'Limpar colaboradores', tabelas: ['colaboradores'] },
                { label: 'Limpar competências', tabelas: ['competencias'] },
                { label: 'Limpar PPPs', tabelas: ['ppp_escolas'] },
                { label: 'LIMPAR TUDO', tabelas: ['evolucao', 'evolucao_descritores', 'capacitacao', 'trilhas', 'fase4_envios', 'sessoes_avaliacao', 'mensagens_chat', 'respostas', 'envios_diagnostico', 'banco_cenarios', 'cargos', 'competencias', 'ppp_escolas'], danger: true },
              ].map(item => {
                const scope = dangerColabId ? dangerColabs.find(c => c.id === dangerColabId)?.nome_completo || 'colaborador' : 'todos';
                return (
                  <button key={item.label} disabled={dangerLoading}
                    onClick={async () => {
                      if (!confirm(`${item.label} (${scope})?\n\nEsta ação não pode ser desfeita.`)) return;
                      setDangerLoading(true);
                      let r;
                      if (item.action === 'mapeamento') {
                        r = await limparMapeamento(empresaId, dangerColabId || null);
                      } else {
                        r = await limparRegistros(empresaId, item.tabelas, dangerColabId || null);
                      }
                      if (r.success) { addLog(`🗑️ ${item.label} (${scope}) — concluído`, 'success'); loadData(); }
                      else addLog(`❌ ${item.label}: ${r.error}`, 'error');
                      setDangerLoading(false);
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-all disabled:opacity-30 ${
                      item.danger
                        ? 'text-red-400 border-red-400/20 hover:bg-red-400/10 font-bold'
                        : 'text-gray-400 border-white/[0.04] hover:border-red-400/30 hover:text-red-400'
                    }`}
                    style={{ background: '#091D35' }}>
                    <Trash2 size={12} /> {item.label}
                    {dangerColabId && <span className="text-[9px] text-gray-600 ml-auto">(individual)</span>}
                  </button>
                );
              })}
            </div>

            <button disabled={dangerLoading}
              onClick={async () => {
                if (!confirm(`EXCLUIR a empresa "${empresa.nome}" e TODOS os dados?\n\nEsta ação é IRREVERSÍVEL.`)) return;
                setDangerLoading(true);
                const r = await excluirEmpresa(empresaId);
                if (r.success) router.push('/admin/dashboard');
                else { addLog(`❌ ${r.error}`, 'error'); setDangerLoading(false); }
              }}
              className="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-lg text-sm font-bold text-red-400 border border-red-400/30 hover:bg-red-400/10 disabled:opacity-30">
              {dangerLoading ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Excluir Empresa Permanentemente
            </button>
          </div>
        )}
      </div>

      {/* Log */}
      {logs.length > 0 && (
        <div className="rounded-xl border border-white/[0.06] overflow-hidden" style={{ background: '#0F2A4A' }}>
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.04]">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Log</span>
            <button onClick={() => setLogs([])} className="text-gray-600 hover:text-gray-400"><X size={12} /></button>
          </div>
          <div className="max-h-[200px] overflow-y-auto divide-y divide-white/[0.02]">
            {logs.map(l => (
              <div key={l.ts} className="px-4 py-2 flex items-start gap-2">
                <span className={`text-[10px] font-mono shrink-0 ${l.type === 'success' ? 'text-green-400' : l.type === 'error' ? 'text-red-400' : 'text-gray-500'}`}>
                  {new Date(l.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
                <span className={`text-xs ${l.type === 'success' ? 'text-green-400' : l.type === 'error' ? 'text-red-400' : 'text-gray-400'}`}>{l.msg}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Model Picker */}
      {modelPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="w-full max-w-xs rounded-2xl border border-white/[0.08] p-5" style={{ background: '#0A1D35' }}>
            <h3 className="text-sm font-bold text-white mb-1">{modelPicker.label}</h3>

            {modelPicker.dual ? (
              <>
                <p className="text-[10px] text-gray-500 mb-3">Selecione um modelo para cada etapa</p>
                <div className="mb-3">
                  <p className="text-[9px] font-bold text-cyan-400 uppercase tracking-widest mb-1">Geração</p>
                  <select value={dualModel1} onChange={e => setDualModel1(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-xs text-white border border-white/10 outline-none" style={{ background: '#091D35' }}>
                    {AI_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                </div>
                <div className="mb-4">
                  <p className="text-[9px] font-bold text-amber-400 uppercase tracking-widest mb-1">Validação</p>
                  <select value={dualModel2} onChange={e => setDualModel2(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-xs text-white border border-white/10 outline-none" style={{ background: '#091D35' }}>
                    {AI_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                </div>
                <button onClick={() => {
                  const { actionKey, label } = modelPicker;
                  setModelPicker(null);
                  handleAction(actionKey, label, { model: dualModel1, checkModel: dualModel2 });
                }}
                  className="w-full py-2.5 rounded-lg text-xs font-bold text-white bg-teal-600 hover:bg-teal-500 transition-colors mb-2">
                  Executar
                </button>
              </>
            ) : (
              <>
                <p className="text-[10px] text-gray-500 mb-4">Selecione o modelo de IA</p>
                <div className="space-y-2 mb-4">
                  {AI_MODELS.map(m => (
                    <button key={m.id} onClick={() => {
                      const { actionKey, label } = modelPicker;
                      setModelPicker(null);
                      handleAction(actionKey, label, { model: m.id, thinking: false });
                    }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium text-gray-300 border border-white/[0.06] hover:border-cyan-400/30 hover:bg-cyan-400/5 transition-all"
                      style={{ background: '#091D35' }}>
                      <Zap size={12} className="text-cyan-400" /> {m.label}
                    </button>
                  ))}
                </div>
              </>
            )}
            <button onClick={() => setModelPicker(null)} className="w-full py-2 text-xs font-semibold text-gray-500 hover:text-white">Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ActionBtn({ action, phase, config, pending, isActive, onAction, empresaId, uiConfig }) {
  const isPending = pending === action.key;
  const isDisabled = !!pending;
  const AIcon = action.icon;
  const label = getCustomLabel(`btn-fase${phase.num}-${action.key}`, action.label, uiConfig);
  const isCTA = isActive && !action.href;

  if (action.href || action.hrefFn) {
    const href = action.hrefFn ? action.hrefFn(empresaId) : `${action.href}?empresa=${empresaId}`;
    return (
      <a href={isDisabled ? undefined : href}
        className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium border transition-all ${
          isDisabled ? 'border-white/[0.04] text-gray-600 cursor-not-allowed pointer-events-none' : 'border-white/[0.06] text-gray-300 hover:border-white/[0.15] hover:bg-white/[0.03]'
        }`} style={{ background: '#091D35' }}>
        <AIcon size={14} style={{ color: isDisabled ? '#374151' : config.color }} className="shrink-0" />
        <span className="leading-tight">{label}</span>
      </a>
    );
  }

  return (
    <button onClick={() => onAction(action.key, label, action.ai)} disabled={isDisabled}
      className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium border transition-all ${
        isDisabled ? 'border-white/[0.04] text-gray-600 cursor-not-allowed'
          : isCTA ? 'border-white/[0.1] text-white hover:brightness-110' : 'border-white/[0.06] text-gray-300 hover:border-white/[0.15]'
      }`}
      style={{ background: isCTA ? config.color + '18' : '#091D35' }}>
      {isPending ? <Loader2 size={14} className="animate-spin shrink-0" style={{ color: config.color }} />
        : <AIcon size={14} style={{ color: isDisabled ? '#374151' : config.color }} className="shrink-0" />}
      <span className="leading-tight">{isPending ? 'Processando...' : label}</span>
    </button>
  );
}
