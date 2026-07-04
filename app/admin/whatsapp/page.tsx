'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  Loader2, Send, ChevronDown, CheckCircle, AlertCircle,
  Mail, MessageCircle, FileBarChart, Filter, Eye, Tag, Users,
  Paperclip, FileText, X,
} from 'lucide-react';
import { loadEmpresas, loadWhatsappStatus, loadColaboradoresEnvio, dispararMensagemCustomizada, enviarMagicLinksWhatsApp } from './actions';
import BackButton from '@/components/back-button';
import { useConfirm } from '@/components/admin/confirm-dialog';
import { useEmpresaContexto } from '@/app/admin/_shell/useEmpresaContexto';
import { dispararLinksCIS, dispararRelatoriosLote } from '@/actions/whatsapp-lote';
import { dispararEmails } from '@/actions/fase2';
import { Key } from 'lucide-react';

const TABS = [
  { key: 'magic-link', labelKey: 'tabs.magicLink', icon: Key, color: 'text-teal-400' },
  { key: 'email', labelKey: 'tabs.emailInvites', icon: Mail, color: 'text-blue-400' },
  { key: 'whatsapp', labelKey: 'tabs.whatsappInvites', icon: MessageCircle, color: 'text-green-400' },
  { key: 'relatorios-email', labelKey: 'tabs.emailReports', icon: Mail, color: 'text-purple-400' },
  { key: 'relatorios-whatsapp', labelKey: 'tabs.whatsappReports', icon: MessageCircle, color: 'text-purple-400' },
];

const VARIAVEIS = [
  { tag: '{{nome}}', label: 'Nome', exemplo: 'Maria' },
  { tag: '{{cargo}}', label: 'Cargo', exemplo: 'Consultor de Vendas' },
  { tag: '{{empresa}}', label: 'Empresa', exemplo: 'Boehringer Ingelheim' },
  { tag: '{{link}}', label: 'Link', exemplo: 'https://ibipeba.vertho.ai/login' },
  { tag: '{{link_disc}}', label: 'Link DISC', exemplo: 'https://ibipeba.vertho.ai/dashboard/perfil-comportamental/mapeamento' },
];

const DEFAULT_MSGS = {
  email: `Olá {{nome}}!

Você foi convidado(a) para participar da avaliação de competências da *{{empresa}}*.

Acesse pelo link abaixo:
{{link}}`,
  whatsapp: `Olá {{nome}}!

Você foi convidado(a) para a avaliação de competências da *{{empresa}}*.

Acesse: {{link}}`,
  'relatorios-email': `Olá {{nome}}!

Seu relatório individual de competências da *{{empresa}}* está disponível.

Acesse pelo link abaixo para visualizar:
{{link}}`,
  'relatorios-whatsapp': `Olá {{nome}}!

Seu relatório de competências da *{{empresa}}* está pronto.

Acesse: {{link}}`,
};

export default function EnviosPage() {
  const router = useRouter();
  const t = useTranslations('AdminWhatsapp');
  const confirmDialog = useConfirm();
  // Contexto de empresa (path → ?empresa= → filtro do header); a tela tem seletor
  // próprio, então o contexto entra só como valor inicial/fallback do estado local.
  const { empresaId: empresaParam } = useEmpresaContexto();
  const defaultMsgs = {
    email: t('defaultMessages.email'),
    whatsapp: t('defaultMessages.whatsapp'),
    'relatorios-email': t('defaultMessages.reportEmail'),
    'relatorios-whatsapp': t('defaultMessages.reportWhatsapp'),
  };

  const [empresas, setEmpresas] = useState([]);
  const [empresaId, setEmpresaId] = useState(empresaParam || '');
  const [empresaNome, setEmpresaNome] = useState('');
  const [status, setStatus] = useState(null);
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
    setMensagem(defaultMsgs[tab] || '');
    setAssunto(tab === 'email' ? t('subjects.assessment') : tab === 'relatorios-email' ? t('subjects.report') : '');
    setResult(null);
  }, [tab]);

  async function handleSelectEmpresa(id) {
    setEmpresaId(id);
    setResult(null);
    if (!id) { setStatus(null); setColabs([]); return; }
    setLoadingStatus(true);
    const [s, c] = await Promise.all([
      loadWhatsappStatus(id),
      loadColaboradoresEnvio(id),
    ]);
    if (s.success) setStatus(s.data);
    setColabs(c || []);
    setCargos([...new Set((c || []).map(x => x.cargo).filter(Boolean))].sort());
    setLoadingStatus(false);
  }

  // Destinatários filtrados
  const destinatarios = colabs.filter(c => {
    if (filtroCargo && c.cargo !== filtroCargo) return false;
    if (filtroVoto === 'nao_votou' && c.votou) return false;
    if (filtroVoto === 'votou' && !c.votou) return false;
    if (filtroDisc === 'sim' && !c.temDisc) return false;
    if (filtroDisc === 'nao' && c.temDisc) return false;
    if (filtroMapeamento === 'completo' && !c.temMapeamento) return false;
    if (filtroMapeamento === 'pendente' && c.temMapeamento) return false;
    if (tab === 'whatsapp' || tab === 'relatorios-whatsapp') return !!c.telefone;
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

  async function handleDisparar() {
    if (!empresaId || !mensagem.trim()) return;

    const canal = (tab === 'email' || tab === 'relatorios-email') ? 'email' : 'whatsapp';
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

    const filtros: any = {};
    if (filtroCargo) filtros.cargo = filtroCargo;
    if (filtroVoto !== 'todos') filtros.voto = filtroVoto;
    if (filtroDisc !== 'todos') filtros.disc = filtroDisc;
    if (filtroMapeamento !== 'todos') filtros.mapeamento = filtroMapeamento;
    const isRel = tab === 'relatorios-email' || tab === 'relatorios-whatsapp';
    const r = await dispararMensagemCustomizada(empresaId, mensagem, canal, filtros, assunto, isRel && anexarPDF, anexoExtra);

    setResult(r);
    setSending(false);
    const s = await loadWhatsappStatus(empresaId);
    if (s.success) setStatus(s.data);
  }

  if (loading) return <div className="flex items-center justify-center h-dvh"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-6 sm:px-6" style={{ minHeight: '100dvh' }}>
      <BackButton onClick={() => router.push(empresaParam ? `/admin/empresas/${empresaParam}` : '/admin/dashboard')} />
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2"><Send size={20} className="text-cyan-400" /> {t('title')}</h1>
            {empresaNome && <p className="text-xs text-gray-500">{empresaNome}</p>}
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
          <div className="flex gap-1 mb-5 p-1 rounded-xl border border-white/[0.06]" style={{ background: '#091D35' }}>
            {TABS.map(item => (
              <button key={item.key} onClick={() => setTab(item.key)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition-all ${
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
              <div className="flex items-center gap-1.5 text-[10px] text-teal-400 font-semibold mb-4">
                <Users size={12} />
                {t('magic.eligible', { count: destinatarios.filter((c: any) => c.telefone && c.email).length })}
              </div>
              <button
                disabled={sending || !empresaId}
                onClick={async () => {
                  const totalElegivel = destinatarios.filter((c: any) => c.telefone && c.email).length;
                  const ok = await confirmDialog({
                    title: t('magic.send'),
                    message: t('confirm.magicLink', { total: totalElegivel }),
                    severity: 'normal',
                  });
                  if (!ok) return;
                  setSending(true); setResult(null);
                  const filtros: any = {};
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
                <p className="text-xs font-bold text-white flex items-center gap-1.5 mb-3"><Filter size={12} /> {t('filters.title')}</p>
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
                <div className="flex items-center gap-1.5 text-[10px] text-cyan-400 font-semibold">
                  <Users size={12} />
                  {t((tab === 'email' || tab === 'relatorios-email') ? 'filters.emailRecipients' : 'filters.whatsappRecipients', { count: destinatarios.length })}
                </div>
                {(tab === 'relatorios-email' || tab === 'relatorios-whatsapp') && (
                  <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
                    <input type="checkbox" checked={anexarPDF} onChange={e => setAnexarPDF(e.target.checked)}
                      className="w-4 h-4 rounded border border-white/20 bg-[#091D35] accent-purple-400" />
                    <span className="text-[10px] text-purple-400">{t('attachments.attachPdf')}</span>
                  </label>
                )}

                {/* Anexo adicional — disponível em todas as abas */}
                <div className="mt-3 pt-3 border-t border-white/[0.04]">
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
                </div>
              </div>

              {/* Editor de mensagem */}
              <div className="rounded-xl border border-white/[0.06] p-4" style={{ background: '#0F2A4A' }}>
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
              </div>

              {/* Botão disparar */}
              <button onClick={handleDisparar} disabled={sending || destinatarios.length === 0}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition-colors"
                style={{ background: sending ? '#374151' : 'linear-gradient(135deg, #0D9488, #0F766E)' }}>
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                {sending ? t('sending') : t('sendButton', { count: destinatarios.length })}
              </button>

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
                  {previewMsg
                    ? renderWaMarkdown(previewMsg)
                    : <span className="text-gray-600 italic">{t('preview.empty')}</span>}
                </div>
              </div>

              {/* Variáveis disponíveis */}
              <div className="rounded-xl border border-white/[0.06] p-4" style={{ background: '#0F2A4A' }}>
                <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-2">{t('variables.available')}</p>
                <div className="space-y-1.5">
                  {VARIAVEIS.map(v => (
                    <div key={v.tag} className="flex items-center justify-between text-[11px]">
                      <span className="font-mono px-1.5 py-0.5 rounded bg-cyan-400/10 text-cyan-400">{v.tag}</span>
                      <span className="text-gray-500">→ {v.exemplo}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Dicas */}
              <div className="rounded-xl border border-white/[0.06] p-4" style={{ background: '#0F2A4A' }}>
                <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-2">{t('tips.title')}</p>
                <ul className="space-y-1 text-[10px] text-gray-400">
                  <li>{t('tips.bold')}</li>
                  <li>{t('tips.italic')}</li>
                  <li>{t('tips.interval')}</li>
                  <li>{tab === 'email' ? t('tips.emailIncluded') : t('tips.whatsappIncluded')}</li>
                  <li>{t('tips.firstName')}</li>
                </ul>
              </div>
            </div>
          </div>}
        </>
      )}
    </div>
  );
}
