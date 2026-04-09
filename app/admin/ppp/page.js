'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Loader2, FileText, Link2, Plus, Sparkles, Upload, Eye, Trash2, RefreshCw } from 'lucide-react';
import { loadEmpresa, loadPPPs, excluirPPP } from './actions';
import { extrairPPP } from '@/actions/ppp';
async function extractPdfText(file) {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map(item => item.str).join(' '));
  }
  return { text: pages.join('\n\n'), numPages: pdf.numPages };
}

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
  const [files, setFiles] = useState([]); // { name, size, content }
  const [extracting, setExtracting] = useState(false);
  const [result, setResult] = useState(null);
  const [toast, setToast] = useState(null);
  const [model, setModel] = useState('claude-sonnet-4-6');
  const [viewPPP, setViewPPP] = useState(null);
  const [enriquecerWeb, setEnriquecerWeb] = useState(false);

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
    // Adicionar conteúdo dos arquivos carregados
    files.forEach(f => { if (f.content) textoList.push(`[Arquivo: ${f.name}]\n${f.content}`); });
    if (!urlList.length && !textoList.length) { flash('Informe pelo menos uma URL, texto ou arquivo.'); return; }

    setExtracting(true);
    setResult(null);
    const r = await extrairPPP(empresaIdParam, { urls: urlList, textos: textoList, model, enriquecerWeb });
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
                <label className="flex flex-col items-center justify-center py-6 rounded-xl border-2 border-dashed border-white/10 hover:border-cyan-400/30 transition-colors cursor-pointer"
                  style={{ background: 'rgba(0,0,0,0.1)' }}>
                  <Upload size={24} className="text-gray-500 mb-2" />
                  <p className="text-sm font-semibold text-gray-400">Clique para enviar arquivos</p>
                  <p className="text-[10px] text-gray-600 mt-1">PDF, TXT, DOC, DOCX, PPT, PPTX — múltiplos arquivos</p>
                  <input type="file" multiple accept=".pdf,.txt,.doc,.docx,.ppt,.pptx" className="hidden"
                    onChange={async e => {
                      const selected = Array.from(e.target.files || []);
                      for (const file of selected) {
                        try {
                          let text, info;
                          if (file.name.toLowerCase().endsWith('.pdf')) {
                            const result = await extractPdfText(file);
                            text = result.text;
                            info = `✓ ${result.numPages} pág.`;
                          } else {
                            text = await file.text();
                            info = '✓ lido';
                          }
                          if (!text || text.trim().length < 10) throw new Error('Conteúdo vazio');
                          setFiles(prev => [...prev, {
                            name: file.name, size: file.size,
                            content: text.slice(0, 30000), pages: info,
                          }]);
                        } catch (err) {
                          setFiles(prev => [...prev, {
                            name: file.name, size: file.size,
                            content: `[Erro ao ler ${file.name}: ${err.message}]`, error: true,
                          }]);
                        }
                      }
                      e.target.value = '';
                    }} />
                </label>

                {/* Lista de arquivos carregados */}
                {files.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {files.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: '#091D35' }}>
                        <FileText size={12} className={f.error ? 'text-red-400 shrink-0' : 'text-cyan-400 shrink-0'} />
                        <span className="text-xs text-white flex-1 truncate">{f.name}</span>
                        {f.pages && <span className="text-[9px] text-green-400 font-semibold">{f.pages}</span>}
                        {f.error && <span className="text-[9px] text-red-400 font-semibold">Erro</span>}
                        <span className="text-[10px] text-gray-600">{(f.size / 1024).toFixed(0)} KB</span>
                        <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                          className="text-gray-600 hover:text-red-400 transition-colors">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
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
              <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro</option>
              <option value="gpt-5.4">GPT 5.4</option>
              <option value="gpt-5.4-mini">GPT 5.4 Mini</option>
            </select>
          </div>

          {/* Enriquecimento web (corporativo) */}
          <label className="flex items-center gap-2 mt-3 cursor-pointer select-none">
            <input type="checkbox" checked={enriquecerWeb} onChange={e => setEnriquecerWeb(e.target.checked)}
              className="w-4 h-4 rounded border border-white/20 bg-[#091D35] accent-cyan-400" />
            <span className="text-xs text-gray-300">Enriquecer via web</span>
            <span className="text-[9px] text-gray-600">(busca dados públicos para preencher lacunas — apenas corporativo)</span>
          </label>

          {/* Extrair button */}
          <button onClick={handleExtrair} disabled={extracting}
            className="mt-4 w-full py-3.5 rounded-xl font-bold text-[#0C1829] text-sm tracking-wider flex items-center justify-center gap-2 disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #2DD4BF, #14B8A6)' }}>
            {extracting ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {extracting ? 'Extraindo...' : 'Extrair via IA'}
          </button>
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
                  <p className="text-sm font-bold text-white truncate">{p.escola || 'PPP'}</p>
                  <p className="text-[10px] text-gray-500">
                    {p.fonte || 'Extração'} — {p.created_at ? new Date(p.created_at).toLocaleDateString('pt-BR') : '—'}
                    {Array.isArray(p.valores) && p.valores.length ? ` — ${p.valores.length} valores` : ''}
                  </p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                  p.status === 'extraido' ? 'bg-green-400/10 text-green-400' : p.status === 'erro' ? 'bg-red-400/10 text-red-400' : 'bg-gray-400/10 text-gray-400'
                }`}>{p.status === 'extraido' ? 'Extraído' : p.status === 'erro' ? 'Erro' : 'Pendente'}</span>
                <button onClick={() => setViewPPP(p)} className="text-gray-600 hover:text-white transition-colors shrink-0"><Eye size={14} /></button>
                <button onClick={() => handleExcluir(p.id, p.escola)} className="text-gray-600 hover:text-red-400 transition-colors shrink-0"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal visualização — 10 seções */}
      {viewPPP && (() => {
        let ext = null;
        try { ext = typeof viewPPP.extracao === 'string' ? JSON.parse(viewPPP.extracao) : viewPPP.extracao; } catch {}
        const confiancaColors = { alta: 'bg-green-400/15 text-green-400', media: 'bg-amber-400/15 text-amber-400', baixa: 'bg-red-400/15 text-red-400' };
        const origemLabels = { documento_interno: 'Doc. interno', site_institucional: 'Site', release_noticia: 'Notícia', nao_identificado: 'N/A' };
        const ConfBadge = ({ confianca, origem }) => (confianca || origem) ? (
          <div className="flex items-center gap-1.5 mt-1">
            {confianca && <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${confiancaColors[confianca] || 'bg-gray-400/15 text-gray-400'}`}>{confianca}</span>}
            {origem && <span className="text-[8px] text-gray-600">{origemLabels[origem] || origem}</span>}
          </div>
        ) : null;
        const Section = ({ num, title, color, confianca, origem, children }) => (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color }}>{num}. {title}</p>
              {confianca && <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${confiancaColors[confianca] || ''}`}>{confianca}</span>}
              {origem && origem !== 'nao_identificado' && <span className="text-[8px] text-gray-600">{origemLabels[origem] || origem}</span>}
            </div>
            <div className="text-xs text-gray-300 leading-relaxed">{children}</div>
          </div>
        );
        const List = ({ items }) => items?.length ? <ul className="space-y-0.5">{items.map((it, i) => <li key={i} className="text-xs text-gray-400">• {typeof it === 'string' ? it : (it?.nome || it?.termo || (typeof it === 'object' ? JSON.stringify(it) : String(it)))}</li>)}</ul> : <p className="text-xs text-gray-500 italic">Não declarado</p>;
        // Helper: extrair conteúdo de seção (compatível com formato novo {conteudo,origem,confianca} e antigo)
        const getSecao = (sec) => {
          if (!sec) return { c: null, origem: null, confianca: null };
          if (typeof sec === 'string') return { c: sec, origem: null, confianca: null };
          if (sec.conteudo !== undefined) return { c: sec.conteudo, origem: sec.origem, confianca: sec.confianca };
          return { c: sec, origem: null, confianca: null };
        };
        const safeEntries = (obj) => {
          if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return [];
          return Object.entries(obj);
        };

        return (
          <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-10 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.7)' }}>
            <div className="w-full max-w-[750px] rounded-2xl border border-white/[0.08] p-6 mb-10" style={{ background: '#0A1D35' }}>
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold text-white">{viewPPP.escola || 'PPP'}</h3>
                <button onClick={() => setViewPPP(null)} className="text-gray-500 hover:text-white text-lg">✕</button>
              </div>

              {ext ? (
                <div className="space-y-1">
                  {/* Detecta formato: corporativo (perfil_organizacional) vs educacional (perfil_instituicao) */}
                  {ext.perfil_organizacional ? (
                    <>
                      {/* ── CORPORATIVO: Dossiê de Contexto Operacional ── */}
                      {(() => {
                        const s1 = getSecao(ext.perfil_organizacional);
                        return (
                          <Section num="1" title="Perfil Organizacional" color="#00B4D8" confianca={s1.confianca} origem={s1.origem}>
                            {s1.c && typeof s1.c === 'object' ? (
                              <div className="space-y-0.5">
                                {safeEntries(s1.c).map(([k, v]) => <p key={k}><span className="text-gray-500 font-semibold">{k.replace(/_/g, ' ')}:</span> {typeof v === 'object' ? JSON.stringify(v) : String(v || '')}</p>)}
                              </div>
                            ) : s1.c ? <p>{String(s1.c)}</p> : <p className="text-gray-500 italic">Não identificado</p>}
                          </Section>
                        );
                      })()}

                      {(() => {
                        const s2 = getSecao(ext.mercado_stakeholders);
                        return (
                          <Section num="2" title="Mercado e Stakeholders" color="#22C55E" confianca={s2.confianca} origem={s2.origem}>
                            {s2.c && typeof s2.c === 'object' ? (
                              <>
                                {s2.c.clientes && <p><span className="text-gray-500 font-semibold">Clientes:</span> {String(s2.c.clientes)}</p>}
                                {s2.c.concorrencia && <p><span className="text-gray-500 font-semibold">Concorrência:</span> {String(s2.c.concorrencia)}</p>}
                                <List items={s2.c.stakeholders_chave} />
                              </>
                            ) : s2.c ? <p>{String(s2.c)}</p> : <p className="text-gray-500 italic">Não identificado</p>}
                          </Section>
                        );
                      })()}

                      {(() => {
                        const s3 = getSecao(ext.identidade_cultura);
                        return (
                          <Section num="3" title="Identidade e Cultura" color="#A78BFA" confianca={s3.confianca} origem={s3.origem}>
                            {s3.c && typeof s3.c === 'object' ? (
                              <>
                                {s3.c.missao && <p><span className="text-gray-500 font-semibold">Missão:</span> {String(s3.c.missao)}</p>}
                                {s3.c.visao && <p><span className="text-gray-500 font-semibold">Visão:</span> {String(s3.c.visao)}</p>}
                                <List items={Array.isArray(s3.c.valores) ? s3.c.valores : []} />
                                {s3.c.modelo_gestao && <p className="mt-1"><span className="text-gray-500 font-semibold">Modelo de gestão:</span> {String(s3.c.modelo_gestao)}</p>}
                                {s3.c.cultura_declarada && <p><span className="text-gray-500 font-semibold">Cultura:</span> {String(s3.c.cultura_declarada)}</p>}
                              </>
                            ) : s3.c ? <p>{String(s3.c)}</p> : <p className="text-gray-500 italic">Não identificado</p>}
                          </Section>
                        );
                      })()}

                      {(() => {
                        const s4 = getSecao(ext.operacao_processos);
                        const items = Array.isArray(s4.c) ? s4.c : [];
                        return (
                          <Section num="4" title="Operação e Processos" color="#F59E0B" confianca={s4.confianca} origem={s4.origem}>
                            {items.length ? (
                              <div className="space-y-1">
                                {items.map((p, i) => (
                                  <div key={i} className="flex items-start gap-2">
                                    <span className="text-cyan-400 font-bold shrink-0">•</span>
                                    <span><strong>{p.area}</strong> — {p.funcao} {p.processos_chave && <span className="text-gray-500">({p.processos_chave})</span>}</span>
                                  </div>
                                ))}
                              </div>
                            ) : <p className="text-gray-500 italic">Não identificado</p>}
                          </Section>
                        );
                      })()}

                      {(() => {
                        const s5 = getSecao(ext.modelo_pessoas);
                        return (
                          <Section num="5" title="Modelo de Pessoas" color="#EC4899" confianca={s5.confianca} origem={s5.origem}>
                            {s5.c && typeof s5.c === 'object' ? (
                              <>
                                {s5.c.desenvolvimento && <p><span className="text-gray-500 font-semibold">Desenvolvimento:</span> {String(s5.c.desenvolvimento)}</p>}
                                {s5.c.avaliacao && <p><span className="text-gray-500 font-semibold">Avaliação:</span> {String(s5.c.avaliacao)}</p>}
                                {s5.c.carreira && <p><span className="text-gray-500 font-semibold">Carreira:</span> {String(s5.c.carreira)}</p>}
                                {s5.c.diversidade_inclusao && <p><span className="text-gray-500 font-semibold">D&I:</span> {String(s5.c.diversidade_inclusao)}</p>}
                              </>
                            ) : s5.c ? <p>{String(s5.c)}</p> : <p className="text-gray-500 italic">Não identificado</p>}
                          </Section>
                        );
                      })()}

                      {(() => {
                        const s6 = getSecao(ext.governanca_decisao);
                        return (
                          <Section num="6" title="Governança e Decisão" color="#06B6D4" confianca={s6.confianca} origem={s6.origem}>
                            {s6.c && typeof s6.c === 'object' ? (
                              <>
                                {s6.c.estrutura && <p><span className="text-gray-500 font-semibold">Estrutura:</span> {String(s6.c.estrutura)}</p>}
                                {s6.c.tomada_decisao && <p><span className="text-gray-500 font-semibold">Tomada de decisão:</span> {String(s6.c.tomada_decisao)}</p>}
                                {s6.c.compliance && <p><span className="text-gray-500 font-semibold">Compliance:</span> {String(s6.c.compliance)}</p>}
                              </>
                            ) : s6.c ? <p>{String(s6.c)}</p> : <p className="text-gray-500 italic">Não identificado</p>}
                          </Section>
                        );
                      })()}

                      {(() => {
                        const s7 = getSecao(ext.tecnologia_recursos);
                        return (
                          <Section num="7" title="Tecnologia e Recursos" color="#8B5CF6" confianca={s7.confianca} origem={s7.origem}>
                            {s7.c && typeof s7.c === 'object' ? (
                              <>
                                <p className="text-gray-500 font-semibold">Ferramentas:</p><List items={Array.isArray(s7.c.ferramentas) ? s7.c.ferramentas : []} />
                                <p className="text-gray-500 font-semibold mt-1">Capacidades:</p><List items={Array.isArray(s7.c.capacidades) ? s7.c.capacidades : []} />
                                <p className="text-gray-500 font-semibold mt-1">Limitações:</p><List items={Array.isArray(s7.c.limitacoes) ? s7.c.limitacoes : []} />
                              </>
                            ) : s7.c ? <p>{String(s7.c)}</p> : <p className="text-gray-500 italic">Não identificado</p>}
                          </Section>
                        );
                      })()}

                      {(() => {
                        const s8 = getSecao(ext.desafios_estrategia);
                        return (
                          <Section num="8" title="Desafios e Estratégia" color="#EF4444" confianca={s8.confianca} origem={s8.origem}>
                            {s8.c && typeof s8.c === 'object' ? (
                              <>
                                <p className="text-gray-500 font-semibold">Desafios:</p><List items={Array.isArray(s8.c.desafios) ? s8.c.desafios : []} />
                                <p className="text-gray-500 font-semibold mt-1">Metas:</p><List items={Array.isArray(s8.c.metas) ? s8.c.metas : []} />
                                {s8.c.transformacoes && <p className="mt-1"><span className="text-gray-500 font-semibold">Transformações:</span> {String(s8.c.transformacoes)}</p>}
                              </>
                            ) : s8.c ? <p>{String(s8.c)}</p> : <p className="text-gray-500 italic">Não identificado</p>}
                          </Section>
                        );
                      })()}

                      {(() => {
                        const s9 = getSecao(ext.vocabulario_corporativo || ext.vocabulario);
                        const items = Array.isArray(s9.c) ? s9.c : (Array.isArray(ext.vocabulario_corporativo) ? ext.vocabulario_corporativo : ext.vocabulario || []);
                        return (
                          <Section num="9" title="Vocabulário Corporativo" color="#F97316" confianca={s9.confianca} origem={s9.origem}>
                            {items?.length ? (
                              <div className="space-y-1">
                                {items.map((v, i) => (
                                  <p key={i}><strong className="text-white">{v.termo}</strong> — {v.significado}</p>
                                ))}
                              </div>
                            ) : <p className="text-gray-500 italic">Não identificado</p>}
                          </Section>
                        );
                      })()}
                    </>
                  ) : (
                    <>
                      {/* ── EDUCACIONAL: PPP clássico ── */}
                      <Section num="1" title="Perfil da Instituição" color="#00B4D8">
                        {ext.perfil_instituicao ? (
                          <div className="space-y-0.5">
                            {Object.entries(ext.perfil_instituicao).map(([k, v]) => <p key={k}><span className="text-gray-500 font-semibold">{k}:</span> {typeof v === 'object' ? JSON.stringify(v) : String(v)}</p>)}
                          </div>
                        ) : <p className="text-gray-500 italic">Não declarado</p>}
                      </Section>

                      <Section num="2" title="Comunidade e Contexto" color="#22C55E">
                        <p>{ext.comunidade_contexto || 'Não declarado'}</p>
                      </Section>

                      <Section num="3" title="Identidade" color="#A78BFA">
                        {ext.identidade ? (
                          <>
                            <p><span className="text-gray-500 font-semibold">Missão:</span> {ext.identidade.missao}</p>
                            <p><span className="text-gray-500 font-semibold">Visão:</span> {ext.identidade.visao}</p>
                            <p className="mt-1"><span className="text-gray-500 font-semibold">Princípios:</span></p>
                            <List items={ext.identidade.principios} />
                            {ext.identidade.concepcao && <p className="mt-1">{ext.identidade.concepcao}</p>}
                          </>
                        ) : <p className="text-gray-500 italic">Não declarado</p>}
                      </Section>

                      <Section num="4" title="Práticas Descritas" color="#F59E0B">
                        {ext.praticas_descritas?.length ? (
                          <div className="space-y-1">
                            {ext.praticas_descritas.map((p, i) => (
                              <div key={i} className="flex items-start gap-2">
                                <span className="text-cyan-400 font-bold shrink-0">•</span>
                                <span><strong>{p.nome}</strong> — {p.descricao} <span className="text-gray-500">({p.frequencia})</span></span>
                              </div>
                            ))}
                          </div>
                        ) : <p className="text-gray-500 italic">Não declarado</p>}
                      </Section>

                      <Section num="5" title="Inclusão e Diversidade" color="#EC4899">
                        <p>{ext.inclusao_diversidade || 'Não declarado'}</p>
                      </Section>

                      <Section num="6" title="Gestão e Participação" color="#06B6D4">
                        <p>{ext.gestao_participacao || 'Não declarado'}</p>
                      </Section>

                      <Section num="7" title="Infraestrutura e Recursos" color="#8B5CF6">
                        {ext.infraestrutura_recursos ? (
                          <>
                            <p className="text-gray-500 font-semibold">Espaços:</p><List items={ext.infraestrutura_recursos.espacos} />
                            <p className="text-gray-500 font-semibold mt-1">Tecnologia:</p><List items={ext.infraestrutura_recursos.tecnologia} />
                            <p className="text-gray-500 font-semibold mt-1">Limitações:</p><List items={ext.infraestrutura_recursos.limitacoes} />
                          </>
                        ) : <p className="text-gray-500 italic">Não declarado</p>}
                      </Section>

                      <Section num="8" title="Desafios e Metas" color="#EF4444">
                        {ext.desafios_metas ? (
                          <>
                            <p className="text-gray-500 font-semibold">Desafios:</p><List items={ext.desafios_metas.desafios} />
                            <p className="text-gray-500 font-semibold mt-1">Metas:</p><List items={ext.desafios_metas.metas} />
                          </>
                        ) : <p className="text-gray-500 italic">Não declarado</p>}
                      </Section>

                      <Section num="9" title="Vocabulário" color="#F97316">
                        {ext.vocabulario?.length ? (
                          <div className="space-y-1">
                            {ext.vocabulario.map((v, i) => (
                              <p key={i}><strong className="text-white">{v.termo}</strong> — {v.significado}</p>
                            ))}
                          </div>
                        ) : <p className="text-gray-500 italic">Não declarado</p>}
                      </Section>
                    </>
                  )}

                  {/* Seção 10 compartilhada: Competências Priorizadas */}
                  <Section num="10" title="Competências Priorizadas" color="#10B981">
                    {(ext.competencias_priorizadas || ext.competencias)?.length ? (
                      <div className="space-y-2">
                        {(ext.competencias_priorizadas || ext.competencias).map((c, i) => (
                          <div key={i} className="p-2 rounded-lg border border-white/[0.04]" style={{ background: '#0F2A4A' }}>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-white">{c.nome}</span>
                              {c.relevancia && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${c.relevancia === 'alta' ? 'bg-green-400/20 text-green-400' : c.relevancia === 'media' ? 'bg-amber-400/20 text-amber-400' : 'bg-gray-400/20 text-gray-400'}`}>{c.relevancia}</span>}
                            </div>
                            {c.justificativa && <p className="text-[10px] text-gray-500 mt-0.5">{c.justificativa}</p>}
                          </div>
                        ))}
                      </div>
                    ) : <p className="text-gray-500 italic">Não declarado</p>}
                  </Section>

                  {/* Valores */}
                  {(() => {
                    const vals = ext.valores_institucionais || ext.identidade_cultura?.conteudo?.valores || ext.identidade_cultura?.valores || viewPPP.valores;
                    return Array.isArray(vals) && vals.length > 0 ? (
                      <div className="pt-3 border-t border-white/[0.06]">
                        <p className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest mb-2">Valores</p>
                        <div className="flex flex-wrap gap-1.5">
                          {vals.map((v, i) => (
                            <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-cyan-400/10 text-cyan-400">{typeof v === 'string' ? v : JSON.stringify(v)}</span>
                          ))}
                        </div>
                      </div>
                    ) : null;
                  })()}

                  {/* Metadata — lacunas, hipóteses, recomendações */}
                  {ext._metadata && (
                    <div className="pt-3 mt-2 border-t border-white/[0.06] space-y-3">
                      {ext._metadata.lacunas?.length > 0 && (
                        <div>
                          <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest mb-1">Lacunas</p>
                          <ul className="space-y-0.5">{ext._metadata.lacunas.map((l, i) => <li key={i} className="text-[10px] text-gray-400">• {l}</li>)}</ul>
                        </div>
                      )}
                      {ext._metadata.hipoteses_controladas?.length > 0 && (
                        <div>
                          <p className="text-[10px] font-bold text-purple-400 uppercase tracking-widest mb-1">Hipóteses Controladas</p>
                          <ul className="space-y-0.5">{ext._metadata.hipoteses_controladas.map((h, i) => <li key={i} className="text-[10px] text-gray-400">⚠ {h}</li>)}</ul>
                        </div>
                      )}
                      {ext._metadata.recomendacao_validacao?.length > 0 && (
                        <div>
                          <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest mb-1">Validar com RH/Gestor</p>
                          <ul className="space-y-0.5">{ext._metadata.recomendacao_validacao.map((r, i) => <li key={i} className="text-[10px] text-gray-400">→ {r}</li>)}</ul>
                        </div>
                      )}
                      {ext._metadata.secoes_enriquecidas_web?.length > 0 && (
                        <div>
                          <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1">Enriquecidas via Web</p>
                          <p className="text-[10px] text-gray-500">{ext._metadata.secoes_enriquecidas_web.join(', ')}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-500 text-center py-4">Dados da extração não disponíveis</p>
              )}

              <div className="flex items-center gap-4 text-[10px] text-gray-600 pt-3 mt-3 border-t border-white/[0.04]">
                <span>Fonte: {viewPPP.fonte}</span>
                {viewPPP.url_site && <span className="truncate max-w-[300px]">URL: {viewPPP.url_site}</span>}
                <span>Data: {viewPPP.created_at ? new Date(viewPPP.created_at).toLocaleDateString('pt-BR') : '—'}</span>
              </div>

              <button onClick={() => setViewPPP(null)}
                className="mt-4 w-full py-2.5 rounded-lg text-sm font-semibold text-gray-400 border border-white/10 hover:text-white transition-colors">
                Fechar
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
