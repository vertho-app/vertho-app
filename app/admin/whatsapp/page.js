'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft, Loader2, Send, ChevronDown, CheckCircle, AlertCircle,
  Mail, MessageCircle, FileBarChart, Filter, Eye, Tag, Users
} from 'lucide-react';
import { loadEmpresas, loadWhatsappStatus, loadColaboradoresEnvio, dispararMensagemCustomizada } from './actions';
import { dispararLinksCIS, dispararRelatoriosLote } from '@/actions/whatsapp-lote';
import { dispararEmails } from '@/actions/fase2';

const TABS = [
  { key: 'email', label: 'Email Convites', icon: Mail, color: 'text-blue-400' },
  { key: 'whatsapp', label: 'WhatsApp Avaliação', icon: MessageCircle, color: 'text-green-400' },
  { key: 'relatorios', label: 'WhatsApp Relatórios', icon: FileBarChart, color: 'text-purple-400' },
];

const VARIAVEIS = [
  { tag: '{{nome}}', label: 'Nome', exemplo: 'Maria' },
  { tag: '{{cargo}}', label: 'Cargo', exemplo: 'Consultor de Vendas' },
  { tag: '{{empresa}}', label: 'Empresa', exemplo: 'Boehringer Ingelheim' },
  { tag: '{{link}}', label: 'Link', exemplo: 'https://vertho.app/avaliacao/...' },
];

const DEFAULT_MSGS = {
  email: `Olá {{nome}}!

Você foi convidado(a) para participar da avaliação de competências da *{{empresa}}*.

Acesse pelo link abaixo:
{{link}}`,
  whatsapp: `Olá {{nome}}! 👋

Você foi convidado(a) para a avaliação de competências da *{{empresa}}*.

Acesse: {{link}}`,
  relatorios: `Olá {{nome}}!

Seu relatório individual de competências da *{{empresa}}* está disponível.

Acesse: {{link}}`,
};

export default function EnviosPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const empresaParam = searchParams.get('empresa');

  const [empresas, setEmpresas] = useState([]);
  const [empresaId, setEmpresaId] = useState(empresaParam || '');
  const [empresaNome, setEmpresaNome] = useState('');
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState(false);

  const [tab, setTab] = useState('email');
  const [mensagem, setMensagem] = useState(DEFAULT_MSGS.email);
  const [filtroCargo, setFiltroCargo] = useState('');
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
    setMensagem(DEFAULT_MSGS[tab] || '');
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
    if (tab === 'whatsapp' || tab === 'relatorios') return !!c.telefone;
    return !!c.email;
  });

  // Preview da mensagem
  const previewMsg = mensagem
    .replace(/\{\{nome\}\}/g, 'Maria')
    .replace(/\{\{cargo\}\}/g, 'Consultor de Vendas')
    .replace(/\{\{empresa\}\}/g, empresaNome || 'Empresa')
    .replace(/\{\{link\}\}/g, 'https://vertho.app/avaliacao/abc123');

  function inserirVariavel(tag) {
    setMensagem(prev => prev + tag);
  }

  async function handleDisparar() {
    if (!empresaId || !mensagem.trim()) return;
    setSending(true);
    setResult(null);

    const canal = tab === 'email' ? 'email' : 'whatsapp';
    const filtros = filtroCargo ? { cargo: filtroCargo } : {};
    const r = await dispararMensagemCustomizada(empresaId, mensagem, canal, filtros);

    setResult(r);
    setSending(false);
    const s = await loadWhatsappStatus(empresaId);
    if (s.success) setStatus(s.data);
  }

  if (loading) return <div className="flex items-center justify-center h-dvh"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-6 sm:px-6" style={{ minHeight: '100dvh' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push(empresaParam ? `/admin/empresas/${empresaParam}` : '/admin/dashboard')}
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-white/10 text-gray-400 hover:text-white transition-colors">
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2"><Send size={20} className="text-cyan-400" /> Envios</h1>
            {empresaNome && <p className="text-xs text-gray-500">{empresaNome}</p>}
          </div>
        </div>
      </div>

      {/* Empresa selector */}
      {!empresaParam && (
        <div className="mb-6">
          <select value={empresaId} onChange={e => handleSelectEmpresa(e.target.value)}
            className="w-full max-w-sm appearance-none rounded-lg border border-white/10 bg-[#0F2A4A] text-white text-sm px-4 py-2.5 focus:outline-none focus:border-cyan-400/50">
            <option value="">Selecione uma empresa...</option>
            {empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
        </div>
      )}

      {loadingStatus && <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-cyan-400" /></div>}

      {empresaId && !loadingStatus && (
        <>
          {/* Tabs */}
          <div className="flex gap-1 mb-5 p-1 rounded-xl border border-white/[0.06]" style={{ background: '#091D35' }}>
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                  tab === t.key ? 'bg-white/[0.06] text-white' : 'text-gray-500 hover:text-gray-300'
                }`}>
                <t.icon size={14} className={tab === t.key ? t.color : ''} />
                {t.label}
              </button>
            ))}
          </div>

          {/* Layout 2 colunas */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Coluna esquerda: Filtros + Editor */}
            <div className="space-y-4">
              {/* Filtros */}
              <div className="rounded-xl border border-white/[0.06] p-4" style={{ background: '#0F2A4A' }}>
                <p className="text-xs font-bold text-white flex items-center gap-1.5 mb-3"><Filter size={12} /> Filtros de Destinatários</p>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div>
                    <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1">Cargo</p>
                    <select value={filtroCargo} onChange={e => setFiltroCargo(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-xs text-white border border-white/10 outline-none" style={{ background: '#091D35' }}>
                      <option value="">Todos os cargos</option>
                      {cargos.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-cyan-400 font-semibold">
                  <Users size={12} />
                  {destinatarios.length} destinatário(s) {tab !== 'email' ? 'com WhatsApp' : 'com email'}
                </div>
              </div>

              {/* Editor de mensagem */}
              <div className="rounded-xl border border-white/[0.06] p-4" style={{ background: '#0F2A4A' }}>
                <p className="text-xs font-bold text-white flex items-center gap-1.5 mb-3"><MessageCircle size={12} /> Mensagem</p>

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
                <textarea value={mensagem} onChange={e => setMensagem(e.target.value)} rows={8}
                  className="w-full rounded-lg border border-white/10 bg-[#091D35] text-white text-sm px-3 py-2 focus:outline-none focus:border-cyan-400/50 resize-none font-mono"
                  placeholder="Olá {{nome}}! ..." />

                <div className="flex items-center justify-between mt-2 text-[9px] text-gray-600">
                  <span>*negrito* → <strong className="text-gray-400">negrito</strong> · _itálico_ → <em className="text-gray-400">itálico</em></span>
                  <span>{mensagem.length} caracteres</span>
                </div>
              </div>

              {/* Botão disparar */}
              <button onClick={handleDisparar} disabled={sending || destinatarios.length === 0}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition-colors"
                style={{ background: sending ? '#374151' : 'linear-gradient(135deg, #0D9488, #0F766E)' }}>
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                {sending ? 'Enviando...' : `Disparar para ${destinatarios.length} destinatário(s)`}
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
                <p className="text-xs font-bold text-white flex items-center gap-1.5 mb-3"><Eye size={12} /> Preview da Mensagem</p>
                <div className="rounded-lg p-4 text-sm text-gray-300 leading-relaxed whitespace-pre-wrap" style={{ background: '#091D35' }}>
                  {previewMsg || <span className="text-gray-600 italic">A mensagem aparecerá aqui...</span>}
                </div>
              </div>

              {/* Variáveis disponíveis */}
              <div className="rounded-xl border border-white/[0.06] p-4" style={{ background: '#0F2A4A' }}>
                <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-2">Variáveis Disponíveis</p>
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
                <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-2">Dicas</p>
                <ul className="space-y-1 text-[10px] text-gray-400">
                  <li>• Use <span className="text-white font-mono">*texto*</span> para <strong className="text-white">negrito</strong></li>
                  <li>• Use <span className="text-white font-mono">_texto_</span> para <em className="text-white">itálico</em></li>
                  <li>• Intervalo de 1s entre envios para evitar bloqueio</li>
                  <li>• {tab === 'email' ? 'Todos os colaboradores com email serão incluídos' : 'Apenas colaboradores com WhatsApp cadastrado serão incluídos'}</li>
                  <li>• O primeiro nome é usado automaticamente no {'{{nome}}'}</li>
                </ul>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
