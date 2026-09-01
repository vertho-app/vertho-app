'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  Loader2, Send, CheckCircle, AlertCircle, Mail, MessageCircle,
  Filter, Eye, Tag, Users, Paperclip, FileText, X, ShieldCheck,
  Workflow, MousePointerClick,
} from 'lucide-react';
import { loadEmpresas, loadColaboradoresEnvio, loadTurmasEnvio, dispararMensagemCustomizada, enviarMagicLinksWhatsApp, listarTemplatesDeEnvio, previewTemplateWhatsApp, dispararTemplateWhatsApp } from './actions';
import BackButton from '@/components/back-button';
import { useConfirm } from '@/components/admin/confirm-dialog';
import { useEmpresaContexto } from '@/app/admin/_shell/useEmpresaContexto';
import { Key } from 'lucide-react';

const TABS = [
  { key: 'magic-link', labelKey: 'tabs.magicLink', icon: Key, color: 'text-teal-400' },
  { key: 'email', labelKey: 'tabs.emailInvites', icon: Mail, color: 'text-blue-400' },
  { key: 'whatsapp', labelKey: 'tabs.whatsappTemplates', icon: MessageCircle, color: 'text-green-400' },
  { key: 'relatorios-email', labelKey: 'tabs.emailReports', icon: Mail, color: 'text-purple-400' },
];

/**
 * Valor do seletor para "empresa inteira" — escolha CONSCIENTE, não default.
 * O servidor só aceita com justificativa (≥ 10 caracteres), que vai para o
 * `admin_audit_log`; aqui o valor é sentinela, nunca id de turma.
 */
const EMPRESA_INTEIRA = '__empresa_inteira__';

const VARIAVEIS = [
  { tag: '{{nome}}', label: 'Nome', exemplo: 'Maria' },
  { tag: '{{cargo}}', label: 'Cargo', exemplo: 'Consultor de Vendas' },
  { tag: '{{empresa}}', label: 'Empresa', exemplo: 'Boehringer Ingelheim' },
  { tag: '{{link}}', label: 'Link', exemplo: 'https://ibipeba.vertho.ai/login' },
  { tag: '{{link_disc}}', label: 'Link DISC', exemplo: 'https://ibipeba.vertho.ai/dashboard/perfil-comportamental/mapeamento' },
];

export default function EnviosPage() {
  const router = useRouter();
  const t = useTranslations('AdminWhatsapp');
  const confirmDialog = useConfirm();
  // Contexto de empresa (path → ?empresa= → filtro do header); a tela tem seletor
  // próprio, então o contexto entra só como valor inicial/fallback do estado local.
  const { empresaId: empresaParam } = useEmpresaContexto();
  const defaultMsgs = {
    email: t('defaultMessages.email'),
    'relatorios-email': t('defaultMessages.reportEmail'),
  };

  const [empresas, setEmpresas] = useState([]);
  const [empresaId, setEmpresaId] = useState(empresaParam || '');
  const [empresaNome, setEmpresaNome] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState(false);

  const [tab, setTab] = useState('email');
  const [anexarPDF, setAnexarPDF] = useState(true);
  // Anexo adicional (arbitrário) - 1 por disparo, pontual (não persiste)
  const [anexoExtra, setAnexoExtra] = useState(null); // { name, size, mime, base64 }
  const ANEXO_MAX_MB = 10;
  const ANEXO_EXTS = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.zip';
  const [assunto, setAssunto] = useState(t('subjects.assessment'));
  const [mensagem, setMensagem] = useState(defaultMsgs.email);
  const [filtroCargo, setFiltroCargo] = useState('');
  // Filtro por status de voto na votação de competências.
  // 'todos' = sem filtro · 'nao_votou' = só quem ainda não votou (lembretes)
  // · 'votou' = só quem já votou
  const [filtroVoto, setFiltroVoto] = useState<'todos' | 'nao_votou' | 'votou'>('todos');
  // Filtro por presença de perfil comportamental (DISC).
  // 'todos' = sem filtro · 'sim' = só quem já tem · 'nao' = só quem ainda não tem
  const [filtroDisc, setFiltroDisc] = useState<'todos' | 'sim' | 'nao'>('todos');
  // Filtro por conclusão do MAPEAMENTO (diagnóstico) de competências — Fase 2.
  // 'todos' = sem filtro · 'completo' = quem concluiu · 'pendente' = quem ainda não
  const [filtroMapeamento, setFiltroMapeamento] = useState<'todos' | 'completo' | 'pendente'>('todos');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  // ── ESCOPO da ação em lote (mig 210) ──────────────────────────────────────
  // Com 2+ turmas ativas o servidor RECUSA lote sem escopo (`idsDoEscopoOuFalhar`).
  // Até 21/08/2026 a tela não tinha onde escolher: a recusa aparecia na prévia e
  // não havia ação correspondente — a régua existia e o operador ficava sem saída.
  const [turmas, setTurmas] = useState<any[]>([]);
  const [escopo, setEscopo] = useState<string>('');           // '' = não escolhido · id da turma · EMPRESA_INTEIRA
  const [justificativa, setJustificativa] = useState('');

  // Derivações do escopo. Ficam ANTES dos effects de propósito: elas entram no
  // array de dependências, que é avaliado durante o render — declaradas depois,
  // o `const` cairia na TDZ e a tela quebraria antes de pintar.
  const escopoTurmaId = escopo && escopo !== EMPRESA_INTEIRA ? escopo : null;
  const justificativaOk = justificativa.trim().length >= 10;
  const exigeEscopo = turmas.length >= 2;
  const escopoPendente = exigeEscopo && !escopoTurmaId && !(escopo === EMPRESA_INTEIRA && justificativaOk);

  /** Escopo no formato que as actions leem (ver `lib/turmas/escopo.ts`). */
  function filtrosDeEscopo() {
    return {
      turmaId: escopoTurmaId || undefined,
      empresaInteiraJustificativa: escopo === EMPRESA_INTEIRA ? justificativa.trim() : undefined,
    };
  }

  /**
   * Filtros do lote de TEMPLATE — uma fonte só para prévia e disparo.
   *
   * Estavam duplicados em três lugares; prévia e disparo com objetos diferentes
   * é como a tela mostra um alvo e envia para outro.
   */
  function filtrosDoLoteTemplate() {
    return {
      cargo: filtroCargo || undefined,
      voto: filtroVoto !== 'todos' ? filtroVoto : undefined,
      disc: filtroDisc !== 'todos' ? filtroDisc : undefined,
      mapeamentoCompleto: filtroMapeamento === 'todos' ? undefined : filtroMapeamento === 'completo',
      ...filtrosDeEscopo(),
    };
  }

  // ── Modo TEMPLATE (aba WhatsApp) ──────────────────────────────────────────
  // A aba deixou de ter editor: fora da janela de 24h a Meta só entrega
  // template aprovado, e o provedor de texto livre não entrega desde 13/08.
  const [templates, setTemplates] = useState<any[]>([]);
  const [catalogoTemplates, setCatalogoTemplates] = useState<any[]>([]);
  const [catalogoFonte, setCatalogoFonte] = useState<'meta' | 'local'>('local');
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [templatesError, setTemplatesError] = useState('');
  const [templateSel, setTemplateSel] = useState('');
  const [etapaTemplateSel, setEtapaTemplateSel] = useState('');
  const [previewLote, setPreviewLote] = useState<any>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const templateAtual = templates.find((x) => x.template === templateSel) || null;
  const templatesPorEtapa = templates.reduce((grupos: Record<string, any[]>, tp: any) => {
    const etapa = tp.etapa || t('templateMode.otherStage');
    (grupos[etapa] ||= []).push(tp);
    return grupos;
  }, {});
  const etapasTemplates = Object.entries(templatesPorEtapa) as [string, any[]][];
  const etapaTemplateAtiva = templatesPorEtapa[etapaTemplateSel]
    ? etapaTemplateSel
    : etapasTemplates[0]?.[0] || '';
  const templatesEtapaAtiva = templatesPorEtapa[etapaTemplateAtiva] || [];

  function selecionarEtapaTemplate(etapa: string) {
    setEtapaTemplateSel(etapa);
    const itens = templatesPorEtapa[etapa] || [];
    const primeiro = itens.find((tp: any) => tp.disponivel !== false) || itens[0];
    if (primeiro) setTemplateSel(primeiro.template);
    setResult(null);
  }
  const catalogoAprovados = catalogoFonte === 'meta'
    ? catalogoTemplates.filter((tp: any) => tp.status === 'APPROVED').length
    : templates.filter((tp: any) => tp.disponivel !== false).length;
  const corpoTemplatePreview = (() => {
    // `templateAtual.corpo` vem da Meta quando ela respondeu; a prévia do lote
    // traz o fallback local. A ordem garante que a tela mostre o aprovado real.
    const corpo = templateAtual?.corpo || previewLote?.corpo || '';
    if (!corpo) return '';
    if (previewLote?.amostra?.[0]) {
      return corpo.replace(/\{\{(\d+)\}\}/g, (_m: string, n: string) =>
        previewLote.amostra[0].params[Number(n) - 1] ?? `{{${n}}}`);
    }
    return corpo.replace(/\{\{(\d+)\}\}/g, (_m: string, n: string) => {
      const variavel = templateAtual?.variaveis?.[Number(n) - 1];
      return variavel ? `[${variavel}]` : `{{${n}}}`;
    });
  })();

  // Colaboradores para contagem
  const [colabs, setColabs] = useState([]);
  const [cargos, setCargos] = useState([]);

  useEffect(() => {
    loadEmpresas().then(r => {
      if (r.success) {
        setEmpresas(r.data || []);
        if (empresaParam) {
          const emp = (r.data || []).find(e => e.id === empresaParam);
          if (emp) setEmpresaNome(emp.nome);
          handleSelectEmpresa(empresaParam);
        }
      }
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (loading || !empresaParam || empresaParam === empresaId) return;
    const emp = empresas.find(e => e.id === empresaParam);
    setEmpresaNome(emp?.nome || '');
    handleSelectEmpresa(empresaParam);
  }, [empresaParam, empresas, loading, empresaId]);

  useEffect(() => {
    setMensagem(defaultMsgs[tab] || '');
    setAssunto(tab === 'email' ? t('subjects.assessment') : tab === 'relatorios-email' ? t('subjects.report') : '');
    setResult(null);
  }, [tab]);

  // Templates disponíveis — carregados uma vez, ao entrar na aba WhatsApp.
  useEffect(() => {
    if (tab !== 'whatsapp' || templates.length) return;
    listarTemplatesDeEnvio().then((r: any) => {
      if (!r?.success) {
        setTemplatesError(r?.error || t('templateMode.loadError'));
        setLoadingTemplates(false);
        return;
      }
      const disponiveis = r.data || [];
      setTemplates(disponiveis);
      setCatalogoTemplates(r.catalogo || disponiveis);
      setCatalogoFonte(r.catalogoFonte === 'meta' ? 'meta' : 'local');
      if (!templateSel && disponiveis.length) {
        const primeiro = disponiveis.find((tp: any) => tp.disponivel !== false) || disponiveis[0];
        setTemplateSel(primeiro.template);
        setEtapaTemplateSel(primeiro.etapa || t('templateMode.otherStage'));
      }
      setLoadingTemplates(false);
    });
  }, [tab, templates.length, templateSel, t]);

  /*
   * Prévia do lote a cada mudança de template ou de filtro.
   *
   * É o servidor que responde quem entra — e, principalmente, quem NÃO entra e
   * por quê. A contagem local de `destinatarios` não serve aqui: ela não sabe
   * quem já recebeu este template nem quem tem parâmetro sem valor.
   */
  useEffect(() => {
    if (tab !== 'whatsapp' || !empresaId || !templateSel) { setPreviewLote(null); return; }
    let cancelado = false;
    setLoadingPreview(true);
    previewTemplateWhatsApp(empresaId, templateSel, filtrosDoLoteTemplate()).then((r: any) => {
      if (cancelado) return;
      setPreviewLote(r?.success ? r.data : { erro: r?.error });
      setLoadingPreview(false);
    });
    return () => { cancelado = true; };
    // Dep é `justificativaOk` (booleano), não o texto: o que a prévia precisa
    // saber é se o escopo passou a ser aceito — refazer o lote a cada tecla
    // seria uma chamada pesada por caractere.
  }, [tab, empresaId, templateSel, filtroCargo, filtroVoto, filtroDisc, filtroMapeamento, escopo, justificativaOk]);

  async function handleSelectEmpresa(id) {
    setEmpresaId(id);
    setResult(null);
    // Escopo é POR EMPRESA: manter a turma da empresa anterior selecionada
    // mandaria o id de outro tenant e o servidor recusaria ("turma não
    // encontrada nesta empresa") — pior, com cara de bug da tela.
    setEscopo('');
    setJustificativa('');
    if (!id) { setColabs([]); setTurmas([]); return; }
    setLoadingStatus(true);
    const [c, t] = await Promise.all([
      loadColaboradoresEnvio(id),
      loadTurmasEnvio(id),
    ]);
    setColabs(c || []);
    setCargos([...new Set((c || []).map(x => x.cargo).filter(Boolean))].sort());
    setTurmas((t as any)?.success ? ((t as any).data || []) : []);
    setLoadingStatus(false);
  }

  // Pessoas sem participação ativa: NÃO entram quando o escopo é uma turma.
  // Mostrado na tela porque proteção invisível vira gente sem comunicação sem
  // ninguém saber — o mesmo defeito do `adiadosPorTeto`.
  const semTurma = colabs.filter((c: any) => !c.turmaId).length;

  // Destinatários filtrados
  const destinatarios = colabs.filter(c => {
    if (escopoTurmaId && c.turmaId !== escopoTurmaId) return false;
    if (filtroCargo && c.cargo !== filtroCargo) return false;
    if (filtroVoto === 'nao_votou' && c.votou) return false;
    if (filtroVoto === 'votou' && !c.votou) return false;
    if (filtroDisc === 'sim' && !c.temDisc) return false;
    if (filtroDisc === 'nao' && c.temDisc) return false;
    if (filtroMapeamento === 'completo' && !c.temMapeamento) return false;
    if (filtroMapeamento === 'pendente' && c.temMapeamento) return false;
    if (tab === 'whatsapp') return !!c.telefone;
    return !!c.email;
  });

  // Preview da mensagem (texto com placeholders resolvidos — vira JSX no render)
  const previewMsg = mensagem
    .replace(/\{\{nome\}\}/g, 'Maria')
    .replace(/\{\{cargo\}\}/g, 'Consultor de Vendas')
    .replace(/\{\{empresa\}\}/g, empresaNome || 'Empresa')
    .replace(/\{\{link\}\}/g, 'https://ibipeba.vertho.ai/avaliacao/abc123')
    .replace(/\{\{link_disc\}\}/g, 'https://ibipeba.vertho.ai/dashboard/perfil-comportamental/mapeamento');

  // Ref para inserir placeholders na posição do cursor
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  function inserirVariavel(tag) {
    const ta = textareaRef.current;
    if (!ta) {
      // Fallback: append no final
      setMensagem(prev => prev + tag);
      return;
    }
    const start = ta.selectionStart ?? mensagem.length;
    const end = ta.selectionEnd ?? mensagem.length;
    const novo = mensagem.slice(0, start) + tag + mensagem.slice(end);
    setMensagem(novo);
    // Reposiciona o cursor logo após o tag inserido (no próximo tick)
    setTimeout(() => {
      ta.focus();
      const pos = start + tag.length;
      ta.setSelectionRange(pos, pos);
    }, 0);
  }

  // Renderiza markdown do WhatsApp (*bold*, _italic_, ~strike~) como JSX,
  // preservando quebras de linha (o container tem whitespace-pre-wrap).
  function renderWaMarkdown(text: string): React.ReactNode[] {
    if (!text) return [];
    const out: React.ReactNode[] = [];
    const re = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g;
    let last = 0;
    let key = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) out.push(<span key={key++}>{text.slice(last, m.index)}</span>);
      const tok = m[0];
      const inner = tok.slice(1, -1);
      if (tok.startsWith('*')) out.push(<strong key={key++} className="text-white font-bold">{inner}</strong>);
      else if (tok.startsWith('_')) out.push(<em key={key++} className="italic">{inner}</em>);
      else out.push(<del key={key++} className="opacity-70">{inner}</del>);
      last = m.index + tok.length;
    }
    if (last < text.length) out.push(<span key={key++}>{text.slice(last)}</span>);
    return out;
  }

  async function handleAnexoChange(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite re-selecionar o mesmo arquivo
    if (!file) return;
    if (file.size > ANEXO_MAX_MB * 1024 * 1024) {
      toast.warning(t('alerts.fileTooLarge', { max: ANEXO_MAX_MB }));
      return;
    }
    const base64 = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1]);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    setAnexoExtra({
      name: file.name,
      size: file.size,
      mime: file.type || 'application/octet-stream',
      base64,
    });
  }

  async function handleDispararTemplate() {
    if (!empresaId || !templateSel || !previewLote?.total || escopoPendente) return;
    const ok = await confirmDialog({
      title: t('sendButton', { count: previewLote.total }),
      message: t('templateMode.confirm', { total: previewLote.total, template: templateSel }),
      severity: 'normal',
    });
    if (!ok) return;

    setSending(true);
    setResult(null);
    const r: any = await dispararTemplateWhatsApp(empresaId, templateSel, filtrosDoLoteTemplate());
    setResult(r);
    setSending(false);
    // Recarrega a prévia: quem acabou de receber sai do alvo pela idempotência.
    const p: any = await previewTemplateWhatsApp(empresaId, templateSel, filtrosDoLoteTemplate());
    if (p?.success) setPreviewLote(p.data);
  }

  async function handleDisparar() {
    // Aba WhatsApp: disparo por TEMPLATE, e o alvo quem decide é o servidor.
    if (tab === 'whatsapp') return handleDispararTemplate();
    if (!empresaId || !mensagem.trim() || escopoPendente) return;

    const canal = 'email';
    const total = destinatarios.length;
    const canalLabel = canal === 'email' ? 'EMAIL' : 'WHATSAPP';
    const ok = await confirmDialog({
      title: t('sendButton', { count: total }),
      message: t('confirm.send', { channel: canalLabel, total }),
      severity: 'normal',
    });
    if (!ok) return;

    setSending(true);
    setResult(null);

    const filtros: any = { ...filtrosDeEscopo() };
    if (filtroCargo) filtros.cargo = filtroCargo;
    if (filtroVoto !== 'todos') filtros.voto = filtroVoto;
    if (filtroDisc !== 'todos') filtros.disc = filtroDisc;
    if (filtroMapeamento !== 'todos') filtros.mapeamento = filtroMapeamento;
    const isRel = tab === 'relatorios-email';
    const r = await dispararMensagemCustomizada(empresaId, mensagem, canal, filtros, assunto, isRel && anexarPDF, anexoExtra);

    setResult(r);
    setSending(false);
  }

  /**
   * Seletor de ESCOPO — a turma, ou a empresa inteira com justificativa.
   *
   * É uma FUNÇÃO chamada (`{escopoUI()}`), não um componente `<EscopoUI/>`:
   * declarado dentro do componente, o React remontaria a subárvore a cada
   * render e o campo de justificativa perderia o foco a cada tecla.
   */
  function escopoUI() {
    if (!turmas.length) return null;
    return (
      <div className="mb-3">
        <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1">{t('scope.label')}</p>
        <select
          value={escopo}
          onChange={e => { setEscopo(e.target.value); setResult(null); }}
          className={`w-full px-3 py-2 rounded-lg text-xs text-white border outline-none ${escopoPendente ? 'border-amber-400/60' : 'border-white/10'}`}
          style={{ background: '#091D35' }}>
          <option value="">{exigeEscopo ? t('scope.choose') : t('scope.wholeCompany')}</option>
          {turmas.map((tu: any) => (
            <option key={tu.id} value={tu.id}>
              {tu.nome} ({colabs.filter((c: any) => c.turmaId === tu.id).length})
            </option>
          ))}
          {exigeEscopo && <option value={EMPRESA_INTEIRA}>{t('scope.wholeCompanyJustified')}</option>}
        </select>

        {escopo === EMPRESA_INTEIRA && (
          <>
            <input
              value={justificativa}
              onChange={e => setJustificativa(e.target.value)}
              placeholder={t('scope.justificationPlaceholder')}
              className="w-full mt-2 rounded-lg border border-white/10 bg-[#091D35] text-white text-xs px-3 py-2 focus:outline-none focus:border-cyan-400/50" />
            <p className="text-[9px] text-gray-500 mt-1">{t('scope.justificationHint')}</p>
          </>
        )}

        {escopoPendente && (
          <p className="text-[10px] text-amber-300 mt-2 leading-relaxed">{t('scope.required', { count: turmas.length })}</p>
        )}

        {/* Quem está sem turma NÃO entra num envio por turma. Dizer o número é
            o que separa "protegido" de "esquecido em silêncio". */}
        {escopoTurmaId && semTurma > 0 && (
          <p className="text-[10px] text-gray-400 mt-2">{t('scope.withoutClass', { count: semTurma })}</p>
        )}
      </div>
    );
  }

  if (loading) return <div className="flex items-center justify-center h-dvh"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;

  return (
    <div className="max-w-[1180px] mx-auto px-4 py-6 sm:px-6" style={{ minHeight: '100dvh' }}>
      <BackButton onClick={() => router.push(empresaParam ? `/admin/empresas/${empresaParam}` : '/admin/dashboard')} />
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2"><Send size={20} className="text-cyan-400" /> {t('title')}</h1>
            <p className="text-xs text-gray-500">{empresaNome || t('subtitle')}</p>
          </div>
        </div>
      </div>

      {/* Empresa selector */}
      {!empresaParam && (
        <div className="mb-6">
          <select value={empresaId} onChange={e => handleSelectEmpresa(e.target.value)}
            className="w-full max-w-sm appearance-none rounded-lg border border-white/10 bg-[#0F2A4A] text-white text-sm px-4 py-2.5 focus:outline-none focus:border-cyan-400/50">
            <option value="">{t('selectCompany')}</option>
            {empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
        </div>
      )}

      {loadingStatus && <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-cyan-400" /></div>}

      {empresaId && !loadingStatus && (
        <>
          {/* Tabs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-1 mb-5 p-1 rounded-xl border border-white/[0.06]" style={{ background: '#091D35' }}>
            {TABS.map(item => (
              <button key={item.key} onClick={() => setTab(item.key)}
                className={`flex items-center justify-center gap-2 py-2.5 px-2 rounded-lg text-xs font-semibold transition-all ${
                  tab === item.key ? 'bg-white/[0.06] text-white' : 'text-gray-500 hover:text-gray-300'
                }`}>
                <item.icon size={14} className={tab === item.key ? item.color : ''} />
                {t(item.labelKey)}
              </button>
            ))}
          </div>

          {/* ═══ MAGIC LINK ═══ */}
          {tab === 'magic-link' && (
            <div className="rounded-xl border border-teal-400/20 p-5" style={{ background: '#0F2A4A' }}>
              <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                <Key size={14} className="text-teal-400" /> {t('magic.title')}
              </h3>
              <p className="text-xs text-gray-400 mb-4">{t('magic.description')}</p>
              {escopoUI()}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div>
                  <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1">{t('filters.role')}</p>
                  <select value={filtroCargo} onChange={e => setFiltroCargo(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-xs text-white border border-white/10 outline-none" style={{ background: '#091D35' }}>
                    <option value="">{t('filters.allRoles')}</option>
                    {cargos.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1">{t('filters.voting')}</p>
                  <select value={filtroVoto} onChange={e => setFiltroVoto(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg text-xs text-white border border-white/10 outline-none" style={{ background: '#091D35' }}>
                    <option value="todos">{t('filters.all')}</option>
                    <option value="nao_votou">{t('filters.notVoted')}</option>
                    <option value="votou">{t('filters.voted')}</option>
                  </select>
                </div>
                <div>
                  <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1">{t('filters.disc')}</p>
                  <select value={filtroDisc} onChange={e => setFiltroDisc(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg text-xs text-white border border-white/10 outline-none" style={{ background: '#091D35' }}>
                    <option value="todos">{t('filters.all')}</option>
                    <option value="sim">{t('filters.withProfile')}</option>
                    <option value="nao">{t('filters.withoutProfile')}</option>
                  </select>
                </div>
                <div>
                  <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1">{t('filters.mapping')}</p>
                  <select value={filtroMapeamento} onChange={e => setFiltroMapeamento(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg text-xs text-white border border-white/10 outline-none" style={{ background: '#091D35' }}>
                    <option value="todos">{t('filters.all')}</option>
                    <option value="completo">{t('filters.mappingDone')}</option>
                    <option value="pendente">{t('filters.mappingPending')}</option>
                  </select>
                </div>
              </div>
              {!escopoPendente && (
                <div className="flex items-center gap-1.5 text-[10px] text-teal-400 font-semibold mb-4">
                  <Users size={12} />
                  {t('magic.eligible', { count: destinatarios.filter((c: any) => c.telefone && c.email).length })}
                </div>
              )}
              <button
                disabled={sending || !empresaId || escopoPendente}
                onClick={async () => {
                  const totalElegivel = destinatarios.filter((c: any) => c.telefone && c.email).length;
                  const ok = await confirmDialog({
                    title: t('magic.send'),
                    message: t('confirm.magicLink', { total: totalElegivel }),
                    severity: 'normal',
                  });
                  if (!ok) return;
                  setSending(true); setResult(null);
                  const filtros: any = { ...filtrosDeEscopo() };
                  if (filtroCargo) filtros.cargo = filtroCargo;
                  if (filtroVoto !== 'todos') filtros.voto = filtroVoto;
                  if (filtroDisc !== 'todos') filtros.disc = filtroDisc;
                  if (filtroMapeamento !== 'todos') filtros.mapeamento = filtroMapeamento;
                  const r = await enviarMagicLinksWhatsApp(empresaId, filtros);
                  setResult(r); setSending(false);
                }}
                className="w-full py-3 rounded-xl text-sm font-bold text-[#0C1829] bg-gradient-to-r from-teal-400 to-teal-500 hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {sending ? t('sending') : t('magic.send')}
              </button>
              {result && (
                <div className={`mt-3 p-3 rounded-lg text-xs ${result.success ? 'bg-green-400/10 text-green-400' : 'bg-red-400/10 text-red-400'}`}>
                  {result.message || result.error}
                </div>
              )}
            </div>
          )}

          {/* Layout 2 colunas (outras tabs) */}
          {tab !== 'magic-link' && <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Coluna esquerda: Filtros + Editor */}
            <div className="space-y-4">
              {/* Filtros */}
              <div className="rounded-xl border border-white/[0.06] p-4" style={{ background: '#0F2A4A' }}>
                <p className="text-xs font-bold text-white flex items-center gap-1.5"><Filter size={12} /> {tab === 'whatsapp' ? t('templateMode.refineTitle') : t('filters.title')}</p>
                {tab === 'whatsapp' && (
                  <p className="mt-1 mb-3 text-[10px] leading-relaxed text-gray-500">{t('templateMode.refineHint')}</p>
                )}
                {escopoUI()}
                {tab === 'whatsapp' && templateAtual && (
                  <div className="mb-3 flex items-start gap-2.5 rounded-lg border border-cyan-400/20 bg-cyan-400/[0.06] p-3">
                    <ShieldCheck size={14} className="mt-0.5 shrink-0 text-cyan-300" />
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-widest text-cyan-300/80">{t('templateMode.target')}</p>
                      <p className="mt-1 text-[11px] leading-relaxed text-gray-200">{templateAtual.alvoSugerido}</p>
                    </div>
                  </div>
                )}
                {tab === 'whatsapp' && (
                  <p className="mb-2 text-[9px] font-bold uppercase tracking-widest text-gray-500">{t('templateMode.additionalFilters')}</p>
                )}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div>
                    <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1">{t('filters.role')}</p>
                    <select value={filtroCargo} onChange={e => setFiltroCargo(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-xs text-white border border-white/10 outline-none" style={{ background: '#091D35' }}>
                      <option value="">{t('filters.allRoles')}</option>
                      {cargos.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1">{t('filters.voting')}</p>
                    <select value={filtroVoto} onChange={e => setFiltroVoto(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-lg text-xs text-white border border-white/10 outline-none" style={{ background: '#091D35' }}>
                      <option value="todos">{t('filters.all')}</option>
                      <option value="nao_votou">{t('filters.notVoted')}</option>
                      <option value="votou">{t('filters.voted')}</option>
                    </select>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1">{t('filters.disc')}</p>
                    <select value={filtroDisc} onChange={e => setFiltroDisc(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-lg text-xs text-white border border-white/10 outline-none" style={{ background: '#091D35' }}>
                      <option value="todos">{t('filters.all')}</option>
                      <option value="sim">{t('filters.withProfile')}</option>
                      <option value="nao">{t('filters.withoutProfile')}</option>
                    </select>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1">{t('filters.mapping')}</p>
                    <select value={filtroMapeamento} onChange={e => setFiltroMapeamento(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-lg text-xs text-white border border-white/10 outline-none" style={{ background: '#091D35' }}>
                      <option value="todos">{t('filters.all')}</option>
                      <option value="completo">{t('filters.mappingDone')}</option>
                      <option value="pendente">{t('filters.mappingPending')}</option>
                    </select>
                  </div>
                </div>
                {/* Sem escopo escolhido a contagem seria a empresa inteira — um
                    número que não descreve nenhum envio possível. Some com ele
                    em vez de deixá-lo prometer 17 onde o servidor recusa. */}
                {!escopoPendente && tab === 'whatsapp' && (
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold text-cyan-400">
                    {loadingPreview ? <Loader2 size={12} className="animate-spin" /> : <Users size={12} />}
                    {loadingPreview
                      ? t('templateMode.loadingAudience')
                      : previewLote && !previewLote.erro
                        ? t('templateMode.automaticEligibleShort', { count: previewLote.elegiveisPeloTemplate ?? 0 })
                        : null}
                  </div>
                )}
                {!escopoPendente && tab !== 'whatsapp' && (
                  <div className="flex items-center gap-1.5 text-[10px] text-cyan-400 font-semibold">
                    <Users size={12} />
                    {t('filters.emailRecipients', { count: destinatarios.length })}
                  </div>
                )}
                {tab === 'relatorios-email' && (
                  <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
                    <input type="checkbox" checked={anexarPDF} onChange={e => setAnexarPDF(e.target.checked)}
                      className="w-4 h-4 rounded border border-white/20 bg-[#091D35] accent-purple-400" />
                    <span className="text-[10px] text-purple-400">{t('attachments.attachPdf')}</span>
                  </label>
                )}

                {/* Anexo adicional — NÃO existe no modo template.
                    `enviarTemplateCloud` monta apenas `body` e `button`: anexo
                    só viajaria em template com cabeçalho de documento, e nenhum
                    dos nossos tem. Deixar o seletor aqui aceitaria o arquivo e o
                    descartaria em silêncio. */}
                {tab !== 'whatsapp' && <div className="mt-3 pt-3 border-t border-white/[0.04]">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Paperclip size={11} className="text-gray-400" />
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t('attachments.additional')}</span>
                  </div>
                  {anexoExtra ? (
                    <div className="flex items-center gap-2 p-2 rounded-lg border border-cyan-400/20" style={{ background: 'rgba(6,182,212,0.06)' }}>
                      <FileText size={14} className="text-cyan-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-white truncate">{anexoExtra.name}</p>
                        <p className="text-[9px] text-gray-500">{(anexoExtra.size / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                      <button onClick={() => setAnexoExtra(null)} title={t('attachments.remove')} className="text-gray-500 hover:text-red-400 shrink-0">
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-[11px] font-semibold text-gray-300 hover:border-cyan-400/30 hover:text-cyan-400 transition-all cursor-pointer" style={{ background: '#091D35' }}>
                        <Paperclip size={11} />
                        {t('attachments.selectFile')}
                        <input type="file" className="hidden" accept={ANEXO_EXTS} onChange={handleAnexoChange} />
                      </label>
                      <p className="text-[9px] text-gray-500 mt-1.5 leading-relaxed">
                        {t('attachments.hint', { max: ANEXO_MAX_MB })}
                      </p>
                    </>
                  )}
                </div>}
              </div>

              {/* Modo TEMPLATE — todo envio manual por WhatsApp mora aqui. */}
              {tab === 'whatsapp' && (
                <div className="rounded-xl border border-white/[0.06] p-4" style={{ background: '#0F2A4A' }}>
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <div>
                      <p className="text-xs font-bold text-white flex items-center gap-1.5"><Workflow size={13} className="text-cyan-400" /> {t('templateMode.title')}</p>
                      <p className="text-[10px] text-gray-500 leading-relaxed mt-1">{t('templateMode.why')}</p>
                    </div>
                    {templates.length > 0 && (
                      <span className="shrink-0 rounded-full border border-cyan-400/20 bg-cyan-400/[0.06] px-2 py-1 text-[9px] font-bold text-cyan-300">
                        {t('templateMode.manualCount', { count: templates.length })}
                      </span>
                    )}
                  </div>

                  {loadingTemplates ? (
                    <div className="flex items-center gap-2 py-5 text-xs text-gray-500"><Loader2 size={13} className="animate-spin" /> {t('templateMode.loading')}</div>
                  ) : templatesError ? (
                    <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-400/10 px-3 py-2 text-xs text-red-300">
                      <AlertCircle size={13} className="mt-0.5 shrink-0" /> {templatesError}
                    </div>
                  ) : (
                    <div className="mt-4 space-y-4">
                      <div
                        role="tablist"
                        aria-label={t('templateMode.stageFilter')}
                        className="flex flex-wrap gap-1.5">
                        {etapasTemplates.map(([etapa, itens]) => {
                          const ativa = etapa === etapaTemplateAtiva;
                          return (
                            <button
                              key={etapa}
                              type="button"
                              role="tab"
                              aria-selected={ativa}
                              onClick={() => selecionarEtapaTemplate(etapa)}
                              className={`rounded-full border px-2.5 py-1.5 text-[9px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 ${
                                ativa
                                  ? 'border-cyan-400/45 bg-cyan-400/[0.1] text-cyan-200'
                                  : 'border-white/[0.07] bg-[#091D35] text-gray-500 hover:border-white/[0.16] hover:text-gray-300'
                              }`}>
                              {etapa} <span className="ml-1 text-[8px] opacity-60">{itens.length}</span>
                            </button>
                          );
                        })}
                      </div>

                      <div>
                        <div className="mb-2 flex items-center gap-2">
                          <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-gray-500">{etapaTemplateAtiva}</span>
                          <span className="h-px flex-1 bg-white/[0.05]" />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {templatesEtapaAtiva.map((tp: any) => {
                            const selecionado = tp.template === templateSel;
                            const indisponivel = tp.disponivel === false;
                            return (
                              <button
                                key={tp.template}
                                type="button"
                                disabled={indisponivel}
                                title={tp.motivoIndisponivel || tp.rotulo}
                                aria-pressed={selecionado}
                                onClick={() => { setTemplateSel(tp.template); setResult(null); }}
                                className={`min-h-[88px] rounded-lg border p-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 disabled:cursor-not-allowed disabled:opacity-45 ${
                                  selecionado
                                    ? 'border-cyan-400/55 bg-cyan-400/[0.09] shadow-[inset_3px_0_0_#22d3ee]'
                                    : 'border-white/[0.07] bg-[#091D35] hover:border-white/[0.16] hover:bg-white/[0.025]'
                                }`}>
                                <span className="flex items-start justify-between gap-2">
                                  <span className="text-[11px] font-bold leading-snug text-white">{tp.rotulo}</span>
                                  <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide ${
                                    indisponivel ? 'bg-red-400/10 text-red-300' : 'bg-emerald-400/10 text-emerald-300'
                                  }`}>
                                    {indisponivel ? t('templateMode.unavailable') : t('templateMode.approved')}
                                  </span>
                                </span>
                                <code className="mt-1 block text-[9px] text-cyan-400/70">{tp.template}</code>
                                <span className="mt-2 line-clamp-2 block text-[9px] leading-relaxed text-gray-500">{tp.alvoSugerido}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  {templateAtual && (
                    <div className="mt-4 rounded-lg border border-white/[0.06] bg-[#091D35]/70 p-3">
                      <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1">{t('templateMode.variables')}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {templateAtual.variaveis.map((v: string, i: number) => (
                          <span key={i} className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold text-cyan-400 border border-cyan-400/30">
                            <Tag size={9} /> {`{{${i + 1}}}`} · {v}
                          </span>
                        ))}
                        {templateAtual.botaoVariavel && (
                          <span className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold text-violet-300 border border-violet-400/30">
                            <MousePointerClick size={9} /> {t('templateMode.buttonVariable')} · {templateAtual.botaoVariavel}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {catalogoTemplates.length > 0 && (
                    <details className="group mt-4 rounded-lg border border-white/[0.06] bg-[#091D35]/55">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-[10px] font-semibold text-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-400/60">
                        <span className="flex items-center gap-1.5"><ShieldCheck size={12} className="text-emerald-400" /> {t('templateMode.catalogTitle')}</span>
                        <span className="text-[9px] font-normal text-gray-500">
                          {t('templateMode.catalogSummary', { approved: catalogoAprovados, manual: templates.length })}
                        </span>
                      </summary>
                      <div className="border-t border-white/[0.05] px-3 pb-3 pt-2">
                        <p className="mb-2 text-[9px] leading-relaxed text-gray-500">
                          {catalogoFonte === 'meta' ? t('templateMode.catalogHint') : t('templateMode.catalogLocal')}
                        </p>
                        <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
                          {catalogoTemplates.map((tp: any) => (
                            <div key={tp.template} className="flex items-center justify-between gap-2 rounded-md border border-white/[0.04] px-2.5 py-2 text-[9px]">
                              <span className="min-w-0 truncate font-mono text-gray-300">{tp.template}</span>
                              <span className="flex shrink-0 items-center gap-1.5">
                                <span className="text-gray-600">{t(`templateMode.usage.${tp.uso || 'manual'}`)}</span>
                                <span className={tp.categoria === 'MARKETING' ? 'text-amber-300' : 'text-gray-500'}>{tp.categoria}</span>
                                <span className={tp.status === 'APPROVED' ? 'text-emerald-400' : tp.status === 'REJECTED' ? 'text-red-400' : 'text-amber-300'}>{tp.status}</span>
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </details>
                  )}
                </div>
              )}

              {/* Editor de mensagem (texto livre — e-mail e relatórios) */}
              {tab !== 'whatsapp' && <div className="rounded-xl border border-white/[0.06] p-4" style={{ background: '#0F2A4A' }}>
                {/* Assunto (só email) */}
                {(tab === 'email' || tab === 'relatorios-email') && (
                  <div className="mb-3">
                    <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1">{t('editor.subject')}</p>
                    <input value={assunto} onChange={e => setAssunto(e.target.value)}
                      placeholder={t('subjects.assessment')}
                      className="w-full rounded-lg border border-white/10 bg-[#091D35] text-white text-sm px-3 py-2 focus:outline-none focus:border-cyan-400/50" />
                  </div>
                )}

                <p className="text-xs font-bold text-white flex items-center gap-1.5 mb-3"><MessageCircle size={12} /> {t('editor.message')}</p>

                {/* Variáveis */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {VARIAVEIS.map(v => (
                    <button key={v.tag} onClick={() => inserirVariavel(v.tag)}
                      className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10 transition-all">
                      <Tag size={9} /> {v.label}
                    </button>
                  ))}
                </div>

                {/* Textarea */}
                <textarea
                  ref={textareaRef}
                  value={mensagem}
                  onChange={e => setMensagem(e.target.value)}
                  rows={8}
                  className="w-full rounded-lg border border-white/10 bg-[#091D35] text-white text-sm px-3 py-2 focus:outline-none focus:border-cyan-400/50 resize-none font-mono"
                  placeholder={t('editor.placeholder')}
                />

                <div className="flex items-center justify-between mt-2 text-[9px] text-gray-600">
                  <span>{t.rich('editor.formatHint', { strong: chunks => <strong className="text-gray-400">{chunks}</strong>, em: chunks => <em className="text-gray-400">{chunks}</em> })}</span>
                  <span>{t('editor.chars', { count: mensagem.length })}</span>
                </div>
              </div>}

              {/* Botão disparar */}
              {(() => {
                // Quantos vão receber: no modo template quem conta é o SERVIDOR
                // (aplica idempotência e exclusões que a tela não conhece).
                const total = tab === 'whatsapp' ? (previewLote?.total ?? 0) : destinatarios.length;
                const bloqueado = sending || total === 0 || escopoPendente
                  || (tab === 'whatsapp' && (loadingPreview || !templateSel || templateAtual?.disponivel === false));
                return (
                  <button onClick={handleDisparar} disabled={bloqueado}
                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition-colors"
                    style={{ background: sending ? '#374151' : 'linear-gradient(135deg, #0D9488, #0F766E)' }}>
                    {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    {sending ? t('sending') : t('sendButton', { count: total })}
                  </button>
                );
              })()}

              {result && (
                <div className={`flex items-start gap-2 px-4 py-3 rounded-xl text-xs ${
                  result.success ? 'bg-green-400/10 text-green-400' : 'bg-red-400/10 text-red-400'
                }`}>
                  {result.success ? <CheckCircle size={14} className="shrink-0 mt-0.5" /> : <AlertCircle size={14} className="shrink-0 mt-0.5" />}
                  <span>{result.message || result.error}</span>
                </div>
              )}
            </div>

            {/* Coluna direita: Preview */}
            <div className="space-y-4">
              {/* Preview */}
              <div className="rounded-xl border border-white/[0.06] p-4" style={{ background: '#0F2A4A' }}>
                <p className="text-xs font-bold text-white flex items-center gap-1.5 mb-3"><Eye size={12} /> {t('preview.title')}</p>
                <div className="rounded-lg p-4 text-sm text-gray-300 leading-relaxed whitespace-pre-wrap" style={{ background: '#091D35' }}>
                  {tab === 'whatsapp'
                    ? (corpoTemplatePreview
                        // Com alvo, usa os dados REAIS da primeira pessoa. Sem
                        // alvo, mantém a copy visível com rótulos das variáveis.
                        ? renderWaMarkdown(corpoTemplatePreview)
                        : <span className="text-gray-600 italic">{t('preview.empty')}</span>)
                    : (previewMsg
                        ? renderWaMarkdown(previewMsg)
                        : <span className="text-gray-600 italic">{t('preview.empty')}</span>)}
                </div>
                {tab === 'whatsapp' && loadingPreview && (
                  <p className="mt-2 flex items-center gap-1.5 text-[9px] text-gray-500"><Loader2 size={10} className="animate-spin" /> {t('templateMode.loadingPreview')}</p>
                )}
                {tab === 'whatsapp' && previewLote?.erro && (
                  <p className="mt-2 flex items-start gap-1.5 rounded-md bg-amber-400/[0.08] px-2.5 py-2 text-[10px] leading-relaxed text-amber-300">
                    <AlertCircle size={11} className="mt-0.5 shrink-0" /> {previewLote.erro}
                  </p>
                )}
                {tab === 'whatsapp' && previewLote?.amostra?.[0] && (
                  <>
                    <p className="text-[9px] text-gray-600 mt-2">{t('templateMode.previewOf', { nome: previewLote.amostra[0].nome })}</p>
                    {previewLote.amostra[0].botaoParam && (
                      <p className="mt-1 flex items-center gap-1 text-[9px] text-violet-300/80">
                        <MousePointerClick size={9} />
                        {t('templateMode.buttonDestination', { destino: `/ir/${previewLote.amostra[0].botaoParam}` })}
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* Composição do lote — quem entra, quem NÃO entra e por quê */}
              {tab === 'whatsapp' && previewLote && !previewLote.erro && (
                <div className="rounded-xl border border-white/[0.06] p-4" style={{ background: '#0F2A4A' }}>
                  <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-2">{t('templateMode.batch')}</p>
                  <ol className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label={t('templateMode.audienceFunnel')}>
                    <li className="rounded-lg border border-white/[0.06] bg-[#091D35]/70 px-2.5 py-2">
                      <span className="block text-[8px] font-bold uppercase tracking-wider text-gray-500">{t('templateMode.funnelScope')}</span>
                      <strong className="mt-1 block text-base text-gray-300">{previewLote.totalNoEscopo ?? 0}</strong>
                    </li>
                    <li className="rounded-lg border border-sky-400/15 bg-sky-400/[0.04] px-2.5 py-2">
                      <span className="block text-[8px] font-bold uppercase tracking-wider text-sky-300/60">{t('templateMode.funnelEligible')}</span>
                      <strong className="mt-1 block text-base text-sky-300">{previewLote.elegiveisPeloTemplate ?? 0}</strong>
                    </li>
                    <li className="rounded-lg border border-teal-400/15 bg-teal-400/[0.04] px-2.5 py-2">
                      <span className="block text-[8px] font-bold uppercase tracking-wider text-teal-300/60">{t('templateMode.funnelRefined')}</span>
                      <strong className="mt-1 block text-base text-teal-300">{previewLote.aposRefinamentos ?? 0}</strong>
                    </li>
                    <li className="rounded-lg border border-cyan-400/30 bg-cyan-400/[0.08] px-2.5 py-2">
                      <span className="block text-[8px] font-bold uppercase tracking-wider text-cyan-300/70">{t('templateMode.funnelSend')}</span>
                      <strong className="mt-1 block text-base text-cyan-300">{previewLote.total ?? 0}</strong>
                    </li>
                  </ol>
                  {previewLote.removidosPorFiltros > 0 && (
                    <p className="mb-1 text-[10px] text-gray-400">{t('templateMode.removedByFilters', { count: previewLote.removidosPorFiltros })}</p>
                  )}
                  {previewLote.jaReceberam > 0 && (
                    <p className="text-[10px] text-gray-400 mb-1">{t('templateMode.already', { count: previewLote.jaReceberam })}</p>
                  )}
                  {previewLote.excluidos?.length > 0 && (
                    <div className="mt-3 border-t border-white/[0.05] pt-2">
                      <p className="mb-1.5 text-[8px] font-bold uppercase tracking-widest text-amber-300/60">{t('templateMode.outsideAutomaticRule')}</p>
                      {previewLote.excluidos.map((e: any, i: number) => (
                        <p key={i} className="text-[10px] text-amber-300/80 mb-1">
                          {e.quantidade} · {e.motivo}
                          {e.amostra?.length ? <span className="text-gray-600"> — {e.amostra.slice(0, 3).join(', ')}{e.quantidade > 3 ? '…' : ''}</span> : null}
                        </p>
                      ))}
                    </div>
                  )}
                  {previewLote.avisoTeto ? <p className="text-[10px] text-amber-300/80 mt-1">{previewLote.avisoTeto}</p> : null}
                  <p className="text-[9px] text-gray-600 mt-2 leading-relaxed">{t('templateMode.deliveryNote')}</p>
                </div>
              )}

              {/* Variáveis disponíveis (modo texto — o template tem as suas) */}
              {tab !== 'whatsapp' && <div className="rounded-xl border border-white/[0.06] p-4" style={{ background: '#0F2A4A' }}>
                <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-2">{t('variables.available')}</p>
                <div className="space-y-1.5">
                  {VARIAVEIS.map(v => (
                    <div key={v.tag} className="flex items-center justify-between text-[11px]">
                      <span className="font-mono px-1.5 py-0.5 rounded bg-cyan-400/10 text-cyan-400">{v.tag}</span>
                      <span className="text-gray-500">→ {v.exemplo}</span>
                    </div>
                  ))}
                </div>
              </div>}

              {/* Dicas */}
              <div className="rounded-xl border border-white/[0.06] p-4" style={{ background: '#0F2A4A' }}>
                <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-2">{t('tips.title')}</p>
                {tab === 'whatsapp' ? (
                  // Markdown do WhatsApp não se aplica: o corpo é fixo, aprovado
                  // pela Meta, e a tela não edita nada dele.
                  <ul className="space-y-1 text-[10px] text-gray-400">
                    <li>• {t('templateMode.tipFixed')}</li>
                    <li>• {t('templateMode.tipNoAttachment')}</li>
                    <li>{t('tips.interval')}</li>
                    <li>• {t('templateMode.tipOnlyWhatsapp')}</li>
                    <li>{t('tips.firstName')}</li>
                  </ul>
                ) : (
                  <ul className="space-y-1 text-[10px] text-gray-400">
                    <li>{t('tips.bold')}</li>
                    <li>{t('tips.italic')}</li>
                    <li>{t('tips.interval')}</li>
                    <li>{tab === 'email' ? t('tips.emailIncluded') : t('tips.whatsappIncluded')}</li>
                    <li>{t('tips.firstName')}</li>
                  </ul>
                )}
              </div>
            </div>
          </div>}
        </>
      )}
    </div>
  );
}
