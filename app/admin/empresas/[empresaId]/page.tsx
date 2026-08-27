'use client';

import { useState, useEffect, useCallback, useRef, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';

function fmt(n: any, locale: string) { return (n ?? 0).toLocaleString(locale); }

import { getCustomLabel, isHidden } from '@/lib/ui-resolver';
import {
  Building2, Users, Brain, Mail, Bot, GraduationCap, TrendingUp, Activity,
  Zap, Database, FileText, Send, ClipboardCheck, BarChart3, Target, Clock,
  Play, BookOpen, Layers, MessageSquare, FileBarChart, CheckCircle,
  Loader2, AlertTriangle, X, ChevronDown, ChevronUp, Trash2, Settings, Trophy, Plus, Filter, Search, Film, Sparkles, Briefcase, Compass, ShieldCheck
} from 'lucide-react';
import BackButton from '@/components/back-button';
import { useAdminShell } from '@/app/admin/_shell/AdminShellContext';
import { useConfirm } from '@/components/admin/confirm-dialog';

import { loadTop10TodosCargos, adicionarTop10, removerTop10, loadGabaritosCargos, listarFilaIA3, rodarIA3Uma, checkCenarioUm } from '@/actions/fase1';
import { listarPendentesSimulacao, simularUmaResposta } from '@/actions/simulador-conversas';
import { enqueueIA2Batch, enqueueIA3Batch, enqueueIA4Batch, enqueueBlueprintBatch, statusIAJob, cancelIAJob, listarJobsAtivosIA } from '@/actions/ia-pipeline-batch';
import { simularMapeamentoDISCLote } from '@/actions/simulador-disc';
import { gerarRelatorioIndividual, gerarRelatoriosIndividuaisLote, gerarRelatorioGestor as gerarRelGestor, gerarRelatorioRH as gerarRelRH } from '@/actions/relatorios';
import { resolveTaskModel } from '@/lib/ai-tasks';
import { loadCompetencias } from '@/app/admin/competencias/actions';
import { iniciarEnviosTemporada, pausarEnviosTemporada } from '@/actions/envios-temporada';
import { auditarBlueprint, filaAuditBlueprint } from '@/actions/blueprint';
import { TURMA_ENCERRADAS } from '@/lib/status';
import {
  loadEmpresaPipeline, excluirEmpresa, limparRegistros, limparMapeamento, limparMapeamentoCompetencias, limparCenariosB, limparReavaliacaoSessoes, definirSenhaTesteEmpresa, loadColaboradoresLista,
  rodarIA1, rodarIA2, rodarIA3,
  verStatusEnvios,
  rodarIA4, rodarIA4Uma, listarPendentesIA4, listarPendentesCheck, checarUmaAvaliacao,
  montarTrilhasLote, salvarCompetenciaFoco, loadCompetenciasFoco,
  gerarCenariosBLote, gerarRelatoriosEvolucaoLote, gerarPlenariaEvolucao, gerarRelatorioRHManual, gerarRelatorioPlenaria, enviarLinksPerfil, gerarDossieGestor, checkCenarios,
} from './actions';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── AI Models ──────────────────────────────────────────────────────────────
const AI_MODELS = [
  { id: 'claude-sonnet-5',       label: 'Claude Sonnet 5',  provider: 'claude' },
  { id: 'claude-opus-5',         label: 'Claude Opus 5',    provider: 'claude' },
  { id: 'gemini-3.6-flash',      label: 'Gemini 3.6 Flash', provider: 'gemini' },
  { id: 'gpt-5.6-sol',           label: 'GPT 5.6 Sol',      provider: 'openai' },
  { id: 'gpt-5.6-terra',         label: 'GPT 5.6 Terra',    provider: 'openai' },
  { id: 'gpt-5.6-luna',          label: 'GPT 5.6 Luna',     provider: 'openai' },
];

// Ações duais → (task de geração, task de checagem) no registro central. O
// picker abre com os modelos RESOLVIDOS da config (override da empresa →
// default por task) — antes os defaults eram hardcoded aqui e o override de
// check salvo em Configurações → IA era config MORTA (nada o lia).
/**
 * Fases que TÊM caminho de lote (Batch API, −50%, assíncrono).
 *
 * A lista existe para o default não prometer lote onde ele não existe: nas
 * demais, `'agora'` não é uma escolha cara, é o único caminho. Se uma fase nova
 * ganhar task de lote, o nome entra aqui — e o dia em que o ramo `modo === 'lote'`
 * for escrito sem acrescentar o nome, o botão fica sem efeito visível.
 */
const FASES_COM_LOTE = new Set(['blueprint', 'ia2', 'ia3', 'ia4']);

const DUAL_TASK_KEYS: Record<string, [string, string]> = {
  'ia3': ['ia3_cenarios', 'ia3_check'],
  // `ia4_avaliar` não existia como task: o código roda `ia4_avaliacao` (27/08).
  'ia4': ['ia4_avaliacao', 'ia4_check'],
  'cenarios-b': ['cenarios_b', 'cenarios_b_check'],
};

const AI_ACTIONS = new Set([
  'ia1','ia2','ia3','ia4','blueprint','rel-ind','rel-gestor','rel-rh',
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
      { key: 'selecao', label: 'Seleção — Vagas', icon: Briefcase, hrefFn: (id: string) => `/admin/empresas/${id}/selecao` },
      { key: 'preferencias',   label: 'Preferências',            icon: GraduationCap,hrefFn: (id: string) => `/admin/preferencias-aprendizagem?empresa=${id}` },
      { key: 'knowledge-base', label: 'Knowledge Base (RAG)',    icon: Database,     hrefFn: (id: string) => `/admin/vertho/knowledge-base?empresa=${id}` },
    ]},
    { label: 'Conteúdo', actions: [
      { key: 'videos', label: 'Vídeos (Bunny)', icon: Film, hrefFn: (id: string) => `/admin/videos?empresa=${id}` },
      { key: 'extracao-video', label: 'Extração de Vídeo', icon: Sparkles, hrefFn: (id: string) => `/admin/empresas/${id}/extracao-video` },
    ]},
    { label: 'Sistema', actions: [
      { key: 'config', label: 'Configurações', icon: Settings, hrefFn: (id: string) => `/admin/empresas/${id}/configuracoes` },
    ]},
  ]},
  { num: 1, icon: Brain, color: '#3B82F6', actions: [
    { key: 'ia1',         label: 'IA1 — Top 10',               icon: Zap,          ai: true },
    { key: 'votacao',     label: 'Votação Colaboradores',       icon: Users,        hrefFn: (id: string) => `/admin/cargos?empresa=${id}&tab=votacao` },
    { key: 'cargos-top5', label: 'Top 5',                       icon: Target,       href: '/admin/cargos' },
    { key: 'perfil-ext',  label: 'Perfil Externo (OPQ32)',      icon: FileText,     hrefFn: (id: string) => `/admin/empresas/${id}/perfil-externo` },
    { key: 'ia2',         label: 'IA2 — Perfil Ideal',          icon: Zap,          ai: true },
    { key: 'ia3',         label: 'IA3 — Cenários + Check',      icon: Zap,          ai: 'dual' },
    { key: 'cenarios-cur', label: 'Curadoria de Cenários',      icon: FileText,     hrefFn: (id: string) => `/admin/empresas/${id}/fase1?tab=cenarios` },
    { key: 'fit',         label: 'Fit Cargo Ideal',             icon: BarChart3,    href: '/admin/fit' },
    { key: 'simular-disc',label: 'Simular Mapeamento DISC',     icon: MessageSquare,ai: false },
    { key: 'perfis-disc', label: 'Perfis Comportamentais',      icon: Brain,        hrefFn: (id: string) => `/admin/empresas/${id}/perfis-comportamentais` },
    { key: 'envios',      label: 'Envios',                      icon: Send,         href: '/admin/whatsapp' },
    { key: 'pulso',       label: 'Pulso de Desenvolvimento',    icon: Activity,     hrefFn: (id: string) => `/admin/empresas/${id}/pulso` },
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
      { key: 'blueprint',  label: 'Gerar Blueprint', icon: Compass, ai: true },
      { key: 'audit-blueprint', label: 'Auditar Blueprint', icon: ShieldCheck, ai: true },
      { key: 'rel-ind',    label: 'Gerar PDI', icon: FileText,   ai: true },
      { key: 'rel-gestor', label: 'Gestor',    icon: FileBarChart, ai: true },
      { key: 'rel-rh',     label: 'RH',        icon: FileBarChart, ai: true },
    ]},
    { label: 'Enviar', actions: [
      { key: 'envios-rel', label: 'Enviar Relatórios', icon: Send, href: '/admin/whatsapp' },
      { key: 'iniciar-envios', label: 'Iniciar Envios', icon: Play },
      { key: 'pausar-envios', label: 'Pausar Envios', icon: Clock },
    ]},
  ]},
  { num: 3, icon: GraduationCap, color: '#22C55E', groups: [
    { label: 'Temporadas', actions: [
      { key: 'assessment',    label: 'Assessment Descritores', icon: ClipboardCheck, hrefFn: (id: string) => `/admin/assessment-descritores?empresa=${id}` },
      { key: 'temporadas',    label: 'Gerar Temporadas',       icon: Sparkles,       ai: true },
      { key: 'kits-jornada',  label: 'Gerar Kits da Jornada',  icon: Layers,         hrefFn: () => `/admin/conteudos/kit/coorte` },
      { key: 'temporadas-ver',label: 'Ver Temporadas',         icon: Layers,         hrefFn: (id: string) => `/admin/temporadas?empresa=${id}` },
    ]},
  ]},
  { num: 4, icon: TrendingUp, color: '#A78BFA', groups: [
    { label: 'Reavaliação', actions: [
      { key: 'cenarios-b', label: 'Cenários B + Check', icon: Zap, ai: 'dual' },
    ]},
    { label: 'Auditoria Vertho (interna)', actions: [
      { key: 'vertho-evidencias', label: 'Evidências Semanais',  icon: Sparkles,      hrefFn: (id: string) => `/admin/vertho/evidencias?empresa=${id}` },
      { key: 'vertho-acumulada',  label: 'Avaliação Acumulada', icon: ClipboardCheck, hrefFn: (id: string) => `/admin/vertho/auditorias?empresa=${id}&tab=sem13` },
      { key: 'vertho-sem14',      label: 'Auditoria Sem 14',    icon: ClipboardCheck, hrefFn: (id: string) => `/admin/vertho/auditorias?empresa=${id}&tab=sem14` },
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
  // 'temporadas' NÃO entra no ACTION_MAP: o ramo dedicado em handleAction
  // (abaixo) roda fila + loop no client (F-E4) — o lote síncrono foi descontinuado.
  'cenarios-b': gerarCenariosBLote, evolucao: gerarRelatoriosEvolucaoLote, plenaria: gerarPlenariaEvolucao,
  'rh-rel': gerarRelatorioRHManual, 'rh-plen': gerarRelatorioPlenaria,
  'rh-links': enviarLinksPerfil, 'rh-dossie': gerarDossieGestor, 'rh-check': checkCenarios,
};

// Retry p/ loops de lote no cliente: uma chamada de IA longa (~2min o blueprint)
// pode falhar por blip de rede ("Failed to fetch"). Tenta N vezes com espera
// antes de desistir — o caller trata a rejeição final e SEGUE pro próximo item.
async function comRetry<T>(fn: () => Promise<T>, tentativas = 3, esperaMs = 6000): Promise<T> {
  let ultimo: any;
  for (let t = 0; t < tentativas; t++) {
    try { return await fn(); }
    catch (e) { ultimo = e; if (t < tentativas - 1) await new Promise(r => setTimeout(r, esperaMs)); }
  }
  throw ultimo;
}

// ── Serif italic shorthand ─────────────────────────────────────────────────
const serif: React.CSSProperties = {
  fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
  fontStyle: 'italic',
  fontWeight: 400,
};

export default function EmpresaPipelinePage({ params }: { params: Promise<{ empresaId: string }> }) {
  const t = useTranslations('AdminCompanyPipeline');
  const confirmDialog = useConfirm();
  const locale = useLocale();
  const { empresaId } = use(params);
  // Turma do escopo (mig 210) — o portfólio em /admin-v2 linka para cá com
  // `&turma=<id>`. Sem ela, empresa com 2+ turmas ativas recusa o lote.
  const turmaIdEscopo = useSearchParams().get('turma') || null;
  // Portfólio de turmas (mig 210) — aqui só para a FAIXA DE ESCOPO. A
  // composição (criar, mover, arquivar) vive no /admin-v2; nesta tela a
  // pergunta é uma só: "esta ação em lote vai atingir quem?".
  const [turmas, setTurmas] = useState<any[]>([]);
  const router = useRouter();
  const { registerRefresh, podeVer } = useAdminShell();
  const podeExecutarIA = podeVer('ai.audit.regenerate');
  const podeGerenciarEmpresa = podeVer('companies.manage');

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [expandedPhase, setExpandedPhase] = useState<number | null>(null);
  const [modelPicker, setModelPicker] = useState<any>(null);
  const [dualModel1, setDualModel1] = useState('claude-sonnet-4-6');
  const [dualModel2, setDualModel2] = useState('gpt-5.6-terra');
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
  // Guard contra o disparo em render: sem ele, uma falha (ex.: sessão expirada)
  // refaz a action a CADA render, e o reject sem catch vira o erro genérico de
  // "Server Components render" no browser (VERTHO-APP-1 / VERTHO-APP-H, 03/08).
  const envioStatusTentou = useRef(false);
  const [focoData, setFocoData] = useState<any>(null);
  // Cancelamento de fase (sync): os loops de handleAction checam no topo de cada
  // iteração e dão break → a fase para de emitir novos itens. O item em andamento
  // termina (server action não recebe abort do client), depois interrompe.
  const cancelRef = useRef(false);
  // Lotes (Batch API) rodam em SEGUNDO PLANO: enfileirou → o runner LIBERA na
  // hora (dá pra seguir usando o pipeline e disparar lotes de outras fases).
  // Cada lote vira um chip com progresso + Parar próprio; a página re-adota
  // lotes vivos ao recarregar (listarJobsAtivosIA).
  const [bgJobs, setBgJobs] = useState<Array<{ jobId: string; label: string; done: number; total: number; current?: string }>>([]);
  const bgJobsRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);
  /**
   * C4 (auditoria 22/08): o default era `'agora'` — o caminho CARO — e voltava a
   * `'agora'` a cada abertura do picker. `Medido no histórico inteiro de
   * ia_jobs:` `ia2` = 0 execuções em lote, `ia4` = 0. O síncrono gastou
   * US$ 87,08 em features que TÊM task de lote, contra US$ 265,72 totais:
   * US$ 43,5 a mais, 33% do gasto de IA indo pelo botão errado por default.
   * Não é preferência de ninguém — é o default que ninguém trocou.
   */
  const [modo, setModo] = useState<'agora' | 'lote'>('lote');

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

  // Turmas da empresa — carregamento ISOLADO do loadData de propósito: falha
  // aqui não pode derrubar o pipeline inteiro, e a faixa some em silêncio
  // (empresa com 1 turma nem a mostra).
  useEffect(() => {
    (async () => {
      try {
        const { listarTurmas } = await import('@/actions/turmas');
        const r: any = await listarTurmas({ empresaId });
        if (r?.success && r.data?.turmas) setTurmas(r.data.turmas);
      } catch { /* sem turmas: a tela segue como sempre foi */ }
    })();
  }, [empresaId]);
  useEffect(() => () => { mountedRef.current = false; }, []); // para os watchers ao desmontar

  // Acompanha um lote em SEGUNDO PLANO (não segura pendingAction): atualiza o
  // chip a cada 3s, loga marcos no Log e, ao terminar, recarrega os dados.
  function watchJob(jobId: string, label: string) {
    if (bgJobsRef.current.has(jobId)) return; // já acompanhando (re-adoção/duplo clique)
    bgJobsRef.current.add(jobId);
    setBgJobs((prev) => [...prev, { jobId, label, done: 0, total: 0 }]);

    (async () => {
      let lastDone = -1;
      for (let i = 0; i < 1200 && mountedRef.current && bgJobsRef.current.has(jobId); i++) {
        const s = await statusIAJob(jobId);
        if (!mountedRef.current || !bgJobsRef.current.has(jobId)) return;
        const p: any = s?.progress || {};
        if (typeof p.done === 'number') {
          setBgJobs((prev) => prev.map((j) => j.jobId === jobId ? { ...j, done: p.done, total: p.total ?? j.total, current: p.current } : j));
          if (p.done !== lastDone) {
            lastDone = p.done;
            addLog(`⏳ [${label}] ${p.done}/${p.total}${p.current ? ` · ${p.current}` : ''}`, 'info');
          }
        }
        if (s && (s.status === 'done' || s.status === 'error' || s.status === 'cancelled')) {
          const res: any[] = p.resultados || [];
          const ok = res.filter((r) => r.ok).length, errs = res.filter((r) => !r.ok).length;
          if (s.status === 'error') addLog(`❌ [${label}] Lote falhou: ${s.error || ''}`, 'error');
          else if (s.status === 'cancelled') addLog(`⏹ [${label}] Lote cancelado (${ok} gravado(s))`, 'info');
          else addLog(`✅ [${label}] Lote: ${ok} concluído(s)${errs ? ` | ${errs}❌` : ''}`, ok > 0 ? 'success' : 'error');
          bgJobsRef.current.delete(jobId);
          setBgJobs((prev) => prev.filter((j) => j.jobId !== jobId));
          loadData(); refreshTop10();
          return;
        }
        await sleep(3000);
      }
      // Teto de iterações/desmonte: solta o chip sem matar o job (segue no Trigger).
      bgJobsRef.current.delete(jobId);
      if (mountedRef.current) setBgJobs((prev) => prev.filter((j) => j.jobId !== jobId));
    })();
  }

  // Re-adota lotes vivos (queued/running) ao carregar a página — o job mora no
  // Trigger; sair da tela não o perde, voltar retoma o acompanhamento.
  useEffect(() => {
    (async () => {
      const ativos = await listarJobsAtivosIA(empresaId);
      for (const j of ativos as any[]) {
        watchJob(j.id, `${String(j.fase || 'lote').toUpperCase()} (lote)`);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  // Liga o refresh desta página ao botão de refresh do header do shell (evita
  // um segundo botão de refresh / top-bar redundante na página).
  useEffect(() => {
    registerRefresh(loadData);
    return () => registerRefresh(null);
  }, [registerRefresh, loadData]);

  // ── handleAction — INALTERADO ──────────────────────────────────────────
  async function handleAction(actionKey: string, label: string, aiConfig?: any) {
    // Confirmação extra pra ações destrutivas / massivas em lote
    const DANGEROUS_CONFIRMS = t.raw('feedback.confirms') as Record<string, string>;
    if (DANGEROUS_CONFIRMS[actionKey]) {
      const ok = await confirmDialog({ title: label, message: DANGEROUS_CONFIRMS[actionKey], severity: 'danger' });
      if (!ok) return;
    }
    const fn = ACTION_MAP[actionKey];
    setPendingAction(actionKey);
    cancelRef.current = false;
    const modelLabel = aiConfig ? ` [${AI_MODELS.find(m => m.id === aiConfig.model)?.label || aiConfig.model}]` : '';
    addLog(`▶ ${label}${modelLabel}`, 'info');

    try {
      if (actionKey === 'foco') {
        const r = await loadCompetenciasFoco(empresaId);
        if (r.success) { setFocoData(r.data || []); addLog(t('feedback.focusLoaded', { count: (r.data || []).length }), 'info'); }
        else addLog(`❌ ${r.error || t('feedback.focusLoadError')}`, 'error');
        setPendingAction(null); return;
      }
      if (actionKey === 'iniciar-envios') {
        const r = await iniciarEnviosTemporada(empresaId);
        addLog(r.success ? `✅ ${r.message}` : `❌ ${r.message}`, r.success ? 'success' : 'error');
        setPendingAction(null); return;
      }
      if (actionKey === 'pausar-envios') {
        const r = await pausarEnviosTemporada(empresaId);
        addLog(r.success ? `✅ ${r.message}` : `❌ ${r.message}`, r.success ? 'success' : 'error');
        setPendingAction(null); return;
      }
      if (actionKey === 'blueprint') {
        // 🔴 C1b (auditoria 22/08): o blueprint NÃO tem mais caminho síncrono.
        //
        // O laço que vivia aqui chamava `gerarBlueprint` uma vez por colaborador,
        // preso na aba. Com o C1 ligando o deadline real no stream, isso deixou
        // de ser sustentável: o máximo medido de `blueprint_gerar` é 277 s contra
        // os 300 s de `maxDuration` da rota. Não é que não caiba — cabe por 23 s.
        // É que 23 s de margem não sustentam um SLA síncrono: qualquer variação
        // de carga estoura, e o estouro custa a geração paga MAIS o retry.
        //
        // Também sai daqui o `comRetry` de 3 tentativas: numa geração de ~2 min,
        // retry cego é pagar três vezes pelo mesmo blueprint.
        addLog('📦 Blueprints em lote (Batch API −50%, assíncrono).', 'info');
        const r: any = await enqueueBlueprintBatch(empresaId, aiConfig);
        if (!r?.success) { addLog(`❌ ${r?.error || 'Falha ao enfileirar'}`, 'error'); setPendingAction(null); return; }
        if (!r.jobId) { addLog(`${r.message || 'Nada na fila'}`, 'info'); setPendingAction(null); return; }
        addLog(`📦 ${r.total} blueprint(s) no lote ${String(r.jobId).slice(0, 8)}… — rodando em segundo plano.`, 'info');
        addLog('Pode fechar a aba: o progresso é re-adotado quando você voltar.', 'info');
        watchJob(r.jobId, 'Blueprints');
        setPendingAction(null); return;
      }
      if (actionKey === 'audit-blueprint') {
        addLog('🛡 Listando blueprints para auditar...', 'info');
        const fila = await filaAuditBlueprint(empresaId);
        if (!fila?.success || !fila.data?.length) { addLog(`${fila?.error || 'Nenhum blueprint gerado'}`, fila?.success ? 'success' : 'error'); setPendingAction(null); return; }
        addLog(`📋 ${fila.data.length} blueprint(s) na fila`, 'info');
        let ok = 0, erros = 0, drift = 0;
        for (let i = 0; i < fila.data.length; i++) {
          if (cancelRef.current) { addLog(`⏹ ${label} cancelado`, 'info'); break; }
          const c = fila.data[i];
          addLog(`⏳ ${i + 1}/${fila.data.length} ${c.nome}...`, 'info');
          try {
            const r = await comRetry(() => auditarBlueprint({ colaboradorId: c.id, aiConfig: aiConfig || undefined }));
            if (r.ok && r.relatorio) { ok++; if (r.relatorio.drift) drift++; addLog(`${r.relatorio.drift ? '⚠' : '✅'} ${c.nome} — score ${r.relatorio.score}${r.relatorio.drift ? ' · DRIFT' : ''}${r.relatorio.parcial ? ' · PARCIAL (sem checks semânticos)' : ''}`, r.relatorio.drift || r.relatorio.parcial ? 'error' : 'success'); }
            else { erros++; addLog(`❌ ${c.nome}: ${r.error}`, 'error'); }
          } catch (e: any) {
            erros++; addLog(`❌ ${c.nome}: ${e?.message || 'falha de rede'} — pulando`, 'error');
          }
        }
        addLog(`🎉 ${ok} auditado(s)${drift ? ` · ${drift} com drift` : ''}${erros ? ` · ${erros} erro(s)` : ''}`, (erros === 0 && drift === 0) ? 'success' : 'info');
        setPendingAction(null); return;
      }
      if (actionKey === 'rel-ind') {
        const fila = await gerarRelatoriosIndividuaisLote(empresaId);
        if (!fila?.success || !fila.data?.length) { addLog(`${fila?.message || fila?.error || t('feedback.noPendingReports')}`, fila?.success ? 'success' : 'error'); setPendingAction(null); return; }
        addLog(`📋 ${t('feedback.reportsQueue', { count: fila.data.length })}`, 'info');
        let ok = 0, erros = 0;
        for (let i = 0; i < fila.data.length; i++) {
          if (cancelRef.current) { addLog(`⏹ ${label} cancelado`, 'info'); break; }
          addLog(`⏳ ${t('feedback.generatingReport', { current: i + 1, total: fila.data.length })}`, 'info');
          const r = await gerarRelatorioIndividual(empresaId, fila.data[i], aiConfig || undefined);
          if (r.success) { ok++; addLog(`✅ ${r.message}`, 'success'); } else { erros++; addLog(`⚠ ${r.error}`, 'error'); }
        }
        addLog(`✅ ${t('feedback.reportsDone', { ok, errors: erros ? `, ${erros} erros` : '' })}`, 'success');
        setPendingAction(null); return;
      }
      if (actionKey === 'ia4') {
        const checkModel = aiConfig?.checkModel;
        // ── Em lote: Batch API (avaliação Claude −50% + check OpenAI −50%) ──
        // Tira o trabalho da request: o Next despacha Server Action UMA POR VEZ
        // por cliente, e a ~100 s por resposta o modo "Agora" prende a aba o
        // lote inteiro (72 respostas ≈ 2 h em 11/08).
        if (aiConfig?.modo === 'lote') {
          addLog('📦 IA4 em lote (Batch API −50%, assíncrono).', 'info');
          const r: any = await enqueueIA4Batch(empresaId, aiConfig, { turmaId: turmaIdEscopo });
          if (!r.success) { addLog(`❌ ${r.error}`, 'error'); setPendingAction(null); return; }
          if (!r.jobId) { addLog(`✅ ${r.message || 'Nada pendente'}`, 'success'); loadData(); setPendingAction(null); return; }
          const extra = r.checkOnly ? ` (+${r.checkOnly} só-check, avaliadas antes)` : '';
          addLog(`📋 ${r.total} resposta(s) no lote ${String(r.jobId).slice(0, 8)}…${extra} — rodando em segundo plano, pode fechar a aba.`, 'info');
          watchJob(r.jobId, 'IA4');
          setPendingAction(null); return;
        }
        // Check UMA POR REQUEST (como a avaliação abaixo). Em 11/08/2026 o lote
        // rodava dentro de uma única action e a Vercel matou a função aos 300s
        // com 14 de 72 checadas — "Check falhou" sem nada errado no modelo.
        const rodarFilaCheck = async () => {
          const filaChk = await listarPendentesCheck(empresaId);
          if (!filaChk.success) { addLog(`⚠ Check falhou ao listar a fila: ${filaChk.error}`, 'error'); return; }
          if (!filaChk.data?.length) { addLog('✅ Nenhuma avaliação pendente de check', 'success'); return; }
          addLog(`📋 ${filaChk.data.length} avaliação(ões) para validar`, 'info');
          let okChk = 0, errosChk = 0;
          for (let i = 0; i < filaChk.data.length; i++) {
            if (cancelRef.current) { addLog(`⏹ Check cancelado — ${filaChk.data.length - i} sem validar`, 'info'); break; }
            const item = filaChk.data[i];
            addLog(`⏳ [${i + 1}/${filaChk.data.length}] ${item.nome} — ${item.competencia}`, 'info');
            try {
              const r2 = await checarUmaAvaliacao(item.id, { model: checkModel });
              if (r2.success) { okChk++; addLog(`✅ ${r2.message}`, 'success'); }
              else { errosChk++; addLog(`⚠ ${item.nome}: ${r2.error}`, 'error'); }
            } catch (e: any) {
              errosChk++; addLog(`❌ ${item.nome}: ${e?.message || 'falha de rede'} — seguindo`, 'error');
            }
          }
          addLog(`✅ Check: ${okChk} validada(s)${errosChk ? `, ${errosChk} erro(s)` : ''}`, errosChk ? 'info' : 'success');
        };

        addLog(`⏳ Listando respostas pendentes...`, 'info');
        // Escopo de turma (mig 210). Este ramo já mostrava `fila.error` na tela —
        // por isso o fail-closed chega aqui como mensagem acionável, e não como
        // "nenhuma resposta pendente".
        const fila = await listarPendentesIA4(empresaId, { turmaId: turmaIdEscopo });
        if (!fila.success) { addLog(`❌ ${fila.error}`, 'error'); setPendingAction(null); return; }
        if (!fila.data?.length) {
          addLog('✅ Nenhuma resposta pendente de avaliação', 'success');
          // A avaliação pode estar completa e o CHECK não — foi assim que 58 de 72
          // ficaram sem 2ª IA em 11/08 (timeout no meio do lote). Sem este ramo, a
          // tela não tem como alcançá-las: o botão saía aqui.
          if (checkModel) { addLog(`🔍 Validando com ${checkModel}...`, 'info'); await rodarFilaCheck(); }
          else {
            const filaChk = await listarPendentesCheck(empresaId);
            if (filaChk.success && filaChk.data?.length) addLog(`⚠ ${filaChk.data.length} avaliação(ões) SEM check da 2ª IA — escolha um modelo de validação e rode de novo`, 'error');
          }
          loadData(); setPendingAction(null); return;
        }
        addLog(`📋 ${fila.data.length} respostas pendentes. Avaliando uma por vez...`, 'info');
        const presas = fila.data.filter((r: any) => r.presa_sem_notas).length;
        if (presas) addLog(`⚠ ${presas} resposta(s) com avaliação gravada mas SEM notas de descritor (falha antiga da IA4) — serão reprocessadas agora`, 'warning');
        let ok = 0, erros = 0;
        for (let i = 0; i < fila.data.length; i++) {
          if (cancelRef.current) { addLog(`⏹ ${label} cancelado`, 'info'); break; }
          addLog(`⏳ [${i + 1}/${fila.data.length}] Avaliando...`, 'info');
          const r = await rodarIA4Uma(empresaId, fila.data[i].id, aiConfig || undefined);
          if (r.success) { ok++; addLog(`✅ ${r.message}`, 'success'); } else { erros++; addLog(`⚠ ${r.error}`, 'error'); }
        }
        addLog(`✅ IA4: ${ok} avaliadas${erros ? `, ${erros} erros` : ''}`, 'success');
        if (ok > 0 && checkModel) { addLog(`🔍 Validando com ${checkModel}...`, 'info'); await rodarFilaCheck(); }
        // Skip do check NUNCA pode ser silencioso: em 20/07 4 avaliações saíram
        // sem check e ninguém soube até auditar o ledger (zero `ia4_check` no dia).
        else if (ok > 0) { addLog(`⚠ Check PULADO: nenhum modelo de validação selecionado — as ${ok} avaliações ficaram sem auditoria da 2ª IA (status_ia4 vazio)`, 'error'); }
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
        for (let i = 0; i < items.length; i++) { if (cancelRef.current) { addLog(`⏹ ${label} cancelado`, 'info'); break; } const item = items[i]; addLog(`⏳ [${i + 1}/${items.length}] ${item.nome} — ${item.cenario_titulo}`, 'info'); const r = await simularUmaResposta(empresaId, item.colaborador_id, item.cenario_id, aiConfig || undefined); if (r.success) { ok++; addLog(`✅ ${r.message}`, 'success'); } else { erros++; addLog(`⚠ ${item.nome}: ${r.error}`, 'error'); } }
        addLog(`✅ Simulação: ${ok} respostas${erros ? `, ${erros} erros` : ''}`, 'success');
        loadData(); setPendingAction(null); return;
      }
      if (actionKey === 'ia3') {
        // ── Em lote: Batch API (geração Claude −50% + check OpenAI −50%) ──
        if (aiConfig?.modo === 'lote') {
          addLog('📦 IA3 em lote (Batch API −50%, assíncrono).', 'info');
          const r: any = await enqueueIA3Batch(empresaId, aiConfig);
          if (!r.success) { addLog(`❌ ${r.error}`, 'error'); setPendingAction(null); return; }
          if (!r.jobId) { addLog(`✅ ${r.message || 'Nada pendente'}`, 'success'); loadData(); refreshTop10(); setPendingAction(null); return; }
          addLog(`📋 ${r.total} cenário(s) no lote ${String(r.jobId).slice(0, 8)}… — rodando em segundo plano, pode seguir usando o pipeline.`, 'info');
          watchJob(r.jobId, 'IA3');
          setPendingAction(null); return;
        }
        const fila = await listarFilaIA3(empresaId);
        if (!fila?.success || !fila.data?.length) { addLog(`❌ ${fila?.error || 'Nenhuma competência na fila'}`, 'error'); setPendingAction(null); return; }
        const items = fila.data.filter((f: any) => !f.jaGerado).length > 0 ? fila.data.filter((f: any) => !f.jaGerado) : fila.data;
        const checkModel = aiConfig?.checkModel;
        addLog(`📋 ${items.length} cenários para gerar${checkModel ? ' + validar' : ''}`, 'info');
        // Retry de blips transitórios (cold start / 502 → "unexpected response").
        // Converte throw em { success:false } pra o loop tratar uniforme.
        const tentar = async (fn: () => Promise<any>) => {
          try { return await fn(); }
          catch (e: any) {
            const msg = String(e?.message || e || '');
            if (/unexpected response|failed to fetch|fetch failed|network|load failed/i.test(msg)) {
              await new Promise(res => setTimeout(res, 1500));
              try { return await fn(); } catch (e2: any) { return { success: false, error: e2?.message || msg }; }
            }
            return { success: false, error: msg };
          }
        };
        let gerados = 0, aprovados = 0, revisar = 0, erros = 0;
        for (let i = 0; i < items.length; i++) {
          if (cancelRef.current) { addLog(`⏹ ${label} cancelado`, 'info'); break; }
          const item = items[i];
          const escolaLbl = item.ppp_nome ? ` · ${item.ppp_nome}` : '';
          addLog(`⏳ [${i + 1}/${items.length}] Gerando: ${item.nome} (${item.cargo}${escolaLbl})`, 'info');
          const r = await tentar(() => rodarIA3Uma(empresaId, item.cargo, item.competencia_id, item.ppp_escola_id ?? null, aiConfig || undefined));
          if (!r.success) { erros++; addLog(`⚠ ${item.nome}: ${r.error}`, 'error'); continue; }
          gerados++;
          if (checkModel) {
            addLog(`🔍 [${i + 1}/${items.length}] Validando: ${item.nome}${escolaLbl} [${checkModel}]`, 'info');
            const cr = await tentar(() => checkCenarioUm(r.cenarioId || null, empresaId, item.cargo, item.competencia_id, checkModel));
            if (cr.success) { if (cr.nota >= 90) { aprovados++; addLog(`✅ ${item.nome}: ${cr.nota}pts`, 'success'); } else { revisar++; addLog(`⚠ ${item.nome}: ${cr.nota}pts`, 'info'); } }
            else addLog(`⚠ Check ${item.nome}: ${cr.error}`, 'error');
          }
        }
        addLog(`✅ IA3: ${gerados} gerados${checkModel ? ` | ${aprovados}✓ ${revisar}⚠` : ''}${erros ? ` | ${erros}❌` : ''}`, 'success');
        loadData(); refreshTop10(); setPendingAction(null); return;
      }
      if (actionKey === 'ia2') {
        // ── Em lote: Batch API via task Trigger, acompanhado em SEGUNDO PLANO ──
        if (aiConfig?.modo === 'lote') {
          addLog('📦 IA2 em lote (Batch API −50%, assíncrono).', 'info');
          const r: any = await enqueueIA2Batch(empresaId, aiConfig);
          if (!r.success) { addLog(`❌ ${r.error}`, 'error'); setPendingAction(null); return; }
          if (!r.jobId) { addLog(`✅ ${r.message || 'Nada pendente'}`, 'success'); loadData(); refreshTop10(); setPendingAction(null); return; }
          addLog(`📋 ${r.total} cargo(s) no lote ${String(r.jobId).slice(0, 8)}… — rodando em segundo plano, pode seguir usando o pipeline.`, 'info');
          watchJob(r.jobId, 'IA2');
          setPendingAction(null); return;
        }
        // Gera 1 cargo por request (evita timeout da Vercel em tenants com vários cargos).
        const { listarCargosParaIA2 } = await import('@/actions/fase1');
        const lr = await listarCargosParaIA2(empresaId);
        const todos = lr.cargos || [];
        if (!todos.length) { addLog('❌ Nenhum cargo com Top 10. Rode IA1 primeiro.', 'error'); setPendingAction(null); return; }
        const jaFeitos = todos.filter((c: any) => c.jaTem);
        const cargos = todos.filter((c: any) => !c.jaTem).map((c: any) => c.nome);
        if (jaFeitos.length) addLog(`↪ ${jaFeitos.length} já com gabarito (pulados): ${jaFeitos.map((c: any) => c.nome).join(', ')}`, 'info');
        if (!cargos.length) { addLog('✅ Todos os cargos já têm gabarito. Nada a gerar.', 'success'); loadData(); refreshTop10(); setPendingAction(null); return; }
        addLog(`📋 ${cargos.length} cargo(s) pendente(s) — gerando um por vez`, 'info');
        const tentar = async (fn: () => Promise<any>) => {
          try { return await fn(); }
          catch (e: any) {
            const msg = String(e?.message || e || '');
            if (/unexpected response|failed to fetch|fetch failed|network|load failed/i.test(msg)) {
              await new Promise(res => setTimeout(res, 1500));
              try { return await fn(); } catch (e2: any) { return { success: false, error: e2?.message || msg }; }
            }
            return { success: false, error: msg };
          }
        };
        let ok = 0, erros = 0;
        for (let i = 0; i < cargos.length; i++) {
          if (cancelRef.current) { addLog(`⏹ ${label} cancelado`, 'info'); break; }
          addLog(`⏳ [${i + 1}/${cargos.length}] ${cargos[i]}...`, 'info');
          const r = await tentar(() => rodarIA2(empresaId, aiConfig || undefined, { cargoNome: cargos[i] }));
          if (r.success) { ok++; addLog(`✅ ${cargos[i]}: ${r.message || 'gabarito gerado'}`, 'success'); }
          else { erros++; addLog(`⚠ ${cargos[i]}: ${r.error}`, 'error'); }
        }
        addLog(`✅ IA2: ${ok} gabarito(s)${erros ? ` | ${erros}❌` : ''}`, ok > 0 ? 'success' : 'error');
        loadData(); refreshTop10(); setPendingAction(null); return;
      }
      if (actionKey === 'temporadas') {
        const { listarColabsParaTrilha } = await import('@/actions/fase4');
        const { gerarTemporada } = await import('@/actions/temporadas');
        const r = await listarColabsParaTrilha(empresaId, { turmaId: turmaIdEscopo });
        const colabs = r?.colabs || [];
        // ⚠️ A mensagem do servidor VEM PARA A TELA. Antes isto caía no genérico
        // "Nenhum colaborador encontrado", que é falso e não diz o que fazer: a
        // empresa tem gente, falta escolher a TURMA. Bloqueio que não explica
        // como destravar é a mesma classe do `adiadosPorTeto` invisível.
        if ((r as any)?.code === 'ESCOPO_OBRIGATORIO') {
          addLog(`⚠️ ${(r as any).error}`, 'error');
          addLog('Abra esta tela pelo portfólio de turmas (Cliente → Turmas) ou acrescente &turma=<id> na URL.', 'info');
          setPendingAction(null); return;
        }
        if ((r as any)?.success === false) { addLog(`❌ ${(r as any).error}`, 'error'); setPendingAction(null); return; }
        if (!colabs.length) {
          addLog(turmaIdEscopo ? 'Nenhum colaborador nesta turma' : 'Nenhum colaborador encontrado', 'error');
          setPendingAction(null); return;
        }
        // PRÉVIA antes de executar — o que a ação vai atingir, com denominador.
        // Sem isto, "Gerando temporada para 38 colab(s)" não diz 38 DE QUANTOS,
        // e um escopo errado só aparece depois de gastar IA.
        if (turmaIdEscopo) {
          const t = turmas.find((x: any) => x.id === turmaIdEscopo);
          const fora = t ? Math.max(0, t.membros - colabs.length) : 0;
          addLog(
            `🎯 Escopo: ${t?.nome || turmaIdEscopo.slice(0, 8) + '…'} — ${colabs.length}` +
            (t ? ` de ${t.membros} pessoa(s)` : ' pessoa(s)') +
            (fora ? ` · ${fora} fora do alvo` : '') +
            ` · 0 de outras turmas`,
            'info',
          );
        }
        if (r?.trilhasExistentes > 0 && !(await confirmDialog({ title: label, message: t('feedback.existingTracksConfirm', { count: r.trilhasExistentes }), severity: 'danger' }))) { addLog(t('feedback.cancelLog'), 'info'); setPendingAction(null); return; }
        addLog(`📋 Gerando temporada para ${colabs.length} colab(s)`, 'info');
        let ok = 0, erros = 0;
        for (let i = 0; i < colabs.length; i++) {
          if (cancelRef.current) { addLog(`⏹ ${label} cancelado`, 'info'); break; }
          const c = colabs[i];
          addLog(`[${i + 1}/${colabs.length}] ${c.nome_completo}...`, 'info');
          try { const r2: any = await gerarTemporada({ colaboradorId: c.id, aiConfig }); if (r2?.ok) { ok++; addLog(`  ✅ ${c.nome_completo}`, 'success'); } else { erros++; addLog(`  ❌ ${c.nome_completo}: ${r2?.error}`, 'error'); } }
          catch (e: any) { erros++; addLog(`  ❌ ${c.nome_completo}: ${e.message}`, 'error'); }
        }
        addLog(`🎉 Lote: ${ok}/${colabs.length}${erros ? ` (${erros} erros)` : ''}`, ok === colabs.length ? 'success' : 'info');
        loadData(); setPendingAction(null); return;
      }
      if (!fn) { addLog(t('feedback.actionNotFound', { action: actionKey }), 'error'); setPendingAction(null); return; }
      const result = await fn(empresaId, aiConfig || undefined);
      if (result?.success) { addLog(`✅ ${result.message || t('feedback.completed', { label })}`, 'success'); loadData(); if (actionKey === 'ia1' || actionKey === 'ia2') refreshTop10(); }
      else addLog(`❌ ${result?.error || t('feedback.unknownError')}`, 'error');
    } catch (e: any) { addLog(`❌ ${e.message}`, 'error'); }
    setPendingAction(null);
  }

  function onActionClick(actionKey: string, label: string, isAI?: any) {
    if (pendingAction) return;
    if (isAI) {
      // Lote onde ele existe (blueprint, ia2, ia3, ia4): −50% de custo e não
      // prende a aba. `'agora'` continua disponível, como escolha EXPLÍCITA de
      // depuração — e para as fases que não têm lote é o único caminho.
      // O blueprint não tem mais modo: é sempre lote (C1b). As outras fases
      // nascem em lote e podem cair para 'agora' como depuração explícita.
      setModo(FASES_COM_LOTE.has(actionKey) ? 'lote' : 'agora');
      // Dual: abre o picker já com os modelos RESOLVIDOS da config da empresa
      // (override por task → default por task) — a config deixa de ser morta.
      if (isAI === 'dual' && DUAL_TASK_KEYS[actionKey]) {
        const [genKey, checkKey] = DUAL_TASK_KEYS[actionKey];
        setDualModel1(resolveTaskModel(data?.empresa?.sys_config, genKey));
        setDualModel2(resolveTaskModel(data?.empresa?.sys_config, checkKey));
      }
      setModelPicker({ actionKey, label, dual: isAI === 'dual' });
    }
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
        <button onClick={() => router.push('/admin/dashboard')} className="mt-4 text-xs text-cyan-400 hover:underline">{t('feedback.back')}</button>
      </div>
    </div>
  );

  const { empresa, totalColab, fases } = data;
  const turmaAtual = turmas.find((t: any) => t.id === turmaIdEscopo) || null;
  const turmasAtivas = turmas.filter((t: any) => !TURMA_ENCERRADAS.includes(t.status));
  const uiConfig = empresa.ui_config || null;
  const activeFase = fases.find((f: any) => f.status === 'andamento');
  const empGlyph = empresa.nome?.trim()?.[0]?.toUpperCase() ?? '?';
  const groupLabels: Record<string, string> = {
    Cadastro: t('groups.registration'),
    'Conteúdo': t('groups.content'),
    Sistema: t('groups.system'),
    Diagnóstico: t('groups.diagnosis'),
    Trilhas: t('groups.trails'),
    Relatórios: t('groups.reports'),
    Enviar: t('groups.send'),
    Temporadas: t('groups.seasons'),
    Reavaliação: t('groups.reevaluation'),
    'Auditoria Vertho (interna)': t('groups.verthoAudit'),
    'Evolução': t('groups.evolution'),
  };

  return (
    <div className="min-h-full"
      style={{
        background:
          'radial-gradient(1100px 500px at 88% -5%, rgba(52,197,204,.07), transparent 55%),' +
          'radial-gradient(900px 500px at -5% 30%, rgba(158,78,221,.1), transparent 60%),' +
          'linear-gradient(180deg,#06172C 0%,#091D35 50%,#0a1f3a 100%)',
      }}
    >
      <div className="max-w-[1200px] mx-auto px-5 py-6">

        <BackButton onClick={() => router.push('/admin/dashboard')} />

        {/* ── FAIXA DE ESCOPO ──────────────────────────────────────────────
            Com 2+ turmas ativas o lote RECUSA sem escopo (mig 210). Sem esta
            faixa, o único jeito de escolher seria editar a URL na mão — e o
            operador leria "nenhum colaborador" sem saber o que fazer. */}
        {turmasAtivas.length > 1 && (
          <div
            className="mb-4 flex flex-wrap items-center gap-3 rounded-[14px] px-4 py-3"
            style={{
              background: turmaAtual ? 'rgba(52,197,204,.07)' : 'rgba(244,183,64,.08)',
              border: `1px solid ${turmaAtual ? 'rgba(52,197,204,.25)' : 'rgba(244,183,64,.3)'}`,
            }}
          >
            <span className="text-[12px]" style={{ color: turmaAtual ? '#34c5cc' : '#f4b740' }}>
              {turmaAtual
                ? `Operando: ${turmaAtual.nome} · ${turmaAtual.membros} pessoa(s)`
                : `Esta empresa tem ${turmasAtivas.length} turmas — escolha uma antes de rodar ações em lote.`}
            </span>
            <select
              value={turmaIdEscopo || ''}
              onChange={(e) => {
                const v = e.target.value;
                router.replace(v ? `/admin/empresas/${empresaId}?turma=${v}` : `/admin/empresas/${empresaId}`);
              }}
              className="rounded-lg px-2.5 py-1.5 text-[12.5px]"
              style={{ background: '#0b1a2e', border: '1px solid rgba(255,255,255,.14)', color: '#e8eef6' }}
            >
              <option value="">— sem turma escolhida —</option>
              {turmasAtivas.map((t: any) => (
                <option key={t.id} value={t.id}>{t.nome} ({t.membros})</option>
              ))}
            </select>
            {turmaAtual && (
              <span className="font-mono text-[11px] text-white/45">
                {turmaAtual.comIa4} avaliado(s) · {turmaAtual.comTrilha} com trilha
              </span>
            )}
          </div>
        )}

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
                {t('meta.collaborators', { count: totalColab })}
              </span>
              {empresa.segmento && <span>· {empresa.segmento}</span>}
              {activeFase && (
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold"
                  style={{ background: 'rgba(245,158,11,.22)', color: '#FCD34D', border: '1px solid rgba(245,158,11,.32)', fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase' }}
                >
                  <span className="w-[6px] h-[6px] rounded-full animate-pulse" style={{ background: '#F59E0B' }}></span>
                  {t('meta.activePhase', { phase: activeFase.num })}
                </span>
              )}
            </div>
          </div>

          {/* KPIs */}
          <div className="flex items-center gap-5 shrink-0">
            {[
              { val: fases.find((f: any) => f.num === 2)?.metricas?.find((m: any) => m.label === 'Respostas')?.valor ?? '—', lbl: t('kpis.responses') },
              { val: fases.find((f: any) => f.num === 2)?.metricas?.find((m: any) => m.label?.includes('IA4'))?.valor ?? '—', lbl: 'IA4' },
              { val: fases.find((f: any) => f.num === 2)?.metricas?.find((m: any) => m.label?.includes('PDI'))?.valor ?? '—', lbl: 'PDIs' },
            ].map(k => (
              <div key={k.lbl} className="text-right">
                <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 20, fontWeight: 700, color: '#fff', lineHeight: 1, letterSpacing: '-.02em' }}>
                  {fmt(k.val, locale)}
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
                          {getCustomLabel(`fase${fase.num}-titulo`, t(`phases.${fase.num}`), uiConfig)}
                        </span>
                      </div>
                      {fase.metricas?.length > 0 && (
                        <div className="flex items-center gap-3">
                          {fase.metricas.map((m: any, i: number) => (
                            <span key={i} style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10, color: 'rgba(255,255,255,.38)' }}>
                              {m.label}: <b style={{ color: 'rgba(255,255,255,.72)', fontWeight: 600 }}>{fmt(m.valor, locale)}</b>
                              {m.total !== undefined && <span style={{ color: 'rgba(255,255,255,.25)' }}>/{fmt(m.total, locale)}</span>}
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
                        {t(`status.${fase.status}`)}
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
                                <b style={{ color: '#fff' }}>{String(cargo)}</b>: {t('phaseExtras.competenciesShort', { count })}
                              </span>;
                            })}
                            {gabaritos.length > 0 && <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10, color: '#A78BFA' }}>{t('phaseExtras.answerKeys', { count: gabaritos.length })}</span>}
                            <button onClick={() => router.push(`/admin/empresas/${empresaId}/fase1`)}
                              className="text-[10px] font-bold text-cyan-400 hover:text-cyan-300 ml-auto">
                              {t('phaseExtras.viewDetails')}
                            </button>
                          </div>
                        ) : null;
                      })()}
                      {fase.num === 1 && (() => {
                        if (!envioStatus && !envioStatusTentou.current) {
                          envioStatusTentou.current = true;
                          verStatusEnvios(empresaId)
                            .then((r: any) => { if (r.success) setEnvioStatus(r.resumo); })
                            .catch(() => {}); // sessão expirada: o card de envios simplesmente não aparece
                        }
                        return envioStatus && envioStatus.total > 0 ? (
                          <div className="mb-3 flex items-center gap-4 flex-wrap"
                            style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10, color: 'rgba(255,255,255,.4)' }}>
                            <span>{t('phaseExtras.invitesTotal')} <b style={{ color: '#fff' }}>{envioStatus.total}</b></span>
                            {envioStatus.pendente > 0 && <span>{t('phaseExtras.pending')} <b style={{ color: '#F4B740' }}>{envioStatus.pendente}</b></span>}
                            {envioStatus.enviado > 0 && <span>{t('phaseExtras.sent')} <b style={{ color: '#34c5cc' }}>{envioStatus.enviado}</b></span>}
                            {envioStatus.respondido > 0 && <span>{t('phaseExtras.answered')} <b style={{ color: '#2ECC71' }}>{envioStatus.respondido}</b></span>}
                          </div>
                        ) : null;
                      })()}

                      {/* Fase 2 quick links */}
                      {fase.num === 2 && (
                        <div className="mb-3 mt-2 flex items-center gap-4 justify-end">
                          <button onClick={() => router.push(`/admin/empresas/${empresaId}/fase2`)} className="text-[10px] font-bold text-cyan-400 hover:text-cyan-300">{t('phaseExtras.diagnosis')}</button>
                          <button onClick={() => router.push(`/admin/empresas/${empresaId}/fase2?tab=trilhas`)} className="text-[10px] font-bold text-amber-400 hover:text-amber-300">{t('phaseExtras.trails')}</button>
                          <button onClick={() => router.push(`/admin/empresas/${empresaId}/relatorios`)} className="text-[10px] font-bold" style={{ color: '#A78BFA' }}>{t('phaseExtras.reports')}</button>
                          <button onClick={() => router.push(`/admin/fit?empresa=${empresaId}&tab=calibracao`)} className="text-[10px] font-bold text-slate-400 hover:text-slate-200" title="Diagnóstico interno de calibração do gabarito — dev-only, não vai pro cliente">Calibração ⚙</button>
                          <button onClick={() => router.push(`/admin/fit?empresa=${empresaId}&tab=ranking`)} className="text-[10px] font-bold text-slate-400 hover:text-slate-200" title="Preview do ranking de adequação que o gestor do cliente vê">Ranking 📊</button>
                        </div>
                      )}
                      {fase.num === 4 && (
                        <div className="mb-3 mt-2 flex justify-end">
                          <button onClick={() => router.push(`/admin/empresas/${empresaId}/fase4`)} className="text-[10px] font-bold" style={{ color: '#A78BFA' }}>{t('phaseExtras.scenariosB')}</button>
                        </div>
                      )}

                      {/* Competência Foco inline */}
                      {fase.num === 2 && focoData && (
                        <div className="mb-4 p-3 rounded-xl" style={{ background: 'rgba(245,158,11,.03)', border: '1px solid rgba(245,158,11,.15)' }}>
                          <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: '#F4B740' }}>{t('focus.title')}</p>
                          <p className="text-[9px] text-gray-500 mb-3">{t('focus.description')}</p>
                          <div className="space-y-2">
                            {focoData.map((c: any) => (
                              <div key={c.cargo} className="flex items-center gap-2">
                                <span className="text-xs text-white font-medium w-32 shrink-0">{c.cargo}</span>
                                <select value={c.competencia_foco || ''}
                                  onChange={async e => { const val = e.target.value || null; await salvarCompetenciaFoco(empresaId, c.cargo, val); setFocoData((prev: any) => prev.map((p: any) => p.cargo === c.cargo ? { ...p, competencia_foco: val } : p)); }}
                                  className="flex-1 px-2 py-1.5 rounded-lg text-[11px] text-white border border-white/10 outline-none"
                                  style={{ background: '#091D35' }}>
                                  <option value="">{t('focus.noFocus')}</option>
                                  {c.top5.map((comp: string) => <option key={comp} value={comp}>{comp}</option>)}
                                </select>
                                {c.competencia_foco && <span className="text-[9px] font-bold" style={{ color: '#F4B740' }}>{t('focus.badge')}</span>}
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
                                  {groupLabels[group.label] || group.label}
                                </p>
                              )}
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {visible.map((a: any) => (
                                  <ActionBtn key={a.key} action={a} fase={fase} config={config}
                                    pending={pendingAction} isActive={isActive}
                                    onAction={onActionClick} empresaId={empresaId} uiConfig={uiConfig} t={t}
                                    podeExecutarIA={podeExecutarIA} />
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
                              onAction={onActionClick} empresaId={empresaId} uiConfig={uiConfig} t={t}
                              podeExecutarIA={podeExecutarIA} />
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
                <span className="text-xs font-bold text-white">{t('side.statusTitle')}</span>
              </div>
              <div>
                {[
                  { label: t('side.responses'),    color: '#2ECC71', val: fases.find((f: any) => f.num === 2)?.metricas?.find((m: any) => m.label === 'Respostas')?.valor, total: totalColab },
                  { label: t('side.ia4Reviews'), color: '#34c5cc', val: null },
                  { label: t('side.pdis'), color: '#F4B740', val: null },
                  { label: t('side.seasons'),   color: 'rgba(255,255,255,.2)', val: null },
                ].map(row => (
                  <div key={row.label} className="flex items-center gap-2.5 px-4 py-2.5 transition-colors hover:bg-white/[0.025]">
                    <div className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: row.color, boxShadow: row.color !== 'rgba(255,255,255,.2)' ? `0 0 5px ${row.color}` : 'none' }} />
                    <span className="text-[12.5px] font-medium text-white flex-1">{row.label}</span>
                    <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11.5, color: 'rgba(255,255,255,.5)' }}>
                      {row.val != null ? <><b style={{ color: '#fff' }}>{fmt(row.val, locale)}</b>{row.total ? ` / ${fmt(row.total, locale)}` : ''}</> : '—'}
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
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    {/* Lotes em segundo plano: 1 chip por job, com Parar próprio */}
                    {bgJobs.map((j) => (
                      <span key={j.jobId} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold"
                        style={{ background: 'rgba(52,197,204,.12)', color: '#34c5cc', border: '1px solid rgba(52,197,204,.3)' }}>
                        <Loader2 size={10} className="animate-spin" />
                        {j.label} {j.total ? `${j.done}/${j.total}` : '…'}
                        <button
                          title="Parar este lote"
                          onClick={() => { cancelIAJob(j.jobId); addLog(`⏹ [${j.label}] Cancelando lote…`, 'info'); }}
                          style={{ color: '#F97354', fontWeight: 700 }}
                        >⏹</button>
                      </span>
                    ))}
                    {pendingAction && (
                      <button
                        onClick={() => { cancelRef.current = true; addLog('⏹ Cancelando após o item atual…', 'info'); }}
                        className="px-2.5 py-1 rounded-lg text-xs font-bold"
                        style={{ background: 'rgba(249,115,84,.15)', color: '#F97354', border: '1px solid rgba(249,115,84,.3)' }}
                      >⏹ Parar</button>
                    )}
                    <button onClick={() => setLogs([])} style={{ color: 'rgba(255,255,255,.3)' }}><X size={12} /></button>
                  </div>
                </div>
                <div className="overflow-y-auto" style={{ maxHeight: 'calc(50vh - 42px)' }}>
                  {logs.map((l: any) => (
                    <div key={l.id || l.ts} className="flex gap-2 px-3 py-1.5 border-b border-white/[0.03]">
                      <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 9.5, color: 'rgba(255,255,255,.3)', flexShrink: 0, paddingTop: 1 }}>
                        {new Date(l.ts).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                      <span style={{
                        fontFamily: 'var(--font-mono, monospace)', fontSize: 11,
                        color: l.type === 'success' ? '#2ECC71' : l.type === 'error' ? '#F97354' : l.type === 'warning' ? '#F5C04A' : 'rgba(255,255,255,.62)',
                      }}>{l.msg}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Danger zone — oculta para papéis sem companies.manage (sócio):
                todas as ações aqui exigem esse poder no server (Fase 5) */}
            {podeGerenciarEmpresa && (
            <div className="rounded-2xl overflow-hidden" style={{ background: '#0b1d36', border: '1px solid rgba(255,255,255,.07)' }}>
              <button
                onClick={() => setShowDanger(!showDanger)}
                className="w-full flex items-center gap-2 px-4 py-3 text-left transition-colors text-xs font-semibold"
                style={{ color: showDanger ? '#F97354' : 'rgba(255,255,255,.38)' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#F97354')}
                onMouseLeave={e => (e.currentTarget.style.color = showDanger ? '#F97354' : 'rgba(255,255,255,.38)')}
              >
                <Settings size={12} /> {t('danger.advancedSettings')}
                <ChevronDown size={12} className="ml-auto" style={{ transform: showDanger ? 'rotate(180deg)' : 'none', transition: '.15s' }} />
              </button>

              {showDanger && (
                <div className="px-3 pb-3 border-t border-white/[0.06]">
                  {/* Senha teste */}
                  <p className="text-[9px] font-bold uppercase tracking-widest mt-3 mb-2" style={{ fontFamily: 'var(--font-mono, monospace)', color: 'rgba(52,197,204,.7)' }}>{t('danger.testTools')}</p>
                  <button disabled={dangerLoading}
                    onClick={async () => {
                      if (!(await confirmDialog({ title: t('danger.setTestPassword'), message: t('danger.confirmTestPassword'), severity: 'normal' }))) return;
                      setDangerLoading(true);
                      const r = await definirSenhaTesteEmpresa(empresaId);
                      if (r.success) addLog(`🔑 ${r.message}`, 'success'); else addLog(`❌ ${r.error}`, 'error');
                      setDangerLoading(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-bold mb-3 transition-all disabled:opacity-30"
                    style={{ color: '#34c5cc', border: '1px solid rgba(52,197,204,.28)', background: 'rgba(52,197,204,.06)' }}>
                    {dangerLoading ? <Loader2 size={13} className="animate-spin" /> : <Settings size={13} />}
                    {t('danger.setTestPassword')}
                  </button>

                  <p className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ fontFamily: 'var(--font-mono, monospace)', color: 'rgba(239,68,68,.6)' }}>{t('danger.zone')}</p>

                  {/* Escopo */}
                  <select value={dangerColabId}
                    onChange={e => setDangerColabId(e.target.value)}
                    onFocus={async () => { if (!dangerColabs.length) { const c = await loadColaboradoresLista(empresaId); setDangerColabs(c); } }}
                    className="w-full px-2 py-1.5 rounded-lg text-[11px] text-white border border-white/10 outline-none mb-3"
                    style={{ background: '#091D35' }}>
                    <option value="">{t('danger.allCollaborators')}</option>
                    {dangerColabs.map((c: any) => <option key={c.id} value={c.id}>{c.nome_completo || c.email}</option>)}
                  </select>

                  {/* Danger buttons */}
                  <div className="flex flex-col gap-1.5 mb-3">
                    {[
                      { label: t('danger.items.behaviorMapping'), action: 'mapeamento' },
                      { label: t('danger.items.competencyMapping'), action: 'mapeamentoComp' },
                      { label: t('danger.items.selectedTop10'), tabelas: ['top10_cargos'] },
                      { label: t('danger.items.idealRoleProfile'), tabelas: ['cargos_empresa'], fields: { gabarito: null, raciocinio_ia2: null } },
                      { label: t('danger.items.scenarios'), tabelas: ['banco_cenarios'] },
                      { label: t('danger.items.scenariosB'), action: 'cenariosB' },
                      { label: t('danger.items.reevaluationSessions'), action: 'reavSessoes' },
                      { label: t('danger.items.simulatedAnswers'), tabelas: ['respostas'] },
                      { label: t('danger.items.ia4Reviews'), tabelas: ['respostas'], fields: { avaliacao_ia: null, nivel_ia4: null, nota_ia4: null, status_ia4: null, payload_ia4: null } },
                      { label: t('danger.items.reports'), tabelas: ['relatorios'] },
                      { label: t('danger.items.sends'), tabelas: ['envios_diagnostico'] },
                      { label: t('danger.items.companyCompetencies'), tabelas: ['competencias'] },
                      { label: t('danger.items.collaborators'), tabelas: ['colaboradores'], danger: true },
                      { label: t('danger.items.clearAll'), tabelas: ['fit_resultados','relatorios','evolucao','evolucao_descritores','sessoes_avaliacao','respostas','envios_diagnostico','banco_cenarios','top10_cargos','competencias','cargos_empresa'], danger: true },
                    ].map((item: any) => {
                      const scope = dangerColabId ? dangerColabs.find((c: any) => c.id === dangerColabId)?.nome_completo || t('danger.collaboratorFallback') : t('danger.allScope');
                      return (
                        <button key={item.label} disabled={dangerLoading}
                          onClick={async () => {
                            // itens marcados como `danger` (colaboradores, limpar tudo) são
                            // irrecuperáveis em massa → nível crítico com digitação do nome
                            const ok = await confirmDialog({
                              title: item.label,
                              message: t('danger.confirmClear', { item: item.label, scope }),
                              severity: item.danger ? 'critical' : 'danger',
                              scopeNote: scope,
                              typedConfirmation: item.danger ? empresa.nome : undefined,
                            });
                            if (!ok) return;
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
                          {dangerColabId && <span style={{ fontSize: 9, color: 'rgba(255,255,255,.3)', marginLeft: 'auto' }}>{t('danger.individual')}</span>}
                        </button>
                      );
                    })}
                  </div>

                  <button disabled={dangerLoading}
                    onClick={async () => {
                      const ok = await confirmDialog({
                        title: t('danger.deleteCompany'),
                        message: t('danger.confirmDeleteCompany', { name: empresa.nome }),
                        severity: 'critical',
                        typedConfirmation: empresa.nome,
                      });
                      if (!ok) return;
                      setDangerLoading(true);
                      const r = await excluirEmpresa(empresaId);
                      if (r.success) router.push('/admin/dashboard');
                      else { addLog(`❌ ${r.error}`, 'error'); setDangerLoading(false); }
                    }}
                    className="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-30"
                    style={{ color: '#F97354', border: '1px solid rgba(239,68,68,.3)', background: 'rgba(239,68,68,.04)' }}>
                    {dangerLoading ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    {t('danger.deleteCompany')}
                  </button>
                </div>
              )}
            </div>
            )}

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
                {/* Em lote (Batch API −50%): geração Claude + check OpenAI. IA3 e IA4. */}
                {['ia3', 'ia4'].includes(modelPicker.actionKey) && (
                  <div className="flex gap-2 mb-3">
                    {(['agora', 'lote'] as const).map((mo) => (
                      <button key={mo} onClick={() => setModo(mo)}
                        className="flex-1 py-1.5 rounded-lg text-[11px] font-bold border transition-colors"
                        style={modo === mo
                          ? { background: 'rgba(52,197,204,.15)', color: '#34c5cc', borderColor: 'rgba(52,197,204,.4)' }
                          : { background: '#091D35', color: 'rgba(255,255,255,.5)', borderColor: 'rgba(255,255,255,.08)' }}>
                        {mo === 'agora' ? 'Agora (depuração)' : 'Em lote −50%'}
                      </button>
                    ))}
                  </div>
                )}
                {['ia3', 'ia4'].includes(modelPicker.actionKey) && modo === 'lote' && (
                  <p className="text-[9px] leading-snug mb-3" style={{ color: 'rgba(245,158,11,.85)' }}>Batch API: mais barato, porém assíncrono — pode demorar. Geração: modelos Claude · Validação: modelos OpenAI (GPT). Roda em segundo plano: pode fechar a aba.</p>
                )}
                <p className="text-[10px] text-gray-500 mb-3">{t('modelPicker.selectEachStep')}</p>
                <div className="mb-3">
                  <p className="text-[9px] font-bold text-cyan-400 uppercase tracking-widest mb-1">{t('modelPicker.generation')}</p>
                  <select value={dualModel1} onChange={e => setDualModel1(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-xs text-white border border-white/10 outline-none" style={{ background: '#091D35' }}>
                    {(modo === 'lote' ? AI_MODELS.filter((m) => m.id.startsWith('claude')) : AI_MODELS).map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                </div>
                <div className="mb-4">
                  <p className="text-[9px] font-bold text-amber-400 uppercase tracking-widest mb-1">{t('modelPicker.validation')}</p>
                  <select value={dualModel2} onChange={e => setDualModel2(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-xs text-white border border-white/10 outline-none" style={{ background: '#091D35' }}>
                    {(modo === 'lote' ? AI_MODELS.filter((m) => m.id.startsWith('gpt')) : AI_MODELS).map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                </div>
                <button onClick={() => {
                  const { actionKey, label } = modelPicker; setModelPicker(null);
                  // No lote, garante modelos batcháveis mesmo se o select não foi tocado
                  // (value fora das options filtradas fica no estado anterior).
                  const gen = modo === 'lote' && !dualModel1.startsWith('claude') ? 'claude-sonnet-4-6' : dualModel1;
                  const chk = modo === 'lote' && !dualModel2.startsWith('gpt') ? 'gpt-5.6-terra' : dualModel2;
                  handleAction(actionKey, label, { model: gen, checkModel: chk, modo });
                }}
                  className="w-full py-2.5 rounded-lg text-xs font-bold text-white mb-2" style={{ background: '#0D9488' }}>
                  {t('modelPicker.run')}
                </button>
              </>
            ) : (
              <>
                {['ia2', 'blueprint'].includes(modelPicker.actionKey) && (
                  <div className="flex gap-2 mb-3">
                    {(['agora', 'lote'] as const).map((mo) => (
                      <button key={mo} onClick={() => setModo(mo)}
                        className="flex-1 py-1.5 rounded-lg text-[11px] font-bold border transition-colors"
                        style={modo === mo
                          ? { background: 'rgba(52,197,204,.15)', color: '#34c5cc', borderColor: 'rgba(52,197,204,.4)' }
                          : { background: '#091D35', color: 'rgba(255,255,255,.5)', borderColor: 'rgba(255,255,255,.08)' }}>
                        {mo === 'agora' ? 'Agora (depuração)' : 'Em lote −50%'}
                      </button>
                    ))}
                  </div>
                )}
                {['ia2', 'blueprint'].includes(modelPicker.actionKey) && modo === 'lote' && (
                  <p className="text-[9px] leading-snug mb-3" style={{ color: 'rgba(245,158,11,.85)' }}>Batch API: mais barato, porém assíncrono — pode demorar. Só modelos Claude.</p>
                )}
                <p className="text-[10px] text-gray-500 mb-4">{t('modelPicker.selectModel')}</p>
                <div className="space-y-2 mb-4">
                  {(modo === 'lote' ? AI_MODELS.filter((m) => m.id.startsWith('claude')) : AI_MODELS).map(m => (
                    <button key={m.id}
                      onClick={() => { const { actionKey, label } = modelPicker; setModelPicker(null); handleAction(actionKey, label, { model: m.id, modo }); }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium text-gray-300 border border-white/[0.07] hover:border-cyan-400/30 hover:bg-cyan-400/5 transition-all"
                      style={{ background: '#091D35' }}>
                      <Zap size={12} className="text-cyan-400" /> {m.label}
                    </button>
                  ))}
                </div>
              </>
            )}
            <button onClick={() => setModelPicker(null)} className="w-full py-2 text-xs font-semibold text-gray-500 hover:text-white">{t('modelPicker.cancel')}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ActionBtn — 3 variantes: nav / ai / cta ──────────────────────────────
function ActionBtn({ action, fase, config, pending, isActive, onAction, empresaId, uiConfig, t, podeExecutarIA = true }: {
  action: any; fase: any; config: any; pending: string | null;
  isActive: boolean; onAction: Function; empresaId: string; uiConfig: any; t: any;
  podeExecutarIA?: boolean;
}) {
  const isPending = pending === action.key;
  // Sócio (read-mostly) não pode disparar ações de IA — desabilita com tooltip
  // em vez de deixar o clique estourar FORBIDDEN na server action (Fase 5).
  const semPermissao = !!action.ai && !podeExecutarIA;
  const isDisabled = !!pending || semPermissao;
  const AIcon = action.icon;
  const label = getCustomLabel(`btn-fase${fase.num}-${action.key}`, t(`actions.${action.key}`), uiConfig);

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
      title={semPermissao ? t('actions.requiresMaster') : undefined}
      style={currentStyle}>
      {isPending
        ? <Loader2 size={12} className="animate-spin shrink-0" style={{ color: isCTA ? '#062032' : config.color }} />
        : <AIcon size={12} style={{ color: isCTA ? '#062032' : isDisabled ? 'rgba(255,255,255,.2)' : config.color, flexShrink: 0 }} />}
      <span className="leading-tight truncate">{isPending ? t('actions.processing') : label}</span>
    </button>
  );
}
