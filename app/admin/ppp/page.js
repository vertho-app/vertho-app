'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Loader2, FileText, Link2, Plus, Sparkles, Upload, Eye, Trash2, RefreshCw } from 'lucide-react';
import { loadEmpresa, loadPPPs, excluirPPP } from './actions';
import { extrairPPP } from '@/actions/ppp';

export default function PPPPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const empresaIdParam = searchParams.get('empresa');

  const [empresa, setEmpresa] = useState(null);
  const [ppps, setPpps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [tab, setTab] = useState('arquivos'); // arquivos | json
  const [urls, setUrls] = useState(['']);
  const [textos, setTextos] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [result, setResult] = useState(null);
  const [toast, setToast] = useState(null);
  const [model, setModel] = useState('claude-sonnet-4-6');

  useEffect(() => {
    async function init() {
      if (!empresaIdParam) { setLoading(false); return; }
      const [emp, pppList] = await Promise.all([
        loadEmpresa(empresaIdParam),
        loadPPPs(empresaIdParam),
      ]);
      setEmpresa(emp);
      setPpps(pppList);
      setLoading(false);
    }
    init();
  }, [empresaIdParam]);

  function flash(msg) { setToast(msg); setTimeout(() => setToast(null), 3000); }

  async function refresh() {
    if (!empresaIdParam) return;
    const list = await loadPPPs(empresaIdParam);
    setPpps(list);
  }

  async function handleExtrair() {
    if (!empresaIdParam) return;
    const urlList = urls.filter(u => u.trim());
    const textoList = textos.trim() ? [textos.trim()] : [];
    if (!urlList.length && !textoList.length) { flash('Informe pelo menos uma URL ou texto.'); return; }

    setExtracting(true);
    setResult(null);
    const r = await extrairPPP(empresaIdParam, { urls: urlList, textos: textoList, model });
    setExtracting(false);
    if (r.success) {
      setResult(r.data || r);
      flash(r.message || 'Extração concluída');
      refresh();
    } else {
      flash('Erro: ' + r.error);
    }
  }

  async function handleExcluir(id, nome) {
    if (!confirm(`Excluir PPP "${nome || id}"?`)) return;
    const r = await excluirPPP(id);
    if (r.success) { flash('PPP excluído'); refresh(); }
    else flash('Erro: ' + r.error);
  }

  if (loading) return <div className="flex items-center justify-center h-dvh"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;

  if (!empresaIdParam || !empresa) {
    return (
      <div className="max-w-[1100px] mx-auto px-4 py-6 text-center">
        <p className="text-gray-400">Selecione uma empresa no pipeline para acessar a extração de PPPs.</p>
        <button onClick={() => router.push('/admin/dashboard')} className="mt-4 text-cyan-400 text-sm hover:underline">Voltar ao Dashboard</button>
      </div>
    );
  }

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-6 sm:px-6" style={{ minHeight: '100dvh' }}>
      {toast && <div className="fixed top-4 right-4 z-50 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold shadow-lg">{toast}</div>}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <img src="/logo-vertho.png" alt="Vertho" style={{ height: '26px' }} className="shrink-0" />
        <div className="text-center flex-1 px-4">
          <h1 className="text-lg font-bold text-white">Extração de PPPs</h1>
          <p className="text-xs text-gray-500">{empresa.nome}</p>
        </div>
        <button onClick={() => router.push(`/admin/empresas/${empresaIdParam}`)}
          className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-white transition-colors">
          <ArrowLeft size={16} /> Voltar
        </button>
      </div>

      {/* Nova Extração toggle */}
      <button onClick={() => setShowForm(!showForm)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-green-400 border border-green-400/30 hover:bg-green-400/10 transition-colors mb-4">
        <Plus size={14} /> Nova Extração
      </button>

      {/* Form */}
      {showForm && (
        <div className="rounded-xl border border-white/[0.06] p-5 mb-6" style={{ background: '#0F2A4A' }}>
          {/* Tabs */}
          <div className="grid grid-cols-2 gap-2 mb-5">
            <button onClick={() => setTab('arquivos')}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold border transition-colors ${
                tab === 'arquivos' ? 'border-cyan-400/30 text-cyan-400 bg-cyan-400/5' : 'border-white/[0.06] text-gray-500 hover:text-gray-300'
              }`}>
              <Upload size={14} /> Arquivos + Site
            </button>
            <button onClick={() => setTab('json')}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold border transition-colors ${
                tab === 'json' ? 'border-cyan-400/30 text-cyan-400 bg-cyan-400/5' : 'border-white/[0.06] text-gray-500 hover:text-gray-300'
              }`}>
              <FileText size={14} /> Importar Texto
            </button>
          </div>

          {tab === 'arquivos' && (
            <>
              {/* File upload area */}
              <div className="mb-4">
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Arquivos</p>
                <label className="flex flex-col items-center justify-center py-8 rounded-xl border-2 border-dashed border-white/10 hover:border-cyan-400/30 transition-colors cursor-pointer"
                  style={{ background: 'rgba(0,0,0,0.1)' }}>
                  <Upload size={24} className="text-gray-500 mb-2" />
                  <p className="text-sm font-semibold text-gray-400">Clique para enviar arquivos</p>
                  <p className="text-[10px] text-gray-600 mt-1">PDF, TXT, DOC, DOCX, PPT, PPTX — múltiplos arquivos</p>
                  <input type="file" multiple accept=".pdf,.txt,.doc,.docx,.ppt,.pptx" className="hidden"
                    onChange={e => {
                      // Arquivos seriam lidos e o texto extraído no servidor
                      // Por enquanto, feedback visual
                      const files = Array.from(e.target.files || []);
                      if (files.length) flash(`${files.length} arquivo(s) selecionado(s) — use URLs para extração via IA`);
                    }} />
                </label>
              </div>

              {/* URLs */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">URLs de Sites (opcional)</p>
                  <button onClick={() => setUrls(prev => [...prev, ''])}
                    className="text-[10px] font-bold text-green-400 hover:text-green-300">+ Adicionar URL</button>
                </div>
                <div className="space-y-2">
                  {urls.map((url, i) => (
                    <input key={i} value={url} onChange={e => setUrls(prev => prev.map((u, j) => j === i ? e.target.value : u))}
                      placeholder="https://www.empresa.com.br/sobre"
                      className="w-full px-3 py-2.5 rounded-lg text-sm text-white border border-white/10 outline-none focus:border-cyan-400/40 font-mono"
                      style={{ background: '#091D35' }} />
                  ))}
                </div>
                <p className="text-[10px] text-gray-600 mt-1">O conteúdo dos sites é combinado com os arquivos para a extração via IA</p>
              </div>
            </>
          )}

          {tab === 'json' && (
            <div>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Cole o conteúdo do documento</p>
              <textarea value={textos} onChange={e => setTextos(e.target.value)}
                rows={8} placeholder="Cole aqui o conteúdo do PPP, documento institucional, ou texto extraído..."
                className="w-full rounded-lg border border-white/10 text-sm text-white px-3 py-2 focus:outline-none focus:border-cyan-400/40 resize-none"
                style={{ background: '#091D35' }} />
            </div>
          )}

          {/* Model selector */}
          <div className="mt-4 mb-3">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Modelo de IA</p>
            <select value={model} onChange={e => setModel(e.target.value)}
              className="w-full max-w-xs px-3 py-2 rounded-lg text-xs text-white border border-white/10 outline-none"
              style={{ background: '#091D35' }}>
              <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>
              <option value="claude-opus-4-6">Claude Opus 4.6</option>
              <option value="gemini-3-flash-preview">Gemini 3 Flash</option>
            </select>
          </div>

          {/* Extrair button */}
          <button onClick={handleExtrair} disabled={extracting}
            className="mt-4 w-full py-3.5 rounded-xl font-bold text-[#0C1829] text-sm tracking-wider flex items-center justify-center gap-2 disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #2DD4BF, #14B8A6)' }}>
            {extracting ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {extracting ? 'Extraindo...' : 'Extrair via IA'}
          </button>
        </div>
      )}

      {/* Extraction results */}
      {result && result.competencias && (
        <div className="rounded-xl border border-white/[0.06] overflow-hidden mb-6" style={{ background: '#0F2A4A' }}>
          <div className="px-5 py-3 border-b border-white/[0.06]">
            <span className="text-sm font-bold text-white">Resultado ({result.competencias.length} competências extraídas)</span>
          </div>
          <div className="divide-y divide-white/[0.03]">
            {result.competencias.map((c, i) => (
              <div key={i} className="px-5 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-bold text-white">{c.nome}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    c.relevancia === 'alta' ? 'bg-green-400/20 text-green-400' : c.relevancia === 'media' ? 'bg-amber-400/20 text-amber-400' : 'bg-gray-400/20 text-gray-400'
                  }`}>{c.relevancia}</span>
                </div>
                <p className="text-xs text-gray-400">{c.descricao}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PPPs list */}
      <div className="rounded-xl border border-white/[0.06] overflow-hidden" style={{ background: '#0F2A4A' }}>
        <div className="px-5 py-3 border-b border-white/[0.06] flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-bold text-white">
            <FileText size={16} className="text-cyan-400" /> PPPs ({ppps.length})
          </span>
          <button onClick={refresh} className="text-gray-500 hover:text-white transition-colors">
            <RefreshCw size={14} />
          </button>
        </div>

        {ppps.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm text-gray-500">Nenhum PPP extraído para esta empresa</p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.03]">
            {ppps.map(p => (
              <div key={p.id} className="flex items-center gap-3 px-5 py-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-cyan-400/10 shrink-0">
                  <FileText size={14} className="text-cyan-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">{p.nome || p.escola || 'PPP'}</p>
                  <p className="text-[10px] text-gray-500">
                    {p.tipo || 'Extração'} — {p.created_at ? new Date(p.created_at).toLocaleDateString('pt-BR') : '—'}
                    {p.valores_institucionais?.length ? ` — ${p.valores_institucionais.length} valores` : ''}
                  </p>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-400/10 text-green-400 shrink-0">Extraído</span>
                <button className="text-gray-600 hover:text-white transition-colors shrink-0"><Eye size={14} /></button>
                <button onClick={() => handleExcluir(p.id, p.nome)} className="text-gray-600 hover:text-red-400 transition-colors shrink-0"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
