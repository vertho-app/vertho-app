'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Loader2, MessageCircle, Send, ChevronDown, CheckCircle, AlertCircle, Link2, FileBarChart } from 'lucide-react';
import { loadEmpresas, loadWhatsappStatus } from './actions';
import { dispararLinksCIS, dispararRelatoriosLote } from '@/actions/whatsapp-lote';
import { dispararEmails } from '@/actions/fase2';

export default function WhatsappPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const empresaParam = searchParams.get('empresa');
  const [empresas, setEmpresas] = useState([]);
  const [empresaId, setEmpresaId] = useState(empresaParam || '');
  const [empresaNome, setEmpresaNome] = useState('');
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [sendingCIS, setSendingCIS] = useState(false);
  const [sendingRel, setSendingRel] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [resultCIS, setResultCIS] = useState(null);
  const [resultRel, setResultRel] = useState(null);
  const [resultEmail, setResultEmail] = useState(null);

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

  async function handleSelectEmpresa(id) {
    setEmpresaId(id);
    setResultCIS(null);
    setResultRel(null);
    if (!id) { setStatus(null); return; }
    setLoadingStatus(true);
    const r = await loadWhatsappStatus(id);
    if (r.success) setStatus(r.data);
    setLoadingStatus(false);
  }

  async function handleDispararCIS() {
    if (!empresaId) return;
    setSendingCIS(true);
    setResultCIS(null);
    const r = await dispararLinksCIS(empresaId);
    setResultCIS(r);
    setSendingCIS(false);
    // Refresh counts
    const s = await loadWhatsappStatus(empresaId);
    if (s.success) setStatus(s.data);
  }

  async function handleDispararRelatorios() {
    if (!empresaId) return;
    setSendingRel(true);
    setResultRel(null);
    const r = await dispararRelatoriosLote(empresaId);
    setResultRel(r);
    setSendingRel(false);
    const s = await loadWhatsappStatus(empresaId);
    if (s.success) setStatus(s.data);
  }

  if (loading) return <div className="flex items-center justify-center h-dvh"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;

  return (
    <div className="max-w-[900px] mx-auto px-4 py-6 sm:px-6" style={{ minHeight: '100dvh' }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push(empresaParam ? `/admin/empresas/${empresaParam}` : '/admin/dashboard')} className="w-9 h-9 flex items-center justify-center rounded-lg border border-white/10 text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2"><Send size={20} className="text-cyan-400" /> Envios</h1>
          {empresaParam && empresaNome ? (
            <p className="text-xs text-gray-500">{empresaNome}</p>
          ) : (
            <p className="text-xs text-gray-500">Disparo de convites e relatórios por email e WhatsApp</p>
          )}
        </div>
      </div>

      {/* Empresa selector */}
      {!empresaParam && (
        <div className="mb-6">
          <div className="relative w-full max-w-sm">
            <select value={empresaId} onChange={e => handleSelectEmpresa(e.target.value)}
              className="w-full appearance-none rounded-lg border border-white/10 bg-[#0F2A4A] text-white text-sm px-4 py-2.5 pr-10 focus:outline-none focus:border-cyan-400/50">
              <option value="">Selecione uma empresa...</option>
              {empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
          </div>
        </div>
      )}

      {loadingStatus && <div className="flex items-center justify-center py-12"><Loader2 size={24} className="animate-spin text-cyan-400" /></div>}

      {!loadingStatus && empresaId && !status && (
        <div className="text-center py-12">
          <MessageCircle size={32} className="text-gray-600 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Erro ao carregar status</p>
        </div>
      )}

      {status && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Email Convites */}
          <div className="rounded-xl border border-white/[0.06] overflow-hidden" style={{ background: '#0F2A4A' }}>
            <div className="px-5 py-3 border-b border-white/[0.06] flex items-center gap-2">
              <Send size={16} className="text-blue-400" />
              <span className="text-sm font-bold text-white">Email — Convites</span>
            </div>
            <div className="p-5">
              <p className="text-xs text-gray-400 mb-4">Envia email + WhatsApp com link de avaliação para todos os colaboradores pendentes.</p>
              <button onClick={async () => {
                setSendingEmail(true); setResultEmail(null);
                const r = await dispararEmails(empresaId);
                setResultEmail(r); setSendingEmail(false);
                const s = await loadWhatsappStatus(empresaId);
                if (s.success) setStatus(s.data);
              }} disabled={sendingEmail}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 transition-colors disabled:opacity-40">
                {sendingEmail ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                {sendingEmail ? 'Enviando...' : 'Disparar Convites'}
              </button>
              {resultEmail && (
                <div className={`mt-3 flex items-start gap-2 px-3 py-2 rounded-lg text-xs ${
                  resultEmail.success ? 'bg-green-400/10 text-green-400' : 'bg-red-400/10 text-red-400'
                }`}>
                  {resultEmail.success ? <CheckCircle size={14} className="shrink-0 mt-0.5" /> : <AlertCircle size={14} className="shrink-0 mt-0.5" />}
                  <span>{resultEmail.message || resultEmail.error}</span>
                </div>
              )}
            </div>
          </div>

          {/* Avaliacao Links */}
          <div className="rounded-xl border border-white/[0.06] overflow-hidden" style={{ background: '#0F2A4A' }}>
            <div className="px-5 py-3 border-b border-white/[0.06] flex items-center gap-2">
              <Link2 size={16} className="text-cyan-400" />
              <span className="text-sm font-bold text-white">Enviar Links Avaliação</span>
            </div>
            <div className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-cyan-400/10 flex items-center justify-center">
                  <span className="text-lg font-bold text-cyan-400">{status.pendingCIS}</span>
                </div>
                <div>
                  <p className="text-sm font-bold text-white">Envios Pendentes</p>
                  <p className="text-xs text-gray-500">Colaboradores aguardando link de avaliação</p>
                </div>
              </div>
              <button onClick={handleDispararCIS} disabled={sendingCIS || status.pendingCIS === 0}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-white bg-teal-600 hover:bg-teal-500 transition-colors disabled:opacity-40">
                {sendingCIS ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                {sendingCIS ? 'Enviando...' : 'Disparar Links Avaliação'}
              </button>
              {resultCIS && (
                <div className={`mt-3 flex items-start gap-2 px-3 py-2 rounded-lg text-xs ${
                  resultCIS.success ? 'bg-green-400/10 text-green-400' : 'bg-red-400/10 text-red-400'
                }`}>
                  {resultCIS.success ? <CheckCircle size={14} className="shrink-0 mt-0.5" /> : <AlertCircle size={14} className="shrink-0 mt-0.5" />}
                  <span>{resultCIS.message || resultCIS.error}</span>
                </div>
              )}
            </div>
          </div>

          {/* Relatorios */}
          <div className="rounded-xl border border-white/[0.06] overflow-hidden" style={{ background: '#0F2A4A' }}>
            <div className="px-5 py-3 border-b border-white/[0.06] flex items-center gap-2">
              <FileBarChart size={16} className="text-cyan-400" />
              <span className="text-sm font-bold text-white">Enviar Relatorios</span>
            </div>
            <div className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-cyan-400/10 flex items-center justify-center">
                  <span className="text-lg font-bold text-cyan-400">{status.totalRelatorios}</span>
                </div>
                <div>
                  <p className="text-sm font-bold text-white">Relatorios Disponiveis</p>
                  <p className="text-xs text-gray-500">Relatorios individuais para envio</p>
                </div>
              </div>
              <button onClick={handleDispararRelatorios} disabled={sendingRel || status.totalRelatorios === 0}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-white bg-teal-600 hover:bg-teal-500 transition-colors disabled:opacity-40">
                {sendingRel ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                {sendingRel ? 'Enviando...' : 'Disparar Relatorios'}
              </button>
              {resultRel && (
                <div className={`mt-3 flex items-start gap-2 px-3 py-2 rounded-lg text-xs ${
                  resultRel.success ? 'bg-green-400/10 text-green-400' : 'bg-red-400/10 text-red-400'
                }`}>
                  {resultRel.success ? <CheckCircle size={14} className="shrink-0 mt-0.5" /> : <AlertCircle size={14} className="shrink-0 mt-0.5" />}
                  <span>{resultRel.message || resultRel.error}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
