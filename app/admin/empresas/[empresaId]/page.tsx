'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';

function fmt(n: any) { return (n ?? 0).toLocaleString('pt-BR'); }

import { getCustomLabel, isHidden } from '@/lib/ui-resolver';
import {
  ArrowLeft, Building2, Users, Brain, Mail, Bot, GraduationCap, TrendingUp,
  Zap, Database, FileText, Send, ClipboardCheck, BarChart3, Target, Clock,
  Play, BookOpen, Layers, MessageSquare, FileBarChart, CheckCircle,
  Loader2, AlertTriangle, X, ChevronDown, ChevronUp, Trash2, Settings, Trophy, Plus, Filter, Search, RefreshCw, Film, Sparkles
} from 'lucide-react';

import { loadTop10TodosCargos, adicionarTop10, removerTop10, loadGabaritosCargos, listarFilaIA3, rodarIA3Uma, checkCenarioUm } from '@/actions/fase1';
import { listarPendentesSimulacao, simularUmaResposta } from '@/actions/simulador-conversas';
import { simularMapeamentoDISCLote } from '@/actions/simulador-disc';
import { gerarRelatorioIndividual, gerarRelatoriosIndividuaisLote, gerarRelatorioGestor as gerarRelGestor, gerarRelatorioRH as gerarRelRH } from '@/actions/relatorios';
import { loadCompetencias } from '@/app/admin/competencias/actions';
import { gerarTemporadasLote } from '@/actions/temporadas';
import {
  loadEmpresaPipeline, excluirEmpresa, limparRegistros, limparMapeamento, limparMapeamentoCompetencias, limparCenariosB, limparReavaliacaoSessoes, definirSenhaTesteEmpresa, loadColaboradoresLista,
  rodarIA1, rodarIA2, rodarIA3,
  verStatusEnvios,
  rodarIA4, rodarIA4Uma, listarPendentesIA4, checkAvaliacoes,
  montarTrilhasLote, salvarCompetenciaFoco, loadCompetenciasFoco,
  gerarCenariosBLote, gerarRelatoriosEvolucaoLote, gerarPlenariaEvolucao, gerarRelatorioRHManual, gerarRelatorioPlenaria, enviarLinksPerfil, gerarDossieGestor, checkCenarios,
} from './actions';

// ── AI Models ──────────────────────────────────────────────────────────────
const AI_MODELS = [
  { id: 'claude-sonnet-4-6',      label: 'Claude Sonnet 4.6', provider: 'claude' },
  { id: 'claude-opus-4-6',        label: 'Claude Opus 4.6',   provider: 'claude' },
  { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash',    provider: 'gemini' },
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro',    provider: 'gemini' },
  { id: 'gpt-5.4',                label: 'GPT 5.4',           provider: 'openai' },
  { id: 'gpt-5.4-mini',           label: 'GPT 5.4 Mini',      provider: 'openai' },
];

const AI_ACTIONS = new Set([
  'ia1','ia2','ia3','ia4','rel-ind','rel-gestor','rel-rh',
  'pdis','evolucao','plenaria','rh-rel','rh-plen','rh-dossie','rh-check','temporadas',
]);

// ── Status ─────────────────────────────────────────────────────────────────
const STATUS_CFG = {
  pendente:  { label: 'Pendente',      dot: '#6B7280', bg: 'rgba(55,65,81,.5)',    text: '#9CA3AF' },
  andamento: { label: 'Em Andamento',  dot: '#F59E0B', bg: 'rgba(146,64,14,.35)',  text: '#FCD34D' },
  concluido: { label: 'Concluído',     dot: '#10B981', bg: 'rgba(6,95,70,.35)',    text: '#6EE7B7' },
};

// ── Phase config ───────────────────────────────────────────────────────────
const PHASE_CONFIG = [
  { num: 0, icon: Building2, color: '#06B6D4', groups: [
    { label: 'Cadastro', actions: [
      { key: 'gerenciar',      label: 'Colaboradores & Cargos', icon: Users,        href: '/admin/empresas/gerenciar' },
      { key: 'competencias',   label: 'Competências',            icon: BookOpen,     href: '/admin/competencias' },
      { key: 'ppp',            label: 'Extrair PPPs',            icon: FileText,     href: '/admin/ppp' },
      { key: 'preferencias',   label: 'Preferências',            icon: GraduationCap,hrefFn: (id: string) => `/admin/empresas/${id}/fase0?tab=preferencias` },
      { key: 'knowledge-base', label: 'Knowledge Base (RAG)',    icon: Database,     hrefFn: (id: string) => `/admin/vertho/knowledge-base?empresa=${id}` },
    ]},
    { label: 'Conteúdo', actions: [
      { key: 'videos', label: 'Vídeos (Bunny)', icon: Film, hrefFn: (id: string) => `/admin/videos?empresa=${id}` },
    ]},
    { label: 'Sistema', actions: [
      { key: 'config', label: 'Configurações', icon: Settings, hrefFn: (id: string) => `/admin/empresas/${id}/configuracoes` },
    ]},
  ]},
  { num: 1, icon: Brain, color: '#3B82F6', actions: [
    { key: 'ia1',         label: 'IA1 — Top 10',               icon: Zap,          ai: true },
    { key: 'votacao',     label: 'Votação Colaboradores',       icon: Users,        hrefFn: (id: string) => `/admin/empresas/${id}/votacao` },
    { key: 'cargos-top5', label: 'Top 5',                       icon: Target,       href: '/admin/cargos' },
    { key: 'ia2',         label: 'IA2 — Perfil Ideal',          icon: Zap,          ai: true },
    { key: 'ia3',         label: 'IA3 — Cenários + Check',      icon: Zap,          ai: 'dual' },
    { key: 'fit',         label: 'Fit Cargo Ideal',             icon: BarChart3,    href: '/admin/fit' },
    { key: 'simular-disc',label: 'Simular Mapeamento DISC',     icon: MessageSquare,ai: false },
    { key: 'envios',      label: 'Envios',                      icon: Send,         href: '/admin/whatsapp' },
  ]},
  { num: 2, icon: Bot, color: '#EF4444', groups: [
    { label: 'Diagnóstico', actions: [
      { key: 'simular', label: 'Simular Respostas',      icon: MessageSquare, ai: true },
      { key: 'ia4',     label: 'IA4 — Avaliar + Check', icon: Zap,           ai: 'dual' },
    ]},
    { label: 'Trilhas', actions: [
      { key: 'foco', label: 'Competências Foco', icon: Target },
    ]},
    { label: 'Relatórios', actions: [
      { key: 'rel-ind',    label: 'Gerar PDI', icon: FileText,   ai: true },
      { key: 'rel-gestor', label: 'Gestor',    icon: FileBarChart, ai: true },
      { key: 'rel-rh',     label: 'RH',        icon: FileBarChart, ai: true },
    ]},
    { label: 'Enviar', actions: [
      { key: 'envios-rel', label: 'Enviar Relatórios', icon: Send, href: '/admin/whatsapp' },
    ]},
  ]},
  { num: 3, icon: GraduationCap, color: '#22C55E', groups: [
    { label: 'Temporadas', actions: [
      { key: 'assessment',    label: 'Assessment Descritores', icon: ClipboardCheck, hrefFn: (id: string) => `/admin/assessment-descritores?empresa=${id}` },
      { key: 'temporadas',    label: 'Gerar Temporadas',       icon: Sparkles,       ai: true },
      { key: 'temporadas-ver',label: 'Ver Temporadas',         icon: Layers,         hrefFn: (id: string) => `/admin/temporadas?empresa=${id}` },
    ]},
  ]},
  { num: 4, icon: TrendingUp, color: '#A78BFA', groups: [
    { label: 'Reavaliação', actions: [
      { key: 'cenarios-b', label: 'Cenários B + Check', icon: Zap, ai: 'dual' },
    ]},
    { label: 'Auditoria Vertho (interna)', actions: [
      { key: 'vertho-evidencias', label: 'Evidências Semanais',  icon: Sparkles,      hrefFn: (id: string) => `/admin/vertho/evidencias?empresa=${id}` },
      { key: 'vertho-acumulada',  label: 'Avaliação Acumulada', icon: ClipboardCheck, hrefFn: (id: string) => `/admin/vertho/avaliacao-acumulada?empresa=${id}` },
      { key: 'vertho-sem14',      label: 'Auditoria Sem 14',    icon: ClipboardCheck, hrefFn: (id: string) => `/admin/vertho/auditoria-sem14?empresa=${id}` },
    ]},
    { label: 'Evolução', actions: [
      { key: 'evolucao-temp', label: 'Evolution Report (Temporadas)', icon: TrendingUp,   hrefFn: (id: string) => `/admin/evolucao?empresa=${id}` },
      { key: 'evolucao',      label: 'Evolução (Fusão 3 Fontes)',     icon: TrendingUp,   ai: true },
      { key: 'plenaria',      label: 'Plenária Evolução',             icon: FileBarChart, ai: true },
    ]},
  ]},
];

const ACTION_MAP: Record<string, Function> = {
  ia1: rodarIA1, ia2: rodarIA2, ia3: rodarIA3,
  ia4: rodarIA4,
  'simular-disc': simularMapeamentoDISCLote,
  trilhas: montarTrilhasLote,
  temporadas: gerarTemporadasLote,
  'cenarios-b': gerarCenariosBLote, evolucao: gerarRelatoriosEvolucaoLote, plenaria: gerarPlenariaEvolucao,
  'rh-rel': gerarRelatorioRHManual, 'rh-plen': gerarRelatorioPlenaria,
  'rh-links': enviarLinksPerfil, 'rh-dossie': gerarDossieGestor, 'rh-check': checkCenarios,
};

// ── Serif italic shorthand ─────────────────────────────────────────────────
const serif: React.CSSProperties = {
  fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
  fontStyle: 'italic',
  fontWeight: 400,
};

export default function EmpresaPipelinePage({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = use(params);
  const router = useRouter();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [expandedPhase, setExpandedPhase] = useState<number | null>(null);
  const [modelPicker, setModelPicker] = useState<any>(null);
  const [dualModel1, setDualModel1] = useState('claude-sonnet-4-6');
  const [dualModel2, setDualModel2] = useState('gemini-3-flash-preview');
  const [showDanger, setShowDanger] = useState(false);
  const [dangerLoading, setDangerLoading] = useState(false);
  const [dangerColabId, setDangerColabId] = useState('');
  const [dangerColabs, setDangerColabs] = useState<any[]>([]);
  const [top10, setTop10] = useState<any[]>([]);
  const [top10Comps, setTop10Comps] = useState<any[]>([]);
  const [top10Loaded, setTop10Loaded] = useState(false);
  const [top10Cargo, setTop10Cargo] = useState('');
  const [showAddComp, setShowAddComp] = useState<any>(null);
  const [addSearch, setAddSearch] = useState('');
  const [gabaritos, setGabaritos] = useState<any[]>([]);
  const [gabExpanded, setGabExpanded] = useState<any>(null);
  const [envioStatus, setEnvioStatus] = useState<any>(null);
  const [focoData, setFocoData] = useState<any>(null);

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

  const addLog = useCallback((msg: string, type = 'info') => {
    setLogs(prev => {
      if (prev[0]?.msg === msg && prev[0]?.type === type) return prev;
      return [{
        id: typeof crypto !== 'undefined' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        msg, type, ts: Date.now(),
      }, ...prev].slice(0, 30);
    });
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    const r = await loadEmpresaPipeline(empresaId);
    if (r.success) {
      setData(r);
      const active = r.fases.find((f: any) => f.status === 'andamento');
      if (active && !expandedPhase) setExpandedPhase(active.num);
    } else {
      setError(r.error);
    }
    setLoading(false);
  }, [empresaId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── handleAction — INALTERADO ──────────────────────────────────────────
  async function handleAction(actionKey: string, label: string, aiConfig?: any) {
    const fn = ACTION_MAP[actionKey];
    setPendingAction(actionKey);
    const modelLabel = aiConfig ? ` [${AI_MODELS.find(m => m.id === aiConfig.model)?.label || aiConfig.model}]` : '';
    addLog(`▶ ${label}${modelLabel}`, 'info');

    try {
      if (actionKey === 'foco') {
        const r = await loadCompetenciasFoco(empresaId);
        if (r.success) { setFocoData(r.data || []); addLog(`Competências foco carregadas (${(r.data || []).length} cargos)`, 'info'); }
        else addLog(`❌ ${r.error || 'Erro ao carregar'}`, 'error');
        setPendingAction(null); return;
      }
      if (actionKey === 'rel-ind') {
        const fila = await gerarRelatoriosIndividuaisLote(empresaId);
        if (!fila?.success || !fila.data?.length) { addLog(`${fila?.message || fila?.error || 'Nenhum relatório pendente'}`, fila?.success ? 'success' : 'error'); setPendingAction(null); return; }
        addLog(`📋 ${fila.data.length} relatórios para gerar`, 'info');
        let ok = 0, erros = 0;
        for (let i = 0; i < fila.data.length; i++) {
          addLog(`⏳ [${i + 1}/${fila.data.length}] Gerando relatório...`, 'info');
          const r = await gerarRelatorioIndividual(empresaId, fila.data[i], aiConfig || undefined);
          if (r.success) { ok++; addLog(`✅ ${r.message}`, 'success'); } else { erros++; addLog(`⚠ ${r.error}`, 'error'); }
        }
        addLog(`✅ Relatórios: ${ok} gerados${erros ? `, ${erros} erros` : ''}`, 'success');
        setPendingAction(null); return;
      }
      if (actionKey === 'ia4') {
        const checkModel = aiConfig?.checkModel;
        addLog(`⏳ Listando respostas pendentes...`, 'info');
        const fila = await listarPendentesIA4(empresaId);
        if (!fila.success || !fila.data?.length) { addLog(fila.data?.length === 0 ? '✅ Nenhuma resposta pendente' : `❌ ${fila.error}`, fila.data?.length === 0 ? 'success' : 'error'); setPendingAction(null); return; }
        addLog(`📋 ${fila.data.length} respostas pendentes. Avaliando uma por vez...`, 'info');
        let ok = 0, erros = 0;
        for (let i = 0; i < fila.data.length; i++) {
          addLog(`⏳ [${i + 1}/${fila.data.length}] Avaliando...`, 'info');
          const r = await rodarIA4Uma(empresaId, fila.data[i].id, aiConfig || undefined);
          if (r.success) { ok++; addLog(`✅ ${r.message}`, 'success'); } else { erros++; addLog(`⚠ ${r.error}`, 'error'); }
        }
        addLog(`✅ IA4: ${ok} avaliadas${erros ? `, ${erros} erros` : ''}`, 'success');
        if (ok > 0 && checkModel) { addLog(`🔍 Validando com ${checkModel}...`, 'info'); const r2 = await checkAvaliacoes(empresaId, { model: checkModel }); addLog(r2.success ? `✅ ${r2.message}` : `⚠ Check falhou: ${r2.error}`, r2.success ? 'success' : 'error'); }
        loadData(); setPendingAction(null); return;
      }
      if (actionKey === 'rel-gestor') { const r = await gerarRelGestor(empresaId, aiConfig || undefined); addLog(r.success ? `✅ ${r.message}` : `❌ ${r.error}`, r.success ? 'success' : 'error'); setPendingAction(null); return; }
      if (actionKey === 'rel-rh') { const r = await gerarRelRH(empresaId, aiConfig || undefined); addLog(r.success ? `✅ ${r.message}` : `❌ ${r.error}`, r.success ? 'success' : 'error'); setPendingAction(null); return; }
      if (actionKey === 'simular') {
        const fila = await listarPendentesSimulacao(empresaId);
        if (!fila?.success || !fila.data?.length) { addLog(`❌ ${fila?.error || 'Nenhuma simulação pendente'}`, 'error'); setPendingAction(null); return; }
        const items = fila.data.filter((f: any) => !f.jaRespondido).length > 0 ? fila.data.filter((f: any) => !f.jaRespondido) : fila.data;
        addLog(`📋 ${items.length} respostas para simular`, 'info');
        let ok = 0, erros = 0;
        for (let i = 0; i < items.length; i++) { const item = items[i]; addLog(`⏳ [${i + 1}/${items.length}] ${item.nome} — ${item.cenario_titulo}`, 'info'); const r = await simularUmaResposta(empresaId, item.colaborador_id, item.cenario_id, aiConfig || undefined); if (r.success) { ok++; addLog(`✅ ${r.message}`, 'success'); } else { erros++; addLog(`⚠ ${item.nome}: ${r.error}`, 'error'); } }
        addLog(`✅ Simulação: ${ok} respostas${erros ? `, ${erros} erros` : ''}`, 'success');
        loadData(); setPendingAction(null); return;
      }
      if (actionKey === 'ia3') {
        const fila = await listarFilaIA3(empresaId);
        if (!fila?.success || !fila.data?.length) { addLog(`❌ ${fila?.error || 'Nenhuma competência na fila'}`, 'error'); setPendingAction(null); return; }
        const items = fila.data.filter((f: any) => !f.jaGerado).length > 0 ? fila.data.filter((f: any) => !f.jaGerado) : fila.data;
        const checkModel = aiConfig?.checkModel;
        addLog(`📋 ${items.length} cenários para gerar${checkModel ? ' + validar' : ''}`, 'info');
        let gerados = 0, aprovados = 0, revisar = 0, erros = 0;
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          addLog(`⏳ [${i + 1}/${items.length}] Gerando: ${item.nome} (${item.cargo})`, 'info');
          const r = await rodarIA3Uma(empresaId, item.cargo, item.competencia_id, aiConfig || undefined);
          if (!r.success) { erros++; addLog(`⚠ ${item.nome}: ${r.error}`, 'error'); continue; }
          gerados++;
          if (checkModel) {
            addLog(`🔍 [${i + 1}/${items.length}] Validando: ${item.nome} [${checkModel}]`, 'info');
            try {
              const cr = await checkCenarioUm(null, empresaId, item.cargo, item.competencia_id, checkModel);
              if (cr.success) { if (cr.nota >= 90) { aprovados++; addLog(`✅ ${item.nome}: ${cr.nota}pts`, 'success'); } else { revisar++; addLog(`⚠ ${item.nome}: ${cr.nota}pts`, 'info'); } }
              else addLog(`⚠ Check ${item.nome}: ${cr.error}`, 'error');
            } catch (ce: any) { addLog(`⚠ Check erro: ${ce.message}`, 'error'); }
          }
        }
        addLog(`✅ IA3: ${gerados} gerados${checkModel ? ` | ${aprovados}✓ ${revisar}⚠` : ''}${erros ? ` | ${erros}❌` : ''}`, 'success');
        loadData(); refreshTop10(); setPendingAction(null); return;
      }
      if (actionKey === 'temporadas') {
        const { listarColabsParaTrilha } = await import('@/actions/fase4');
        const { gerarTemporada } = await import('@/actions/temporadas');
        const r = await listarColabsParaTrilha(empresaId);
        const colabs = r?.colabs || [];
        if (!colabs.length) { addLog('Nenhum colaborador encontrado', 'error'); setPendingAction(null); return; }
        if (r?.trilhasExistentes > 0 && !window.confirm(`Já existem ${r.trilhasExistentes} trilha(s). Regenerar? Continuar?`)) { addLog('Cancelado', 'info'); setPendingAction(null); return; }
        addLog(`📋 Gerando temporada para ${colabs.length} colab(s)`, 'info');
        let ok = 0, erros = 0;
        for (let i = 0; i < colabs.length; i++) {
          const c = colabs[i];
          addLog(`[${i + 1}/${colabs.length}] ${c.nome_completo}...`, 'info');
          try { const r2 = await gerarTemporada({ colaboradorId: c.id, aiConfig }); if (r2.ok) { ok++; addLog(`  ✅ ${c.nome_completo}`, 'success'); } else { erros++; addLog(`  ❌ ${c.nome_completo}: ${r2.error}`, 'error'); } }
          catch (e: any) { erros++; addLog(`  ❌ ${c.nome_completo}: ${e.message}`, 'error'); }
        }
        addLog(`🎉 Lote: ${ok}/${colabs.length}${erros ? ` (${erros} erros)` : ''}`, ok === colabs.length ? 'success' : 'info');
        loadData(); setPendingAction(null); return;
      }
      if (!fn) { addLog(`Ação "${actionKey}" não encontrada`, 'error'); setPendingAction(null); return; }
      const result = await fn(empresaId, aiConfig || undefined);
      if (result?.success) { addLog(`✅ ${result.message || label + ' concluído'}`, 'success'); loadData(); if (actionKey === 'ia1' || actionKey === 'ia2') refreshTop10(); }
      else addLog(`❌ ${result?.error || 'Erro desconhecido'}`, 'error');
    } catch (e: any) { addLog(`❌ ${e.message}`, 'error'); }
    setPendingAction(null);
  }

  function onActionClick(actionKey: string, label: string, isAI?: any) {
    if (pendingAction) return;
    if (isAI) setModelPicker({ actionKey, label, dual: isAI === 'dual' });
    else handleAction(actionKey, label);
  }

  // ── Loading / error states ─────────────────────────────────────────────
  if (loading && !data) return (
    <div className="flex items-center justify-center h-dvh">
      <Loader2 size={28} className="animate-spin" style={{ color: '#34c5cc' }} />
    </div>
  );
  if (error && !data) return (
    <div className="flex items-center justify-center h-dvh">
      <div className="text-center">
        <AlertTriangle size={36} className="text-red-400 mx-auto mb-3" />
        <p className="text-sm text-red-400">{error}</p>
        <button onClick={() => router.push('/admin/dashboard')} className="mt-4 text-xs text-cyan-400 hover:underline">Voltar</button>
      </div>
    </div>
  );

  const { empresa, totalColab, fases } = data;
  const uiConfig = empresa.ui_config || null;
  const activeFase = fases.find((f: any) => f.status === 'andamento');
  const empGlyph = empresa.nome?.trim()?.[0]?.toUpperCase() ?? '?';

  return (
    <div className="min-h-dvh"
      style={{
        background:
          'radial-gradient(1100px 500px at 88% -5%, rgba(52,197,204,.07), transparent 55%),' +
          'radial-gradient(900px 500px at -5% 30%, rgba(158,78,221,.1), transparent 60%),' +
          'linear-gradient(180deg,#06172C 0%,#091D35 50%,#0a1f3a 100%)',
      }}
    >
      <div className="max-w-[1200px] mx-auto px-5 py-6">

        {/* ── TOP BAR ─────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-4 pb-5 mb-5 border-b border-white/[0.08]">
          <button
            onClick={() => router.push('/admin/dashboard')}
            className="flex items-center gap-1.5 text-xs font-medium transition-colors"
            style={{ color: 'rgba(255,255,255,.48)' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,.48)')}
          >
            <ArrowLeft size={14} /> Admin Dashboard
          </button>
          <div className="flex items-center gap-10">
            <img src="/logo-vertho.png" alt="Vertho" style={{ height: 20, opacity: .8 }} />
            <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,.3)' }}>
              EMPRESA PIPELINE
            </span>
          </div>
          <button
            onClick={loadData}
            disabled={loading}
            className="w-8 h-8 flex items-center justify-center rounded-lg border transition-colors"
            style={{ borderColor: 'rgba(255,255,255,.1)', color: 'rgba(255,255,255,.4)' }}
            title="Atualizar"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* ── EMPRESA HEADER ──────────────────────────────── */}
        <div
          className="rounded-[18px] p-5 mb-5"
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr auto',
            gap: 18,
            alignItems: 'center',
            background:
              'radial-gradient(60% 80% at 92% 0%, rgba(52,197,204,.13), transparent 55%),' +
              'linear-gradient(135deg, rgba(12,32,56,.98), rgba(8,22,42,.98))',
            border: '1px solid rgba(255,255,255,.08)',
          }}
        >
          {/* Glifo serif */}
          <div
            className="flex items-center justify-center rounded-[14px]"
            style={{
              width: 52, height: 52, flexShrink: 0,
              background: 'rgba(52,197,204,.1)', border: '1px solid rgba(52,197,204,.22)',
              ...serif, fontSize: 28, color: '#34c5cc',
            }}
          >
            {empGlyph}
          </div>

          {/* Nome + meta */}
          <div>
            <h1 style={{ ...serif, fontSize: 'clamp(22px,3vw,32px)', lineHeight: 1, letterSpacing: '-.02em', marginBottom: 6 }}>
              {empresa.nome.split(' ').length > 1 ? (
                <>
                  {empresa.nome.split(' ').slice(0, -1).join(' ')}{' '}
                  <em style={{ color: '#34c5cc' }}>{empresa.nome.split(' ').at(-1)}</em>
                </>
              ) : (
                <em style={{ color: '#34c5cc' }}>{empresa.nome}</em>
              )}
            </h1>
            <div className="flex items-center gap-3 flex-wrap"
              style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10, color: 'rgba(255,255,255,.45)', letterSpacing: '.06em' }}>
              <span className="flex items-center gap-1.5">
                <span className="w-[6px] h-[6px] rounded-full" style={{ background: '#2ECC71', boxShadow: '0 0 5px #2ECC71' }}></span>
                {fmt(totalColab)} colaboradores
              </span>
              {empresa.segmento && <span>· {empresa.segmento}</span>}
              {activeFase && (
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold"
                  style={{ background: 'rgba(245,158,11,.22)', color: '#FCD34D', border: '1px solid rgba(245,158,11,.32)', fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase' }}
                >
                  <span className="w-[6px] h-[6px] rounded-full animate-pulse" style={{ background: '#F59E0B' }}></span>
                  Fase {activeFase.num} ativa
                </span>
              )}
            </div>
          </div>

          {/* KPIs */}
          <div className="flex items-center gap-5 shrink-0">
            {[
              { val: fases.find((f: any) => f.num === 2)?.metricas?.find((m: any) => m.label === 'Respostas')?.valor ?? '—', lbl: 'Respostas' },
              { val: fases.find((f: any) => f.num === 2)?.metricas?.find((m: any) => m.label?.includes('IA4'))?.valor ?? '—', lbl: 'IA4' },
              { val: fases.find((f: any) => f.num === 2)?.metricas?.find((m: any) => m.label?.includes('PDI'))?.valor ?? '—', lbl: 'PDIs' },
            ].map(k => (
              <div key={k.lbl} className="text-right">
                <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 20, fontWeight: 700, color: '#fff', lineHeight: 1, letterSpacing: '-.02em' }}>
                  {fmt(k.val)}
                </div>
                <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 9, letterSpacing: '.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,.35)', marginTop: 3 }}>
                  {k.lbl}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── MAIN GRID ───────────────────────────────────── */}
        <div className="flex flex-col md:flex-row gap-4 items-start">

          {/* ── PHASES ── */}
          <div className="flex-1 min-w-0 flex flex-col gap-3">
            {fases.map((fase: any) => {
              const config = PHASE_CONFIG.find(p => p.num === fase.num);
              if (!config) return null;
              const Icon = config.icon;
              const st = STATUS_CFG[fase.status as keyof typeof STATUS_CFG] ?? STATUS_CFG.pendente;
              const isExpanded = expandedPhase === fase.num;
              const isActive = fase.status === 'andamento';

              return (
                <div key={fase.num}
                  className="rounded-2xl overflow-hidden transition-all"
                  style={{
                    border: `1px solid ${isActive ? config.color + '44' : 'rgba(255,255,255,.06)'}`,
                    background: '#0b1d36',
                  }}
                >
                  {/* Phase head */}
                  <button
                    onClick={() => setExpandedPhase(isExpanded ? null : fase.num)}
                    className="w-full flex items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-white/[0.02]"
                  >
                    {/* Icon + dot */}
                    <div className="relative shrink-0">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                        style={{ background: config.color + '18' }}>
                        <Icon size={17} style={{ color: config.color }} />
                      </div>
                      <div
                        className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 ${isActive ? 'animate-pulse' : ''}`}
                        style={{ background: st.dot, borderColor: '#0b1d36' }}
                      />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10, fontWeight: 700, color: config.color, letterSpacing: '.12em' }}>
                          F{fase.num}
                        </span>
                        <span className="text-sm font-bold text-white">
                          {getCustomLabel(`fase${fase.num}-titulo`, fase.titulo, uiConfig)}
                        </span>
                      </div>
                      {fase.metricas?.length > 0 && (
                        <div className="flex items-center gap-3">
                          {fase.metricas.map((m: any, i: number) => (
                            <span key={i} style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10, color: 'rgba(255,255,255,.38)' }}>
                              {m.label}: <b style={{ color: 'rgba(255,255,255,.72)', fontWeight: 600 }}>{fmt(m.valor)}</b>
                              {m.total !== undefined && <span style={{ color: 'rgba(255,255,255,.25)' }}>/{fmt(m.total)}</span>}
                            </span>
                          ))}
                        </div>
                      )}
                      {fase.progresso != null && fase.progresso > 0 && (
                        <div className="mt-2 h-[2px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,.07)' }}>
                          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${fase.progresso}%`, background: config.color }} />
                        </div>
                      )}
                    </div>

                    {/* Right: pct + badge + chevron */}
                    <div className="flex items-center gap-2 shrink-0">
                      {fase.progresso != null && fase.progresso > 0 && (
                        <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11, fontWeight: 700, color: config.color }}>{fase.progresso}%</span>
                      )}
                      <span className="text-[10px] font-bold px-2 py-1 rounded-full"
                        style={{ background: st.bg, color: st.text }}>
                        {st.label}
                      </span>
                      {isExpanded
                        ? <ChevronUp size={14} style={{ color: config.color }} />
                        : <ChevronDown size={14} style={{ color: 'rgba(255,255,255,.28)' }} />}
                    </div>
                  </button>

                  {/* Phase body — expanded */}
                  {isExpanded && (
                    <div className="px-5 pb-5 pt-1 border-t border-white/[0.05]">
                      {/* Fase 1 extras */}
                      {fase.num === 1 && (() => {
                        if (!top10Loaded) refreshTop10();
                        const cargosTop10 = [...new Set(top10.map((t: any) => t.cargo))].sort();
                        return (cargosTop10.length > 0 || gabaritos.length > 0) ? (
                          <div className="mb-3 mt-2 flex items-center gap-3 flex-wrap">
                            {cargosTop10.map(cargo => {
                              const count = top10.filter((t: any) => t.cargo === cargo).length;
                              return <span key={String(cargo)} style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10, color: 'rgba(255,255,255,.45)' }}>
                                <b style={{ color: '#fff' }}>{String(cargo)}</b>: {count} comp
                              </span>;
                            })}
                            {gabaritos.length > 0 && <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10, color: '#A78BFA' }}>{gabaritos.length} gabaritos</span>}
                            <button onClick={() => router.push(`/admin/empresas/${empresaId}/fase1`)}
                              className="text-[10px] font-bold text-cyan-400 hover:text-cyan-300 ml-auto">
                              Ver detalhes →
                            </button>
                          </div>
                        ) : null;
                      })()}
                      {fase.num === 1 && (() => {
                        if (!envioStatus) verStatusEnvios(empresaId).then((r: any) => { if (r.success) setEnvioStatus(r.resumo); });
                        return envioStatus && envioStatus.total > 0 ? (
                          <div className="mb-3 flex items-center gap-4 flex-wrap"
                            style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10, color: 'rgba(255,255,255,.4)' }}>
                            <span>Convites: Total <b style={{ color: '#fff' }}>{envioStatus.total}</b></span>
                            {envioStatus.pendente > 0 && <span>Pendente <b style={{ color: '#F4B740' }}>{envioStatus.pendente}</b></span>}
                            {envioStatus.enviado > 0 && <span>Enviado <b style={{ color: '#34c5cc' }}>{envioStatus.enviado}</b></span>}
                            {envioStatus.respondido > 0 && <span>Respondido <b style={{ color: '#2ECC71' }}>{envioStatus.respondido}</b></span>}
                          </div>
                        ) : null;
                      })()}

                      {/* Fase 2 quick links */}
                      {fase.num === 2 && (
                        <div className="mb-3 mt-2 flex items-center gap-4 justify-end">
                          <button onClick={() => router.push(`/admin/empresas/${empresaId}/fase2`)} className="text-[10px] font-bold text-cyan-400 hover:text-cyan-300">Diagnóstico →</button>
                          <button onClick={() => router.push(`/admin/empresas/${empresaId}/fase2?tab=trilhas`)} className="text-[10px] font-bold text-amber-400 hover:text-amber-300">Trilhas →</button>
                          <button onClick={() => router.push(`/admin/empresas/${empresaId}/relatorios`)} className="text-[10px] font-bold" style={{ color: '#A78BFA' }}>Relatórios →</button>
                        </div>
                      )}
                      {fase.num === 4 && (
                        <div className="mb-3 mt-2 flex justify-end">
                          <button onClick={() => router.push(`/admin/empresas/${empresaId}/fase4`)} className="text-[10px] font-bold" style={{ color: '#A78BFA' }}>Cenários B →</button>
                        </div>
                      )}

                      {/* Competência Foco inline */}
                      {fase.num === 2 && focoData && (
                        <div className="mb-4 p-3 rounded-xl" style={{ background: 'rgba(245,158,11,.03)', border: '1px solid rgba(245,158,11,.15)' }}>
                          <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: '#F4B740' }}>Competência Foco por Cargo</p>
                          <p className="text-[9px] text-gray-500 mb-3">A trilha priorizará esta competência se o colaborador tiver gap.</p>
                          <div className="space-y-2">
                            {focoData.map((c: any) => (
                              <div key={c.cargo} className="flex items-center gap-2">
                                <span className="text-xs text-white font-medium w-32 shrink-0">{c.cargo}</span>
                                <select value={c.competencia_foco || ''}
                                  onChange={async e => { const val = e.target.value || null; await salvarCompetenciaFoco(empresaId, c.cargo, val); setFocoData((prev: any) => prev.map((p: any) => p.cargo === c.cargo ? { ...p, competencia_foco: val } : p)); }}
                                  className="flex-1 px-2 py-1.5 rounded-lg text-[11px] text-white border border-white/10 outline-none"
                                  style={{ background: '#091D35' }}>
                                  <option value="">— Sem foco (maior gap) —</option>
                                  {c.top5.map((comp: string) => <option key={comp} value={comp}>{comp}</option>)}
                                </select>
                                {c.competencia_foco && <span className="text-[9px] font-bold" style={{ color: '#F4B740' }}>FOCO</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Action groups */}
                      {(config as any).groups ? (
                        (config as any).groups.map((group: any, gi: number) => {
                          const visible = group.actions.filter((a: any) => !isHidden(`btn-fase${fase.num}-${a.key}`, uiConfig));
                          if (!visible.length) return null;
                          return (
                            <div key={gi} className="mb-3 last:mb-0">
                              {group.label && (
                                <p className="text-[9px] font-bold uppercase tracking-widest mb-2"
                                  style={{ fontFamily: 'var(--font-mono, monospace)', color: 'rgba(255,255,255,.3)', letterSpacing: '.22em' }}>
                                  {group.label}
                                </p>
                              )}
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {visible.map((a: any) => (
                                  <ActionBtn key={a.key} action={a} fase={fase} config={config}
                                    pending={pendingAction} isActive={isActive}
                                    onAction={onActionClick} empresaId={empresaId} uiConfig={uiConfig} />
                                ))}
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                          {((config as any).actions ?? []).filter((a: any) => !isHidden(`btn-fase${fase.num}-${a.key}`, uiConfig)).map((a: any) => (
                            <ActionBtn key={a.key} action={a} fase={fase} config={config}
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

          {/* ── RIGHT COLUMN ── */}
          <div className="md:w-[280px] md:shrink-0 self-start md:sticky md:top-6 flex flex-col gap-3">

            {/* Status panel */}
            <div className="rounded-2xl overflow-hidden" style={{ background: '#0b1d36', border: '1px solid rgba(255,255,255,.07)' }}>
              <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                <Target size={12} style={{ color: 'rgba(255,255,255,.45)' }} />
                <span className="text-xs font-bold text-white">Status da empresa</span>
              </div>
              <div>
                {[
                  { label: 'Respostas',    color: '#2ECC71', val: fases.find((f: any) => f.num === 2)?.metricas?.find((m: any) => m.label === 'Respostas')?.valor, total: totalColab },
                  { label: 'Avaliações IA4', color: '#34c5cc', val: null },
                  { label: 'PDIs',         color: '#F4B740', val: null },
                  { label: 'Temporadas',   color: 'rgba(255,255,255,.2)', val: null },
                ].map(row => (
                  <div key={row.label} className="flex items-center gap-2.5 px-4 py-2.5 transition-colors hover:bg-white/[0.025]">
                    <div className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: row.color, boxShadow: row.color !== 'rgba(255,255,255,.2)' ? `0 0 5px ${row.color}` : 'none' }} />
                    <span className="text-[12.5px] font-medium text-white flex-1">{row.label}</span>
                    <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11.5, color: 'rgba(255,255,255,.5)' }}>
                      {row.val != null ? <><b style={{ color: '#fff' }}>{fmt(row.val)}</b>{row.total ? ` / ${fmt(row.total)}` : ''}</> : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Log */}
            {logs.length > 0 && (
              <div className="rounded-2xl overflow-hidden" style={{ background: '#0b1d36', border: '1px solid rgba(255,255,255,.07)', maxHeight: '50vh' }}>
                <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                  <div className="flex items-center gap-2">
                    <Zap size={12} style={{ color: 'rgba(255,255,255,.4)' }} />
                    <span className="text-xs font-bold text-white">Log</span>
                    <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10, color: 'rgba(255,255,255,.3)' }}>{logs.length}</span>
                  </div>
                  <button onClick={() => setLogs([])} style={{ color: 'rgba(255,255,255,.3)' }}><X size={12} /></button>
                </div>
                <div className="overflow-y-auto" style={{ maxHeight: 'calc(50vh - 42px)' }}>
                  {logs.map((l: any) => (
                    <div key={l.id || l.ts} className="flex gap-2 px-3 py-1.5 border-b border-white/[0.03]">
                      <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 9.5, color: 'rgba(255,255,255,.3)', flexShrink: 0, paddingTop: 1 }}>
                        {new Date(l.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                      <span style={{
                        fontFamily: 'var(--font-mono, monospace)', fontSize: 11,
                        color: l.type === 'success' ? '#2ECC71' : l.type === 'error' ? '#F97354' : 'rgba(255,255,255,.62)',
                      }}>{l.msg}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Danger zone */}
            <div className="rounded-2xl overflow-hidden" style={{ background: '#0b1d36', border: '1px solid rgba(255,255,255,.07)' }}>
              <button
                onClick={() => setShowDanger(!showDanger)}
                className="w-full flex items-center gap-2 px-4 py-3 text-left transition-colors text-xs font-semibold"
                style={{ color: showDanger ? '#F97354' : 'rgba(255,255,255,.38)' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#F97354')}
                onMouseLeave={e => (e.currentTarget.style.color = showDanger ? '#F97354' : 'rgba(255,255,255,.38)')}
              >
                <Settings size={12} /> Configurações avançadas
                <ChevronDown size={12} className="ml-auto" style={{ transform: showDanger ? 'rotate(180deg)' : 'none', transition: '.15s' }} />
              </button>

              {showDanger && (
                <div className="px-3 pb-3 border-t border-white/[0.06]">
                  {/* Senha teste */}
                  <p className="text-[9px] font-bold uppercase tracking-widest mt-3 mb-2" style={{ fontFamily: 'var(--font-mono, monospace)', color: 'rgba(52,197,204,.7)' }}>Ferramentas de Teste</p>
                  <button disabled={dangerLoading}
                    onClick={async () => {
                      if (!confirm('Definir senha "teste123" para todos?')) return;
                      setDangerLoading(true);
                      const r = await definirSenhaTesteEmpresa(empresaId);
                      if (r.success) addLog(`🔑 ${r.message}`, 'success'); else addLog(`❌ ${r.error}`, 'error');
                      setDangerLoading(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-bold mb-3 transition-all disabled:opacity-30"
                    style={{ color: '#34c5cc', border: '1px solid rgba(52,197,204,.28)', background: 'rgba(52,197,204,.06)' }}>
                    {dangerLoading ? <Loader2 size={13} className="animate-spin" /> : <Settings size={13} />}
                    Definir senha "teste123"
                  </button>

                  <p className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ fontFamily: 'var(--font-mono, monospace)', color: 'rgba(239,68,68,.6)' }}>Zona de Perigo</p>

                  {/* Escopo */}
                  <select value={dangerColabId}
                    onChange={e => setDangerColabId(e.target.value)}
                    onFocus={async () => { if (!dangerColabs.length) { const c = await loadColaboradoresLista(empresaId); setDangerColabs(c); } }}
                    className="w-full px-2 py-1.5 rounded-lg text-[11px] text-white border border-white/10 outline-none mb-3"
                    style={{ background: '#091D35' }}>
                    <option value="">Todos os colaboradores</option>
                    {dangerColabs.map((c: any) => <option key={c.id} value={c.id}>{c.nome_completo || c.email}</option>)}
                  </select>

                  {/* Danger buttons */}
                  <div className="flex flex-col gap-1.5 mb-3">
                    {[
                      { label: 'Mapeamento Comportamental', action: 'mapeamento' },
                      { label: 'Mapeamento de Competências', action: 'mapeamentoComp' },
                      { label: 'Top 10 selecionadas', tabelas: ['top10_cargos'] },
                      { label: 'Perfil de Cargo Ideal', tabelas: ['cargos_empresa'], fields: { gabarito: null, raciocinio_ia2: null } },
                      { label: 'Cenários', tabelas: ['banco_cenarios'] },
                      { label: 'Cenários B', action: 'cenariosB' },
                      { label: 'Sessões Reavaliação', action: 'reavSessoes' },
                      { label: 'Respostas simuladas', tabelas: ['respostas'] },
                      { label: 'Avaliações IA4', tabelas: ['respostas'], fields: { avaliacao_ia: null, nivel_ia4: null, nota_ia4: null, status_ia4: null, payload_ia4: null } },
                      { label: 'Relatórios', tabelas: ['relatorios'] },
                      { label: 'Envios', tabelas: ['envios_diagnostico'] },
                      { label: 'LIMPAR TUDO', tabelas: ['fit_resultados','relatorios','evolucao','evolucao_descritores','sessoes_avaliacao','respostas','envios_diagnostico','banco_cenarios','top10_cargos','competencias','cargos_empresa'], danger: true },
                    ].map((item: any) => {
                      const scope = dangerColabId ? dangerColabs.find((c: any) => c.id === dangerColabId)?.nome_completo || 'colaborador' : 'todos';
                      return (
                        <button key={item.label} disabled={dangerLoading}
                          onClick={async () => {
                            if (!confirm(`${item.label} (${scope})? Esta ação não pode ser desfeita.`)) return;
                            setDangerLoading(true);
                            let r: any;
                            if (item.action === 'mapeamento') r = await limparMapeamento(empresaId, dangerColabId || null);
                            else if (item.action === 'mapeamentoComp') r = await limparMapeamentoCompetencias(empresaId, dangerColabId || null);
                            else if (item.action === 'cenariosB') r = await limparCenariosB(empresaId);
                            else if (item.action === 'reavSessoes') r = await limparReavaliacaoSessoes(empresaId);
                            else r = await limparRegistros(empresaId, item.tabelas, dangerColabId || null, item.fields || null);
                            if (r.success) { addLog(`🗑️ ${item.label} (${scope}) — ok`, 'success'); loadData(); }
                            else addLog(`❌ ${item.label}: ${r.error}`, 'error');
                            setDangerLoading(false);
                          }}
                          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-medium border transition-all disabled:opacity-30 ${item.danger ? 'font-bold' : ''}`}
                          style={{
                            background: '#091D35',
                            color: item.danger ? '#F97354' : 'rgba(255,255,255,.45)',
                            borderColor: item.danger ? 'rgba(239,68,68,.2)' : 'rgba(255,255,255,.05)',
                          }}
                        >
                          <Trash2 size={11} /> {item.label}
                          {dangerColabId && <span style={{ fontSize: 9, color: 'rgba(255,255,255,.3)', marginLeft: 'auto' }}>(individual)</span>}
                        </button>
                      );
                    })}
                  </div>

                  <button disabled={dangerLoading}
                    onClick={async () => {
                      if (!confirm(`EXCLUIR a empresa "${empresa.nome}" e TODOS os dados?\n\nIRREVERSÍVEL.`)) return;
                      setDangerLoading(true);
                      const r = await excluirEmpresa(empresaId);
                      if (r.success) router.push('/admin/dashboard');
                      else { addLog(`❌ ${r.error}`, 'error'); setDangerLoading(false); }
                    }}
                    className="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-30"
                    style={{ color: '#F97354', border: '1px solid rgba(239,68,68,.3)', background: 'rgba(239,68,68,.04)' }}>
                    {dangerLoading ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    Excluir Empresa
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* ── MODEL PICKER (inalterado) ─────────────────────── */}
      {modelPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.65)' }}>
          <div className="w-full max-w-xs rounded-2xl border border-white/[0.1] p-5" style={{ background: '#0A1D35' }}>
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
                <button onClick={() => { const { actionKey, label } = modelPicker; setModelPicker(null); handleAction(actionKey, label, { model: dualModel1, checkModel: dualModel2 }); }}
                  className="w-full py-2.5 rounded-lg text-xs font-bold text-white mb-2" style={{ background: '#0D9488' }}>
                  Executar
                </button>
              </>
            ) : (
              <>
                <p className="text-[10px] text-gray-500 mb-4">Selecione o modelo de IA</p>
                <div className="space-y-2 mb-4">
                  {AI_MODELS.map(m => (
                    <button key={m.id}
                      onClick={() => { const { actionKey, label } = modelPicker; setModelPicker(null); handleAction(actionKey, label, { model: m.id }); }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium text-gray-300 border border-white/[0.07] hover:border-cyan-400/30 hover:bg-cyan-400/5 transition-all"
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

// ── ActionBtn — 3 variantes: nav / ai / cta ──────────────────────────────
function ActionBtn({ action, fase, config, pending, isActive, onAction, empresaId, uiConfig }: {
  action: any; fase: any; config: any; pending: string | null;
  isActive: boolean; onAction: Function; empresaId: string; uiConfig: any;
}) {
  const isPending = pending === action.key;
  const isDisabled = !!pending;
  const AIcon = action.icon;
  const label = getCustomLabel(`btn-fase${fase.num}-${action.key}`, action.label, uiConfig);

  // Variant logic
  // nav = has href/hrefFn
  // cta = AI action in active phase (primary AI actions)
  // ai  = AI action but not CTA, or secondary AI
  const isNavLink = !!(action.href || action.hrefFn);
  const isAIAction = !!action.ai;
  const isCTA = isActive && isAIAction && ['simular','ia4','ia3','ia1','ia2','temporadas','evolucao'].includes(action.key);

  const baseStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 7,
    padding: '9px 11px', borderRadius: 10,
    fontSize: 11.5, cursor: isDisabled ? 'not-allowed' : 'pointer',
    transition: 'all .12s', width: '100%', textAlign: 'left',
    opacity: isDisabled && !isPending ? 0.45 : 1,
  };

  const navStyle: React.CSSProperties = {
    ...baseStyle,
    color: 'rgba(255,255,255,.52)',
    border: '1px solid rgba(255,255,255,.07)',
    background: 'rgba(0,0,0,.2)',
    fontWeight: 500,
  };

  const aiStyle: React.CSSProperties = {
    ...baseStyle,
    color: config.color,
    border: `1px solid ${config.color}44`,
    background: config.color + '12',
    fontWeight: 600,
  };

  const ctaStyle: React.CSSProperties = {
    ...baseStyle,
    color: '#062032',
    background: config.color,
    border: `1px solid ${config.color}`,
    fontWeight: 700,
    boxShadow: `0 4px 14px ${config.color}44`,
  };

  const currentStyle = isCTA ? ctaStyle : isAIAction ? aiStyle : navStyle;

  if (isNavLink) {
    const href = action.hrefFn ? action.hrefFn(empresaId) : `${action.href}?empresa=${empresaId}`;
    return (
      <a href={isDisabled ? undefined : href} style={navStyle}
        className={isDisabled ? 'pointer-events-none' : ''}>
        <AIcon size={12} style={{ color: isDisabled ? 'rgba(255,255,255,.2)' : config.color, flexShrink: 0 }} />
        <span className="leading-tight truncate">{label}</span>
      </a>
    );
  }

  return (
    <button onClick={() => !isDisabled && onAction(action.key, label, action.ai)}
      disabled={isDisabled}
      style={currentStyle}>
      {isPending
        ? <Loader2 size={12} className="animate-spin shrink-0" style={{ color: isCTA ? '#062032' : config.color }} />
        : <AIcon size={12} style={{ color: isCTA ? '#062032' : isDisabled ? 'rgba(255,255,255,.2)' : config.color, flexShrink: 0 }} />}
      <span className="leading-tight truncate">{isPending ? 'Processando...' : label}</span>
    </button>
  );
}
