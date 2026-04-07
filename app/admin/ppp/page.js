'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, FileText, Link2, ChevronDown, Sparkles } from 'lucide-react';
import { loadEmpresas, loadPPPs } from './actions';
import { extrairPPP } from '@/actions/ppp';

export default function PPPPage() {
  const router = useRouter();
  const [empresas, setEmpresas] = useState([]);
  const [empresaId, setEmpresaId] = useState('');
  const [urls, setUrls] = useState('');
  const [textos, setTextos] = useState('');
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [result, setResult] = useState(null);
  const [ppps, setPpps] = useState([]);
  const [loadingPpps, setLoadingPpps] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    loadEmpresas().then(r => {
      if (r.success) setEmpresas(r.data || []);
      setLoading(false);
    });
  }, []);

  function flash(msg) { setToast(msg); setTimeout(() => setToast(null), 3000); }

  async function handleSelectEmpresa(id) {
    setEmpresaId(id);
    setResult(null);
    if (!id) { setPpps([]); return; }
    setLoadingPpps(true);
    const r = await loadPPPs(id);
    if (r.success) setPpps(r.data || []);
    setLoadingPpps(false);
  }

  async function handleExtrair() {
    if (!empresaId) return;
    const urlList = urls.split('\n').map(u => u.trim()).filter(Boolean);
    const textoList = textos.trim() ? [textos.trim()] : [];
    if (!urlList.length && !textoList.length) {
      flash('Informe pelo menos uma URL ou texto.');
      return;
    }
    setExtracting(true);
    setResult(null);
    const r = await extrairPPP(empresaId, { urls: urlList, textos: textoList });
    setExtracting(false);
    if (r.success) {
      setResult(r.data);
      flash(r.message);
      handleSelectEmpresa(empresaId); // refresh list
    } else {
      flash('Erro: ' + r.error);
    }
  }

  if (loading) return <div className="flex items-center justify-center h-dvh"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-6 sm:px-6" style={{ minHeight: '100dvh' }}>
      {toast && (
        <div className="fixed top-4 right-4 z-50 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold shadow-lg">{toast}</div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push('/admin/dashboard')} className="w-9 h-9 flex items-center justify-center rounded-lg border border-white/10 text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2"><FileText size={20} className="text-cyan-400" /> Extracao PPP</h1>
          <p className="text-xs text-gray-500">Extrair competencias de documentos PPP via IA</p>
        </div>
      </div>

      {/* Empresa selector */}
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

      {empresaId && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {/* URL input */}
          <div className="rounded-xl border border-white/[0.06] p-5" style={{ background: '#0F2A4A' }}>
            <label className="flex items-center gap-2 text-sm font-bold text-white mb-3">
              <Link2 size={16} className="text-cyan-400" /> URLs (uma por linha)
            </label>
            <textarea value={urls} onChange={e => setUrls(e.target.value)}
              rows={5} placeholder="https://escola.edu.br/ppp&#10;https://outro-documento.pdf"
              className="w-full rounded-lg border border-white/10 bg-[#091D35] text-white text-sm px-3 py-2 focus:outline-none focus:border-cyan-400/50 resize-none font-mono" />
          </div>

          {/* Text input */}
          <div className="rounded-xl border border-white/[0.06] p-5" style={{ background: '#0F2A4A' }}>
            <label className="flex items-center gap-2 text-sm font-bold text-white mb-3">
              <FileText size={16} className="text-cyan-400" /> Texto (cole o conteudo)
            </label>
            <textarea value={textos} onChange={e => setTextos(e.target.value)}
              rows={5} placeholder="Cole aqui o conteudo do PPP ou documento institucional..."
              className="w-full rounded-lg border border-white/10 bg-[#091D35] text-white text-sm px-3 py-2 focus:outline-none focus:border-cyan-400/50 resize-none" />
          </div>
        </div>
      )}

      {empresaId && (
        <div className="mb-6">
          <button onClick={handleExtrair} disabled={extracting}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold text-white bg-teal-600 hover:bg-teal-500 transition-colors disabled:opacity-50">
            {extracting ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {extracting ? 'Extraindo...' : 'Extrair Competencias'}
          </button>
        </div>
      )}

      {/* Results */}
      {result && result.competencias && (
        <div className="rounded-xl border border-white/[0.06] overflow-hidden mb-6" style={{ background: '#0F2A4A' }}>
          <div className="px-5 py-3 border-b border-white/[0.06]">
            <span className="text-sm font-bold text-white">Resultado da Extracao ({result.competencias.length} competencias)</span>
          </div>
          <div className="divide-y divide-white/[0.03]">
            {result.competencias.map((c, i) => (
              <div key={i} className="px-5 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-bold text-white">{c.nome}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    c.relevancia === 'alta' ? 'bg-green-400/20 text-green-400'
                    : c.relevancia === 'media' ? 'bg-amber-400/20 text-amber-400'
                    : 'bg-gray-400/20 text-gray-400'
                  }`}>{c.relevancia}</span>
                </div>
                <p className="text-xs text-gray-400">{c.descricao}</p>
                {c.evidencia && <p className="text-xs text-gray-600 mt-1 italic">"{c.evidencia}"</p>}
              </div>
            ))}
          </div>
          {result.valores_institucionais?.length > 0 && (
            <div className="px-5 py-3 border-t border-white/[0.06]">
              <p className="text-xs font-bold text-gray-400 mb-1">Valores Institucionais:</p>
              <div className="flex flex-wrap gap-1.5">
                {result.valores_institucionais.map((v, i) => (
                  <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-cyan-400/10 text-cyan-400">{v}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Previously extracted */}
      {loadingPpps && <div className="flex items-center justify-center py-8"><Loader2 size={24} className="animate-spin text-cyan-400" /></div>}

      {!loadingPpps && ppps.length > 0 && (
        <div className="rounded-xl border border-white/[0.06] overflow-hidden" style={{ background: '#0F2A4A' }}>
          <div className="px-5 py-3 border-b border-white/[0.06]">
            <span className="text-sm font-bold text-white">Competencias PPP Extraidas ({ppps.length})</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="px-4 py-2 text-left text-xs font-bold text-gray-400">Nome</th>
                  <th className="px-4 py-2 text-left text-xs font-bold text-gray-400">Relevancia</th>
                  <th className="px-4 py-2 text-left text-xs font-bold text-gray-400">Descricao</th>
                  <th className="px-4 py-2 text-left text-xs font-bold text-gray-400">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {ppps.map(p => (
                  <tr key={p.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-2 text-white font-semibold">{p.nome}</td>
                    <td className="px-4 py-2">
                      <span className={`text-xs font-bold ${
                        p.relevancia === 'alta' ? 'text-green-400' : p.relevancia === 'media' ? 'text-amber-400' : 'text-gray-400'
                      }`}>{p.relevancia || '-'}</span>
                    </td>
                    <td className="px-4 py-2 text-gray-500 max-w-[250px] truncate">{p.descricao || '-'}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs">{p.created_at ? new Date(p.created_at).toLocaleDateString('pt-BR') : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loadingPpps && empresaId && ppps.length === 0 && !result && (
        <div className="text-center py-8">
          <FileText size={32} className="text-gray-600 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Nenhuma extracao PPP realizada para esta empresa</p>
        </div>
      )}
    </div>
  );
}
