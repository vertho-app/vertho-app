'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase-browser';
import {
  ArrowLeft, Loader2, BookOpen, Plus, Search, Trash2, Pencil, X, Save, Upload,
} from 'lucide-react';
import {
  listarEmpresas, listarDocsKB, carregarDocKB,
  criarDocKB, atualizarDocKB, desativarDocKB, testarBuscaKB, uploadDocsArquivo, seedKB,
} from './actions';

const CATEGORIAS = [
  { id: 'regulamento', label: 'Regulamento' },
  { id: 'valores', label: 'Valores' },
  { id: 'cargos', label: 'Cargos' },
  { id: 'faq', label: 'FAQ' },
  { id: 'onboarding', label: 'Onboarding' },
  { id: 'outro', label: 'Outro' },
];

export default function KnowledgeBasePage() {
  const router = useRouter();
  const sb = getSupabase();
  const [user, setUser] = useState(null);
  const [empresas, setEmpresas] = useState([]);
  const [empresaId, setEmpresaId] = useState('');
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editor, setEditor] = useState(null); // { id?, titulo, conteudo, categoria, sourceUrl }
  const [saving, setSaving] = useState(false);
  const [busca, setBusca] = useState('');
  const [resultadosBusca, setResultadosBusca] = useState(null);
  const [uploadCategoria, setUploadCategoria] = useState('regulamento');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { router.replace('/login'); return; }
      setUser(user);
      const r = await listarEmpresas();
      if (r.error) { setError(r.error); setLoading(false); return; }
      setEmpresas(r.empresas);
      if (r.empresas[0]) setEmpresaId(r.empresas[0].id);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!user || !empresaId) return;
    carregar();
  }, [user, empresaId]);

  async function carregar() {
    setLoading(true);
    const r = await listarDocsKB(empresaId);
    if (r.error) setError(r.error);
    else setDocs(r.docs);
    setLoading(false);
  }

  async function abrirEditor(docId) {
    if (!docId) {
      setEditor({ titulo: '', conteudo: '', categoria: 'regulamento', sourceUrl: '' });
      return;
    }
    const r = await carregarDocKB(empresaId, docId);
    if (r.error) { setError(r.error); return; }
    setEditor({
      id: r.doc.id,
      titulo: r.doc.titulo,
      conteudo: r.doc.conteudo,
      categoria: r.doc.categoria || 'outro',
      sourceUrl: r.doc.source_url || '',
    });
  }

  async function salvar() {
    if (!editor.titulo.trim() || !editor.conteudo.trim()) {
      setError('Título e conteúdo são obrigatórios');
      return;
    }
    setSaving(true);
    setError('');
    const payload = {
      empresaId,
      titulo: editor.titulo,
      conteudo: editor.conteudo,
      categoria: editor.categoria,
      sourceUrl: editor.sourceUrl,
    };
    const r = editor.id
      ? await atualizarDocKB(editor.id, payload)
      : await criarDocKB(payload);
    setSaving(false);
    if (r.error) { setError(r.error); return; }
    setEditor(null);
    carregar();
  }

  async function desativar(docId) {
    if (!confirm('Desativar esse documento? Ele some das buscas (soft delete).')) return;
    const r = await desativarDocKB(empresaId, docId);
    if (r.error) { setError(r.error); return; }
    carregar();
  }

  async function testar() {
    if (!busca.trim()) { setResultadosBusca(null); return; }
    const r = await testarBuscaKB(empresaId, busca);
    if (r.error) { setError(r.error); return; }
    setResultadosBusca(r.resultados);
  }

  async function uploadArquivo(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.set('empresaId', empresaId);
      fd.set('categoria', uploadCategoria);
      fd.set('file', file);
      const r = await uploadDocsArquivo(fd);
      if (r.error) { setError(r.error); return; }
      carregar();
    } finally {
      setUploading(false);
    }
  }

  if (error && !docs.length && !empresas.length) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-red-400">{error}</p></div>;
  }

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-6 sm:px-6 min-h-screen">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push('/admin/dashboard')}
          className="w-9 h-9 flex items-center justify-center rounded-lg border border-white/10 text-gray-400 hover:text-white">
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <BookOpen size={20} className="text-cyan-400" /> Base de Conhecimento por Empresa
          </h1>
          <p className="text-xs text-gray-500">Documentos consultados pela IA (Tira-Dúvidas e futuros prompts) pra grounding.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={uploadCategoria} onChange={e => setUploadCategoria(e.target.value)}
            className="px-2 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white">
            {CATEGORIAS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <label className={`px-3 py-2 rounded-lg border text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
            uploading
              ? 'bg-purple-500/10 border-purple-400/30 text-purple-200/60'
              : 'bg-purple-500/20 border-purple-400/40 text-purple-300 hover:bg-purple-500/30'
          }`}>
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            Upload PDF/DOCX
            <input type="file" accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
              onChange={uploadArquivo} disabled={uploading} className="hidden" />
          </label>
          <button onClick={() => abrirEditor(null)}
            className="px-3 py-2 rounded-lg bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 hover:bg-cyan-500/30 text-xs font-bold flex items-center gap-1.5">
            <Plus size={14} /> Novo doc
          </button>
        </div>
      </div>

      <div className="flex gap-3 mb-6 flex-wrap items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="text-[10px] uppercase tracking-widest text-gray-500 mb-1 block">Empresa</label>
          <select value={empresaId} onChange={e => setEmpresaId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white">
            {empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
        </div>
      </div>

      <section className="mb-8 rounded-xl border border-purple-500/20 bg-purple-500/5 p-4">
        <p className="text-[10px] uppercase tracking-widest text-purple-300 mb-2 flex items-center gap-1.5">
          <Search size={11} /> Testar busca (preview do que a IA receberia)
        </p>
        <div className="flex gap-2">
          <input value={busca} onChange={e => setBusca(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && testar()}
            placeholder="ex: como funciona o banco de horas?"
            className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white" />
          <button onClick={testar}
            className="px-4 py-2 rounded-lg bg-purple-500/20 border border-purple-400/40 text-purple-300 hover:bg-purple-500/30 text-xs font-bold">
            Buscar
          </button>
        </div>
        {resultadosBusca && (
          <div className="mt-3 space-y-2">
            {resultadosBusca.length === 0 ? (
              <p className="text-xs text-gray-500">Nenhum resultado — IA responderia sem grounding.</p>
            ) : resultadosBusca.map(r => (
              <div key={r.id} className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-bold text-white">{r.titulo}</p>
                  <span className="text-[10px] text-purple-300">score {Number(r.score).toFixed(3)}</span>
                </div>
                <p className="text-[11px] text-gray-400 line-clamp-2">{r.conteudo}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 size={28} className="animate-spin text-cyan-400" /></div>
      ) : docs.length === 0 ? (
        <div className="text-center py-12 space-y-3">
          <p className="text-sm text-gray-500">Nenhum doc ainda.</p>
          <button onClick={async () => {
            setError('');
            const r = await seedKB(empresaId);
            if (r.error) { setError(r.error); return; }
            carregar();
          }}
            className="px-4 py-2 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 hover:bg-emerald-500/30 text-xs font-bold">
            Popular base inicial (template Vertho)
          </button>
          <p className="text-[11px] text-gray-600">Cria 6 docs base: como funciona temporada, evidências, tira-dúvidas, régua de níveis, modos de missão, política de privacidade.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map(d => (
            <div key={d.id} className="rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.04] p-4 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-bold text-white truncate">{d.titulo}</p>
                  {d.categoria && (
                    <span className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-400/30 text-cyan-300">
                      {d.categoria}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  Atualizado {new Date(d.atualizado_em).toLocaleDateString('pt-BR')}
                  {d.source_url && <> · <a href={d.source_url} target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">fonte</a></>}
                </p>
              </div>
              <button onClick={() => abrirEditor(d.id)}
                className="p-2 rounded-lg border border-white/10 text-gray-400 hover:text-cyan-300 hover:border-cyan-400/40">
                <Pencil size={14} />
              </button>
              <button onClick={() => desativar(d.id)}
                className="p-2 rounded-lg border border-white/10 text-gray-400 hover:text-red-300 hover:border-red-400/40">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <p className="mt-4 text-xs text-red-400">{error}</p>}

      {editor && (
        <Editor
          editor={editor}
          setEditor={setEditor}
          onClose={() => setEditor(null)}
          onSalvar={salvar}
          saving={saving}
        />
      )}
    </div>
  );
}

function Editor({ editor, setEditor, onClose, onSalvar, saving }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="max-w-3xl w-full bg-[#0a0e1a] border border-white/10 rounded-2xl my-8" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 flex items-center justify-between p-4 border-b border-white/10 bg-[#0a0e1a] rounded-t-2xl">
          <h2 className="text-sm font-bold text-white">{editor.id ? 'Editar doc' : 'Novo doc'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-[10px] uppercase tracking-widest text-gray-500 mb-1 block">Título *</label>
            <input value={editor.titulo} onChange={e => setEditor({ ...editor, titulo: e.target.value })}
              maxLength={200}
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest text-gray-500 mb-1 block">Categoria</label>
            <select value={editor.categoria} onChange={e => setEditor({ ...editor, categoria: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white">
              {CATEGORIAS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest text-gray-500 mb-1 block">Conteúdo *</label>
            <textarea value={editor.conteudo} onChange={e => setEditor({ ...editor, conteudo: e.target.value })}
              maxLength={20000}
              rows={12}
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white font-mono" />
            <p className="text-[10px] text-gray-500 mt-1">{editor.conteudo.length}/20000 chars</p>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest text-gray-500 mb-1 block">URL da fonte (opcional)</label>
            <input value={editor.sourceUrl} onChange={e => setEditor({ ...editor, sourceUrl: e.target.value })}
              placeholder="https://..."
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white" />
          </div>
        </div>
        <div className="sticky bottom-0 flex items-center justify-end gap-2 p-4 border-t border-white/10 bg-[#0a0e1a] rounded-b-2xl">
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg border border-white/10 text-gray-400 hover:text-white text-xs font-bold">
            Cancelar
          </button>
          <button onClick={onSalvar} disabled={saving}
            className="px-4 py-2 rounded-lg bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 hover:bg-cyan-500/30 text-xs font-bold flex items-center gap-1.5 disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
