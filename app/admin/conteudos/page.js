'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Download, Sparkles, Edit2, Trash2, Check, X, Filter, Video, FileText, Headphones, BookOpen, FileType, Wand2, Copy } from 'lucide-react';
import {
  importarVideosBunny, listarConteudos, atualizarConteudo,
  deletarConteudo, sugerirTagsIA, aplicarTagsIA, gerarConteudoIA,
} from '@/actions/conteudos';

const FORMAT_ICONS = {
  video: Video, audio: Headphones, texto: FileText, case: BookOpen, pdf: FileType,
};
const FORMAT_COLORS = {
  video: '#06B6D4', audio: '#A78BFA', texto: '#10B981', case: '#F59E0B', pdf: '#94A3B8',
};

export default function ConteudosAdminPage() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterFormato, setFilterFormato] = useState('');
  const [filterSemClass, setFilterSemClass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState([]);
  const [editing, setEditing] = useState(null); // conteudo em edição
  const [iaSugestao, setIaSugestao] = useState(null); // {conteudoId, tags}
  const [showGerar, setShowGerar] = useState(false);
  const [roteiroGerado, setRoteiroGerado] = useState(null);

  const addLog = (msg, type = 'info') => {
    setLogs(prev => [{ msg, type, ts: Date.now() }, ...prev].slice(0, 10));
  };

  const carregar = useCallback(async () => {
    setLoading(true);
    const r = await listarConteudos({
      formato: filterFormato || undefined,
      semClassificacao: filterSemClass || undefined,
    });
    setItems(r.items || []);
    setLoading(false);
  }, [filterFormato, filterSemClass]);

  useEffect(() => { carregar(); }, [carregar]);

  async function handleImportar() {
    setBusy(true);
    addLog('Importando vídeos do Bunny Stream...', 'info');
    const r = await importarVideosBunny();
    if (r.ok) {
      addLog(`✅ ${r.importados} novos / ${r.total} no total`, 'success');
      await carregar();
    } else {
      addLog(`❌ ${r.error}`, 'error');
    }
    setBusy(false);
  }

  async function handleSugerirIA(c) {
    setBusy(true);
    addLog(`Pedindo IA para classificar: ${c.titulo}`, 'info');
    const r = await sugerirTagsIA(c.id);
    if (r.ok) {
      setIaSugestao({ conteudoId: c.id, conteudo: c, tags: r.sugestao });
      addLog(`✅ IA sugeriu: ${r.sugestao.competencia} (confiança ${r.sugestao.confianca})`, 'success');
    } else {
      addLog(`❌ ${r.error}`, 'error');
    }
    setBusy(false);
  }

  async function handleAplicarSugestao() {
    if (!iaSugestao) return;
    const r = await aplicarTagsIA(iaSugestao.conteudoId, iaSugestao.tags);
    if (r.ok) {
      addLog(`✅ Tags aplicadas`, 'success');
      setIaSugestao(null);
      await carregar();
    } else {
      addLog(`❌ ${r.error}`, 'error');
    }
  }

  async function handleSalvarEdicao(patch) {
    const r = await atualizarConteudo(editing.id, patch);
    if (r.ok) {
      addLog(`✅ Atualizado`, 'success');
      setEditing(null);
      await carregar();
    } else {
      addLog(`❌ ${r.error}`, 'error');
    }
  }

  async function handleDeletar(c) {
    if (!confirm(`Deletar "${c.titulo}"?`)) return;
    const r = await deletarConteudo(c.id);
    if (r.ok) {
      addLog(`✅ Deletado`, 'success');
      await carregar();
    } else {
      addLog(`❌ ${r.error}`, 'error');
    }
  }

  const naoClassificados = items.filter(i => i.competencia === 'Não classificado').length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0e1a] via-[#0d1426] to-[#0a0e1a] text-white">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()} className="p-2 rounded-lg bg-white/5 hover:bg-white/10">
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">Banco de Micro-Conteúdos</h1>
            <p className="text-xs text-gray-400">Vídeos (Bunny), áudios, textos e cases tagueados para o Motor de Temporadas</p>
          </div>
          <button
            onClick={() => setShowGerar(true)}
            disabled={busy}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-sm font-bold"
          >
            <Wand2 size={16} />
            Gerar com IA
          </button>
          <button
            onClick={handleImportar}
            disabled={busy}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-sm font-bold"
          >
            <Download size={16} />
            Importar do Bunny
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="rounded-xl bg-white/5 border border-white/10 p-4">
            <div className="text-xs text-gray-400">Total</div>
            <div className="text-2xl font-bold text-white">{items.length}</div>
          </div>
          <div className="rounded-xl bg-white/5 border border-white/10 p-4">
            <div className="text-xs text-gray-400">Não classificados</div>
            <div className="text-2xl font-bold text-amber-400">{naoClassificados}</div>
          </div>
          <div className="rounded-xl bg-white/5 border border-white/10 p-4">
            <div className="text-xs text-gray-400">Ativos</div>
            <div className="text-2xl font-bold text-emerald-400">{items.filter(i => i.ativo).length}</div>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex items-center gap-3 mb-4">
          <Filter size={14} className="text-gray-500" />
          <select
            value={filterFormato}
            onChange={e => setFilterFormato(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white"
          >
            <option value="" className="bg-[#0d1426] text-white">Todos os formatos</option>
            <option value="video" className="bg-[#0d1426] text-white">Vídeo</option>
            <option value="audio" className="bg-[#0d1426] text-white">Áudio</option>
            <option value="texto" className="bg-[#0d1426] text-white">Texto</option>
            <option value="case" className="bg-[#0d1426] text-white">Case</option>
            <option value="pdf" className="bg-[#0d1426] text-white">PDF</option>
          </select>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
            <input type="checkbox" checked={filterSemClass} onChange={e => setFilterSemClass(e.target.checked)} />
            Só não classificados
          </label>
        </div>

        {/* Logs */}
        {logs.length > 0 && (
          <div className="mb-4 rounded-lg bg-black/30 border border-white/10 p-3 max-h-32 overflow-auto">
            {logs.map(l => (
              <div key={l.ts} className={`text-[11px] ${l.type === 'error' ? 'text-red-400' : l.type === 'success' ? 'text-emerald-400' : 'text-gray-400'}`}>
                {l.msg}
              </div>
            ))}
          </div>
        )}

        {/* Tabela */}
        {loading ? (
          <div className="text-center py-12 text-gray-500 text-sm">Carregando...</div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-gray-500 text-sm">
            Nenhum conteúdo. Clique em "Importar do Bunny" para começar.
          </div>
        ) : (
          <div className="rounded-xl bg-white/[0.03] border border-white/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.04]">
                <tr className="text-left text-[10px] uppercase text-gray-500">
                  <th className="px-3 py-2">Formato</th>
                  <th className="px-3 py-2">Título</th>
                  <th className="px-3 py-2">Competência</th>
                  <th className="px-3 py-2">Descritor</th>
                  <th className="px-3 py-2 text-center">Nível</th>
                  <th className="px-3 py-2">Cargo</th>
                  <th className="px-3 py-2 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {items.map(c => {
                  const Icon = FORMAT_ICONS[c.formato] || FileText;
                  const naoClass = c.competencia === 'Não classificado';
                  return (
                    <tr key={c.id} className="hover:bg-white/[0.02]">
                      <td className="px-3 py-2">
                        <Icon size={16} style={{ color: FORMAT_COLORS[c.formato] }} />
                      </td>
                      <td className="px-3 py-2 text-xs text-white max-w-xs truncate">{c.titulo}</td>
                      <td className="px-3 py-2 text-xs">
                        <span className={naoClass ? 'text-amber-400' : 'text-gray-300'}>{c.competencia}</span>
                      </td>
                      <td className="px-3 py-2 text-[11px] text-gray-400">{c.descritor || '—'}</td>
                      <td className="px-3 py-2 text-[11px] text-center text-gray-400">{c.nivel_min}–{c.nivel_max}</td>
                      <td className="px-3 py-2 text-[11px] text-gray-400">{c.cargo}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleSugerirIA(c)}
                            disabled={busy}
                            className="p-1.5 rounded hover:bg-purple-500/20 text-purple-400"
                            title="Sugerir tags com IA"
                          >
                            <Sparkles size={14} />
                          </button>
                          <button
                            onClick={() => setEditing(c)}
                            className="p-1.5 rounded hover:bg-cyan-500/20 text-cyan-400"
                            title="Editar"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => handleDeletar(c)}
                            className="p-1.5 rounded hover:bg-red-500/20 text-red-400"
                            title="Deletar"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de edição */}
      {editing && <EditModal conteudo={editing} onClose={() => setEditing(null)} onSave={handleSalvarEdicao} />}

      {/* Modal gerar com IA */}
      {showGerar && (
        <GerarModal
          onClose={() => setShowGerar(false)}
          onGenerate={async (params) => {
            setBusy(true);
            addLog(`Gerando ${params.formato} para "${params.descritor}"...`, 'info');
            const r = await gerarConteudoIA(params);
            setBusy(false);
            if (r.success) {
              addLog(`✅ ${r.message}`, 'success');
              setRoteiroGerado({ ...r, formato: params.formato });
              setShowGerar(false);
              await carregar();
            } else {
              addLog(`❌ ${r.error}`, 'error');
            }
          }}
          busy={busy}
        />
      )}

      {/* Modal roteiro gerado (copiar) */}
      {roteiroGerado && <RoteiroModal item={roteiroGerado} onClose={() => setRoteiroGerado(null)} />}

      {/* Modal de sugestão IA */}
      {iaSugestao && (
        <SugestaoModal
          conteudo={iaSugestao.conteudo}
          tags={iaSugestao.tags}
          onApply={handleAplicarSugestao}
          onCancel={() => setIaSugestao(null)}
          onEdit={(novasTags) => setIaSugestao({ ...iaSugestao, tags: novasTags })}
        />
      )}
    </div>
  );
}

function EditModal({ conteudo, onClose, onSave }) {
  const [form, setForm] = useState({
    titulo: conteudo.titulo || '',
    competencia: conteudo.competencia || '',
    descritor: conteudo.descritor || '',
    nivel_min: conteudo.nivel_min || 1.0,
    nivel_max: conteudo.nivel_max || 4.0,
    contexto: conteudo.contexto || 'generico',
    cargo: conteudo.cargo || 'todos',
    setor: conteudo.setor || 'todos',
    tipo_conteudo: conteudo.tipo_conteudo || 'core',
    ativo: conteudo.ativo,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-[#0d1426] rounded-2xl border border-white/10 max-w-lg w-full max-h-[90vh] overflow-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Editar conteúdo</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10"><X size={18} /></button>
        </div>
        <div className="space-y-3 text-sm">
          <Field label="Título" value={form.titulo} onChange={v => setForm({ ...form, titulo: v })} />
          <Field label="Competência" value={form.competencia} onChange={v => setForm({ ...form, competencia: v })} />
          <Field label="Descritor" value={form.descritor} onChange={v => setForm({ ...form, descritor: v })} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nível mín" type="number" step="0.1" value={form.nivel_min} onChange={v => setForm({ ...form, nivel_min: Number(v) })} />
            <Field label="Nível máx" type="number" step="0.1" value={form.nivel_max} onChange={v => setForm({ ...form, nivel_max: Number(v) })} />
          </div>
          <SelectField label="Contexto" value={form.contexto} onChange={v => setForm({ ...form, contexto: v })}
            options={['educacional', 'corporativo', 'generico']} />
          <Field label="Cargo" value={form.cargo} onChange={v => setForm({ ...form, cargo: v })} />
          <SelectField label="Setor" value={form.setor} onChange={v => setForm({ ...form, setor: v })}
            options={['educacao_publica', 'saude', 'agro', 'todos']} />
          <SelectField label="Tipo" value={form.tipo_conteudo} onChange={v => setForm({ ...form, tipo_conteudo: v })}
            options={['core', 'complementar']} />
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.ativo} onChange={e => setForm({ ...form, ativo: e.target.checked })} />
            <span className="text-xs">Ativo</span>
          </label>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={() => onSave(form)} className="flex-1 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-sm font-bold">Salvar</button>
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm">Cancelar</button>
        </div>
      </div>
    </div>
  );
}

function SugestaoModal({ conteudo, tags, onApply, onCancel, onEdit }) {
  const [t, setT] = useState(tags);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-[#0d1426] rounded-2xl border border-purple-500/30 max-w-lg w-full p-6">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles size={18} className="text-purple-400" />
          <h2 className="text-lg font-bold">Sugestão da IA</h2>
        </div>
        <div className="text-xs text-gray-400 mb-4 truncate">{conteudo.titulo}</div>
        {tags.raciocinio && (
          <div className="mb-4 p-3 rounded-lg bg-purple-500/10 border border-purple-500/20 text-xs text-purple-200 italic">
            "{tags.raciocinio}" <span className="text-purple-400">· confiança {Math.round((tags.confianca || 0) * 100)}%</span>
          </div>
        )}
        <div className="space-y-2 text-sm">
          <Field label="Competência" value={t.competencia} onChange={v => { const n = { ...t, competencia: v }; setT(n); onEdit(n); }} />
          <Field label="Descritor" value={t.descritor || ''} onChange={v => { const n = { ...t, descritor: v }; setT(n); onEdit(n); }} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nível mín" type="number" step="0.1" value={t.nivel_min} onChange={v => { const n = { ...t, nivel_min: Number(v) }; setT(n); onEdit(n); }} />
            <Field label="Nível máx" type="number" step="0.1" value={t.nivel_max} onChange={v => { const n = { ...t, nivel_max: Number(v) }; setT(n); onEdit(n); }} />
          </div>
          <SelectField label="Contexto" value={t.contexto} onChange={v => { const n = { ...t, contexto: v }; setT(n); onEdit(n); }} options={['educacional', 'corporativo', 'generico']} />
          <Field label="Cargo" value={t.cargo} onChange={v => { const n = { ...t, cargo: v }; setT(n); onEdit(n); }} />
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onApply} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-sm font-bold">
            <Check size={14} /> Aplicar
          </button>
          <button onClick={onCancel} className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm">Cancelar</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', step }) {
  return (
    <div>
      <label className="block text-[10px] uppercase text-gray-500 mb-1">{label}</label>
      <input
        type={type}
        step={step}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:border-cyan-500 outline-none"
      />
    </div>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <div>
      <label className="block text-[10px] uppercase text-gray-500 mb-1">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white outline-none"
      >
        {options.map(o => <option key={o} value={o} className="bg-[#0d1426] text-white">{o}</option>)}
      </select>
    </div>
  );
}

function GerarModal({ onClose, onGenerate, busy }) {
  const [form, setForm] = useState({
    formato: 'texto',
    competencia: '',
    descritor: '',
    nivelMin: 1.0,
    nivelMax: 2.0,
    cargo: 'todos',
    contexto: 'generico',
  });

  const formatos = [
    { v: 'texto', label: 'Artigo (texto)', icon: FileText, cor: '#10B981', nota: 'Pronto pra consumir' },
    { v: 'case', label: 'Estudo de caso', icon: BookOpen, cor: '#F59E0B', nota: 'Pronto pra consumir' },
    { v: 'video', label: 'Roteiro de vídeo', icon: Video, cor: '#06B6D4', nota: 'Precisa gravar depois' },
    { v: 'audio', label: 'Roteiro de podcast', icon: Headphones, cor: '#A78BFA', nota: 'Precisa gravar depois' },
  ];

  const podeGerar = form.competencia && form.descritor && !busy;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-[#0d1426] rounded-2xl border border-purple-500/30 max-w-2xl w-full max-h-[90vh] overflow-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Wand2 size={20} className="text-purple-400" />
            <h2 className="text-lg font-bold">Gerar conteúdo com IA</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10"><X size={18} /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-[10px] uppercase text-gray-500 mb-2">Formato</label>
            <div className="grid grid-cols-2 gap-2">
              {formatos.map(f => {
                const Icon = f.icon;
                const ativo = form.formato === f.v;
                return (
                  <button key={f.v} onClick={() => setForm({ ...form, formato: f.v })}
                    className={`flex items-start gap-2 p-3 rounded-lg border text-left ${
                      ativo ? 'border-purple-400 bg-purple-500/10' : 'border-white/10 bg-white/5 hover:border-white/20'
                    }`}>
                    <Icon size={16} style={{ color: f.cor }} className="mt-0.5" />
                    <div>
                      <div className="text-xs font-bold text-white">{f.label}</div>
                      <div className="text-[10px] text-gray-500">{f.nota}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <Field label="Competência" value={form.competencia} onChange={v => setForm({ ...form, competencia: v })} />
          <Field label="Descritor (o que será desenvolvido)" value={form.descritor} onChange={v => setForm({ ...form, descritor: v })} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nível mín" type="number" step="0.1" value={form.nivelMin} onChange={v => setForm({ ...form, nivelMin: Number(v) })} />
            <Field label="Nível máx" type="number" step="0.1" value={form.nivelMax} onChange={v => setForm({ ...form, nivelMax: Number(v) })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cargo alvo" value={form.cargo} onChange={v => setForm({ ...form, cargo: v })} />
            <SelectField label="Contexto" value={form.contexto} onChange={v => setForm({ ...form, contexto: v })}
              options={['educacional', 'corporativo', 'generico']} />
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={() => onGenerate(form)} disabled={!podeGerar}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-sm font-bold">
            {busy ? 'Gerando...' : <><Wand2 size={14} /> Gerar</>}
          </button>
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm">Cancelar</button>
        </div>

        <p className="text-[10px] text-gray-500 mt-4">
          💡 Textos e cases ficam prontos pra consumo imediato.
          Roteiros de vídeo/áudio precisam ser gravados depois — o conteúdo fica inativo até você atualizar o URL na edição.
        </p>
      </div>
    </div>
  );
}

function RoteiroModal({ item, onClose }) {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try { await navigator.clipboard.writeText(item.roteiro); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch {}
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-[#0d1426] rounded-2xl border border-emerald-500/30 max-w-3xl w-full max-h-[90vh] flex flex-col p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Check size={20} className="text-emerald-400" />
            <h2 className="text-lg font-bold">Conteúdo gerado · {item.formato}</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10"><X size={18} /></button>
        </div>
        <div className="text-xs text-gray-400 mb-3">{item.titulo}</div>
        {item.precisaGravar && (
          <div className="mb-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300">
            ⚠️ Roteiro pronto pra gravação. Conteúdo foi salvo como <strong>inativo</strong> — edite e cole a URL final do Bunny/Storage depois de gravar pra ativar.
          </div>
        )}
        <pre className="flex-1 overflow-auto p-4 rounded-lg bg-black/40 border border-white/10 text-xs text-gray-200 whitespace-pre-wrap font-mono leading-relaxed">
          {item.roteiro}
        </pre>
        <div className="flex gap-2 mt-4">
          <button onClick={copiar} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm font-bold">
            <Copy size={14} /> {copiado ? 'Copiado!' : 'Copiar texto'}
          </button>
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm">Fechar</button>
        </div>
      </div>
    </div>
  );
}
