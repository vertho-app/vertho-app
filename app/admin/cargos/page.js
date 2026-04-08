'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Loader2, Briefcase, Check, Save, ChevronDown } from 'lucide-react';
import { loadEmpresas, loadCargos, salvarTop5 } from './actions';

export default function CargosPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const empresaParam = searchParams.get('empresa');
  const [empresas, setEmpresas] = useState([]);
  const [empresaId, setEmpresaId] = useState(empresaParam || '');
  const [empresaNome, setEmpresaNome] = useState('');
  const [cargos, setCargos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingCargos, setLoadingCargos] = useState(false);
  const [saving, setSaving] = useState({});
  const [top5Edits, setTop5Edits] = useState({});
  const [toast, setToast] = useState(null);

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
    if (!id) { setCargos([]); return; }
    setLoadingCargos(true);
    const r = await loadCargos(id);
    if (r.success) {
      setCargos(r.data || []);
      const edits = {};
      (r.data || []).forEach(c => { edits[c.id] = c.top5_workshop || []; });
      setTop5Edits(edits);
    }
    setLoadingCargos(false);
  }

  function toggleCompetencia(cargoId, comp) {
    setTop5Edits(prev => {
      const current = prev[cargoId] || [];
      const exists = current.includes(comp);
      let next;
      if (exists) {
        next = current.filter(c => c !== comp);
      } else if (current.length >= 5) {
        return prev;
      } else {
        next = [...current, comp];
      }
      return { ...prev, [cargoId]: next };
    });
  }

  async function handleSave(cargoId) {
    setSaving(prev => ({ ...prev, [cargoId]: true }));
    const r = await salvarTop5(cargoId, top5Edits[cargoId] || []);
    setSaving(prev => ({ ...prev, [cargoId]: false }));
    if (r.success) {
      setToast('Top 5 salvo!');
      setTimeout(() => setToast(null), 2000);
    } else {
      setToast('Erro: ' + r.error);
      setTimeout(() => setToast(null), 3000);
    }
  }

  if (loading) return <div className="flex items-center justify-center h-dvh"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-6 sm:px-6" style={{ minHeight: '100dvh' }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push(empresaParam ? `/admin/empresas/${empresaParam}` : '/admin/dashboard')} className="w-9 h-9 flex items-center justify-center rounded-lg border border-white/10 text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2"><Briefcase size={20} className="text-cyan-400" /> Gestao de Cargos</h1>
          {empresaParam && empresaNome ? (
            <p className="text-xs text-gray-500">{empresaNome}</p>
          ) : (
            <p className="text-xs text-gray-500">Selecione Top 5 competencias por cargo</p>
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

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold shadow-lg">
          {toast}
        </div>
      )}

      {/* Loading */}
      {loadingCargos && (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-cyan-400" />
        </div>
      )}

      {/* Empty state */}
      {!loadingCargos && empresaId && cargos.length === 0 && (
        <div className="text-center py-12">
          <Briefcase size={32} className="text-gray-600 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Nenhum cargo encontrado para esta empresa</p>
        </div>
      )}

      {/* Cargos list */}
      {!loadingCargos && cargos.length > 0 && (
        <div className="space-y-4">
          {cargos.map(cargo => {
            const top10 = cargo.competencias_top10 || [];
            const selected = top5Edits[cargo.id] || [];
            return (
              <div key={cargo.id} className="rounded-xl border border-white/[0.06] overflow-hidden" style={{ background: '#0F2A4A' }}>
                <div className="px-5 py-3 border-b border-white/[0.06] flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-white">{cargo.nome}</h3>
                    <p className="text-xs text-gray-500">Top 10 da IA  |  {selected.length}/5 selecionadas</p>
                  </div>
                  <button onClick={() => handleSave(cargo.id)} disabled={saving[cargo.id]}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-teal-600 hover:bg-teal-500 text-white transition-colors disabled:opacity-50">
                    {saving[cargo.id] ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                    Salvar Top 5
                  </button>
                </div>
                <div className="p-5">
                  {top10.length === 0 ? (
                    <p className="text-xs text-gray-500">Nenhuma competencia Top 10 gerada pela IA ainda.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {top10.map((comp, i) => {
                        const isSelected = selected.includes(comp);
                        const isFull = selected.length >= 5 && !isSelected;
                        return (
                          <button key={i} onClick={() => toggleCompetencia(cargo.id, comp)} disabled={isFull}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left text-sm transition-all ${
                              isSelected
                                ? 'border-cyan-400/50 bg-cyan-400/10 text-white'
                                : isFull
                                  ? 'border-white/[0.04] text-gray-600 cursor-not-allowed'
                                  : 'border-white/[0.06] text-gray-300 hover:border-white/20'
                            }`}>
                            <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${
                              isSelected ? 'bg-cyan-400 text-[#091D35]' : 'border border-white/20'
                            }`}>
                              {isSelected && <Check size={12} strokeWidth={3} />}
                            </div>
                            <span className="truncate">{comp}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
