'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Loader2, Trophy, Trash2, Plus, X, ChevronDown, Filter } from 'lucide-react';
import { loadTop10TodosCargos, adicionarTop10, removerTop10 } from '@/actions/fase1';
import { loadCompetencias } from '@/app/admin/competencias/actions';

export default function Top10Page() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const empresaId = searchParams.get('empresa');

  const [top10, setTop10] = useState([]);
  const [allComps, setAllComps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [filtroCargo, setFiltroCargo] = useState('');
  const [showAdd, setShowAdd] = useState(null); // cargo para adicionar
  const [addSearch, setAddSearch] = useState('');

  function flash(msg) { setToast(msg); setTimeout(() => setToast(null), 2500); }

  async function refresh() {
    if (!empresaId) return;
    const [t, c] = await Promise.all([
      loadTop10TodosCargos(empresaId),
      loadCompetencias(empresaId),
    ]);
    setTop10(t);
    if (c.success) setAllComps(c.data || []);
    setLoading(false);
  }

  useEffect(() => { refresh(); }, [empresaId]);

  // Agrupar por cargo
  const cargos = [...new Set(top10.map(t => t.cargo))].sort();
  const cargosFiltered = filtroCargo ? cargos.filter(c => c === filtroCargo) : cargos;

  // Competências já selecionadas (IDs) para o cargo do modal
  const selectedIds = showAdd
    ? new Set(top10.filter(t => t.cargo === showAdd).map(t => t.competencia_id))
    : new Set();

  // Competências disponíveis para adicionar (não selecionadas, filtradas por busca)
  const availableComps = showAdd
    ? (() => {
        // Agrupar por cod_comp para não mostrar descritores duplicados
        const seen = new Set();
        return allComps.filter(c => {
          const key = c.cod_comp || c.nome;
          if (seen.has(key)) return false;
          seen.add(key);
          if (selectedIds.has(c.id)) return false;
          if (addSearch) {
            const s = addSearch.toLowerCase();
            return c.nome.toLowerCase().includes(s) || (c.pilar || '').toLowerCase().includes(s);
          }
          return true;
        });
      })()
    : [];

  async function handleRemove(id) {
    const r = await removerTop10(id);
    if (r.success) { flash('Removida'); refresh(); }
    else flash('Erro: ' + r.error);
  }

  async function handleAdd(compId) {
    if (!showAdd || !empresaId) return;
    const r = await adicionarTop10(empresaId, showAdd, compId);
    if (r.success) { flash('Adicionada'); refresh(); }
    else flash('Erro: ' + r.error);
  }

  if (!empresaId) {
    return (
      <div className="max-w-[1100px] mx-auto px-4 py-6 text-center">
        <p className="text-gray-400">Acesse via pipeline da empresa.</p>
        <button onClick={() => router.push('/admin/dashboard')} className="mt-4 text-cyan-400 text-sm hover:underline">Voltar</button>
      </div>
    );
  }

  if (loading) return <div className="flex items-center justify-center h-dvh"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-6 sm:px-6" style={{ minHeight: '100dvh' }}>
      {toast && <div className="fixed top-4 right-4 z-50 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold shadow-lg">{toast}</div>}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push(`/admin/empresas/${empresaId}`)} className="w-9 h-9 flex items-center justify-center rounded-lg border border-white/10 text-gray-400 hover:text-white transition-colors">
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2"><Trophy size={20} className="text-amber-400" /> Top 10 Competências</h1>
            <p className="text-xs text-gray-500">Validação das competências selecionadas pela IA por cargo</p>
          </div>
        </div>
      </div>

      {/* Filtro de cargo */}
      {cargos.length > 1 && (
        <div className="flex items-center gap-2 mb-4">
          <Filter size={14} className="text-gray-400" />
          <select value={filtroCargo} onChange={e => setFiltroCargo(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-xs text-white border border-white/10 outline-none" style={{ background: '#091D35' }}>
            <option value="">Todos os cargos</option>
            {cargos.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      )}

      {/* Empty state */}
      {top10.length === 0 && (
        <div className="text-center py-12">
          <Trophy size={32} className="text-gray-600 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Nenhuma seleção encontrada</p>
          <p className="text-xs text-gray-600 mt-1">Rode a IA1 (Top Competências) no pipeline da empresa primeiro</p>
        </div>
      )}

      {/* Cards por cargo */}
      {cargosFiltered.map(cargo => {
        const items = top10.filter(t => t.cargo === cargo);
        return (
          <div key={cargo} className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white">{cargo}</h2>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${items.length >= 10 ? 'bg-green-400/15 text-green-400' : items.length >= 7 ? 'bg-amber-400/15 text-amber-400' : 'bg-red-400/15 text-red-400'}`}>
                  {items.length}/10
                </span>
              </div>
              <button onClick={() => { setShowAdd(cargo); setAddSearch(''); }}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-green-400 border border-green-400/30 hover:bg-green-400/10 transition-all">
                <Plus size={12} /> Adicionar
              </button>
            </div>

            <div className="rounded-xl border border-white/[0.06] overflow-hidden" style={{ background: '#0F2A4A' }}>
              {items.map((t, i) => (
                <div key={t.id} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-white/[0.04]' : ''}`}>
                  <span className="text-[10px] font-mono text-amber-400 font-bold w-5 text-center shrink-0">{t.posicao || i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">{t.competencia?.nome || '—'}</span>
                      {t.competencia?.cod_comp && (
                        <span className="text-[9px] font-mono text-cyan-400/70 bg-cyan-400/10 px-1.5 py-0.5 rounded">{t.competencia.cod_comp}</span>
                      )}
                      {t.competencia?.pilar && <span className="text-[10px] text-gray-500">{t.competencia.pilar}</span>}
                    </div>
                    {t.justificativa && <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-2">{t.justificativa}</p>}
                  </div>
                  <button onClick={() => handleRemove(t.id)}
                    className="w-7 h-7 flex items-center justify-center rounded text-gray-600 hover:text-red-400 shrink-0 transition-colors">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              {items.length === 0 && (
                <div className="px-4 py-6 text-center text-xs text-gray-500">Nenhuma competência selecionada</div>
              )}
            </div>
          </div>
        );
      })}

      {/* Modal: Adicionar competência */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-10 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={() => setShowAdd(null)}>
          <div className="w-full max-w-[550px] rounded-2xl border border-white/[0.08] p-5 mb-10" style={{ background: '#0A1D35' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-white">Adicionar competência — {showAdd}</h2>
              <button onClick={() => setShowAdd(null)} className="text-gray-500 hover:text-white"><X size={18} /></button>
            </div>

            <input value={addSearch} onChange={e => setAddSearch(e.target.value)}
              placeholder="Buscar competência..."
              className="w-full px-3 py-2 rounded-lg text-sm text-white border border-white/10 outline-none focus:border-cyan-400/50 mb-3"
              style={{ background: '#091D35' }} />

            <div className="max-h-[400px] overflow-y-auto space-y-1">
              {availableComps.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-4">Nenhuma competência disponível</p>
              ) : (
                availableComps.map(c => (
                  <button key={c.id} onClick={() => handleAdd(c.id)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-white/[0.04] transition-colors">
                    <Plus size={12} className="text-green-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white">{c.nome}</p>
                      <div className="flex items-center gap-2">
                        {c.cod_comp && <span className="text-[9px] text-cyan-400/70 font-mono">{c.cod_comp}</span>}
                        {c.pilar && <span className="text-[9px] text-gray-500">{c.pilar}</span>}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
