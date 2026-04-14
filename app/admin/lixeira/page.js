'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Trash2, RotateCcw, Loader2, AlertTriangle } from 'lucide-react';
import { listarLixeira, restaurarDaLixeira, esvaziarLixeira } from '@/app/admin/empresas/[empresaId]/actions';

export default function LixeiraPage() {
  const router = useRouter();
  const [empresaId, setEmpresaId] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selecionados, setSelecionados] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [filtroTabela, setFiltroTabela] = useState('');

  useEffect(() => {
    setEmpresaId(new URLSearchParams(window.location.search).get('empresa'));
  }, []);

  const carregar = async () => {
    setLoading(true);
    const r = await listarLixeira(empresaId);
    setItems(r.items || []);
    setLoading(false);
  };

  useEffect(() => { carregar(); }, [empresaId]);

  const tabelas = [...new Set(items.map(i => i.tabela_origem))].sort();
  const filtrados = filtroTabela ? items.filter(i => i.tabela_origem === filtroTabela) : items;

  function toggleAll() {
    if (selecionados.size === filtrados.length) setSelecionados(new Set());
    else setSelecionados(new Set(filtrados.map(i => i.id)));
  }

  async function handleRestaurar() {
    if (selecionados.size === 0) return;
    if (!confirm(`Restaurar ${selecionados.size} registro(s) pra suas tabelas originais?`)) return;
    setBusy(true);
    const r = await restaurarDaLixeira([...selecionados]);
    setBusy(false);
    alert(r.message || r.error);
    setSelecionados(new Set());
    await carregar();
  }

  async function handleEsvaziar() {
    if (!confirm('Apagar permanentemente itens com mais de 30 dias na lixeira?')) return;
    setBusy(true);
    const r = await esvaziarLixeira(empresaId);
    setBusy(false);
    alert(r.message || r.error);
    await carregar();
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0e1a] via-[#0d1426] to-[#0a0e1a] text-white">
      <div className="max-w-5xl mx-auto p-6">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()} className="p-2 rounded-lg bg-white/5 hover:bg-white/10">
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Trash2 size={22} className="text-red-400" /> Lixeira
            </h1>
            <p className="text-xs text-gray-400">{empresaId ? 'Empresa específica' : 'Todas as empresas'} · {items.length} registros</p>
          </div>
          <button onClick={handleEsvaziar} disabled={busy}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-red-400 border border-red-400/30 hover:bg-red-400/10 disabled:opacity-50">
            <Trash2 size={14} /> Esvaziar &gt;30d
          </button>
        </div>

        {/* Filtros + ações */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <select value={filtroTabela} onChange={e => setFiltroTabela(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-xs text-white border border-white/10 bg-[#091D35]">
            <option value="">Todas as tabelas ({items.length})</option>
            {tabelas.map(t => (
              <option key={t} value={t}>{t} ({items.filter(i => i.tabela_origem === t).length})</option>
            ))}
          </select>
          {filtrados.length > 0 && (
            <>
              <button onClick={toggleAll} className="text-xs text-cyan-400 hover:text-cyan-300">
                {selecionados.size === filtrados.length ? 'Desmarcar todos' : 'Selecionar todos'}
              </button>
              <span className="text-xs text-gray-500">{selecionados.size} selecionado(s)</span>
            </>
          )}
          <button onClick={handleRestaurar} disabled={busy || selecionados.size === 0}
            className="ml-auto flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-emerald-400 border border-emerald-400/30 hover:bg-emerald-400/10 disabled:opacity-50">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
            Restaurar selecionados
          </button>
        </div>

        {/* Lista */}
        {loading ? (
          <div className="text-center py-12"><Loader2 size={24} className="animate-spin text-cyan-400 mx-auto" /></div>
        ) : filtrados.length === 0 ? (
          <div className="text-center py-12 text-gray-500 text-sm">Lixeira vazia 🎉</div>
        ) : (
          <div className="rounded-xl bg-white/[0.03] border border-white/10 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-white/[0.04]">
                <tr className="text-left text-[10px] uppercase text-gray-500">
                  <th className="px-3 py-2 w-8"></th>
                  <th className="px-3 py-2">Tabela</th>
                  <th className="px-3 py-2">ID</th>
                  <th className="px-3 py-2">Contexto</th>
                  <th className="px-3 py-2">Deletado em</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtrados.map(it => {
                  const sel = selecionados.has(it.id);
                  return (
                    <tr key={it.id} className={`hover:bg-white/[0.02] cursor-pointer ${sel ? 'bg-emerald-500/5' : ''}`}
                      onClick={() => {
                        const novo = new Set(selecionados);
                        if (sel) novo.delete(it.id); else novo.add(it.id);
                        setSelecionados(novo);
                      }}>
                      <td className="px-3 py-2 text-center">
                        <input type="checkbox" checked={sel} readOnly />
                      </td>
                      <td className="px-3 py-2 font-bold text-cyan-400">{it.tabela_origem}</td>
                      <td className="px-3 py-2 text-[10px] text-gray-500 font-mono">{it.registro_id?.slice(0, 8) || '—'}</td>
                      <td className="px-3 py-2 text-gray-300">{it.contexto || '—'}</td>
                      <td className="px-3 py-2 text-[11px] text-gray-400">
                        {new Date(it.deletado_em).toLocaleString('pt-BR')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-200">
          <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" />
          <span>Itens com mais de 30 dias podem ser apagados permanentemente pelo botão "Esvaziar &gt;30d".</span>
        </div>
      </div>
    </div>
  );
}
