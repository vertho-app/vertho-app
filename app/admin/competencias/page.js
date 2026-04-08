'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft, Loader2, BookMarked, Plus, Pencil, Trash2, Copy, ChevronDown, X, Save, Upload, Filter
} from 'lucide-react';
import {
  loadEmpresas, loadCompetencias, loadCompetenciasBase,
  salvarCompetencia, excluirCompetencia, copiarBaseParaEmpresa, importarCompetenciasCSV, loadCargosEmpresa
} from './actions';

const EMPTY_COMP = { nome: '', descricao: '', cargo: '', cod_comp: '', pilar: '' };

export default function CompetenciasPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const empresaParam = searchParams.get('empresa');
  const [empresas, setEmpresas] = useState([]);
  const [empresaId, setEmpresaId] = useState(empresaParam || '');
  const [empresaNome, setEmpresaNome] = useState('');
  const [segmento, setSegmento] = useState('');
  const [comps, setComps] = useState([]);
  const [baselist, setBaselist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingComps, setLoadingComps] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editComp, setEditComp] = useState(EMPTY_COMP);
  const [saving, setSaving] = useState(false);
  const [showBase, setShowBase] = useState(false);
  const [toast, setToast] = useState(null);
  const [filtroCargo, setFiltroCargo] = useState('');
  const [cargoParaCopiar, setCargoParaCopiar] = useState('');
  const [cargosEmpresa, setCargosEmpresa] = useState([]);
  const [showImport, setShowImport] = useState(false);
  const [importing, setImporting] = useState(false);

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

  function flash(msg) { setToast(msg); setTimeout(() => setToast(null), 2500); }

  async function handleSelectEmpresa(id) {
    setEmpresaId(id);
    if (!id) { setComps([]); setBaselist([]); return; }
    setLoadingComps(true);
    const emp = empresas.find(e => e.id === id);
    setSegmento(emp?.segmento || '');
    const [r1, r2, cargos] = await Promise.all([
      loadCompetencias(id),
      loadCompetenciasBase(emp?.segmento || null),
      loadCargosEmpresa(id),
    ]);
    setCargosEmpresa(cargos || []);
    if (r1.success) {
      setComps(r1.data || []);
      // Extrair cargos únicos dos colaboradores + competências existentes
      const cargosFromComps = [...new Set((r1.data || []).map(c => c.cargo).filter(Boolean))];
      setCargosEmpresa(cargosFromComps.sort());
    }
    if (r2.success) setBaselist(r2.data || []);
    setLoadingComps(false);
  }

  function openAdd() { setEditComp(EMPTY_COMP); setShowModal(true); }
  function openEdit(c) { setEditComp({ ...c }); setShowModal(true); }

  async function handleSave() {
    if (!editComp.nome.trim()) return;
    setSaving(true);
    const r = await salvarCompetencia(empresaId, editComp);
    setSaving(false);
    if (r.success) {
      flash(r.message);
      setShowModal(false);
      handleSelectEmpresa(empresaId);
    } else {
      flash('Erro: ' + r.error);
    }
  }

  async function handleDelete(id) {
    if (!confirm('Excluir esta competencia?')) return;
    const r = await excluirCompetencia(id);
    if (r.success) {
      flash('Excluida');
      handleSelectEmpresa(empresaId);
    } else {
      flash('Erro: ' + r.error);
    }
  }

  async function handleCopy(baseId) {
    const r = await copiarBaseParaEmpresa(empresaId, baseId, cargoParaCopiar || null);
    if (r.success) {
      flash(r.message);
      handleSelectEmpresa(empresaId);
    } else {
      flash('Erro: ' + r.error);
    }
  }

  if (loading) return <div className="flex items-center justify-center h-dvh"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-6 sm:px-6" style={{ minHeight: '100dvh' }}>
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold shadow-lg">{toast}</div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push(empresaParam ? `/admin/empresas/${empresaParam}` : '/admin/dashboard')} className="w-9 h-9 flex items-center justify-center rounded-lg border border-white/10 text-gray-400 hover:text-white transition-colors">
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2"><BookMarked size={20} className="text-cyan-400" /> Competencias</h1>
            {empresaParam && empresaNome ? (
              <p className="text-xs text-gray-500">{empresaNome}</p>
            ) : (
              <p className="text-xs text-gray-500">CRUD de competencias por empresa</p>
            )}
          </div>
        </div>
        {empresaId && (
          <div className="flex items-center gap-2">
            <button onClick={() => setShowBase(!showBase)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-white/10 text-gray-300 hover:border-cyan-400/30 hover:text-cyan-400 transition-all">
              <Copy size={14} /> {showBase ? 'Ocultar Base' : 'Ver Base'}
            </button>
            <button onClick={() => setShowImport(!showImport)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-white/10 text-gray-300 hover:border-cyan-400/30 hover:text-cyan-400 transition-all">
              <Upload size={14} /> CSV
            </button>
            <button onClick={openAdd}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-white border border-green-400/30 hover:bg-green-400/10 transition-all">
              <Plus size={14} /> Nova
            </button>
          </div>
        )}
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

      {/* Import CSV */}
      {showImport && empresaId && (
        <div className="rounded-xl p-4 border border-white/[0.06] mb-4" style={{ background: '#0F2A4A' }}>
          <p className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest mb-2">Importar Competências via CSV</p>
          <p className="text-xs text-gray-400 mb-1">Colunas aceitas (separador: vírgula ou ponto-e-vírgula):</p>
          <p className="text-[10px] text-cyan-400 font-mono mb-1">cod_comp, <strong>nome</strong>*, pilar, cargo, descricao, cod_desc, nome_curto, descritor_completo, n1_gap, n2_desenvolvimento, n3_meta, n4_referencia</p>
          <p className="text-[10px] text-gray-600">* <strong>nome</strong> é obrigatória. Demais são opcionais. Dedup por nome+cargo.</p>
          <label className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white cursor-pointer"
            style={{ background: 'linear-gradient(135deg, #0D9488, #0F766E)' }}>
            {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {importing ? 'Importando...' : 'Selecionar CSV'}
            <input type="file" accept=".csv" className="hidden" disabled={importing} onChange={async e => {
              const file = e.target.files?.[0];
              if (!file) return;
              setImporting(true);
              const text = await file.text();
              const lines = text.split('\n').filter(l => l.trim());
              const sep = (lines[0].split(';').length > lines[0].split(',').length) ? ';' : ',';
              const header = lines[0].split(sep).map(h => h.trim().toLowerCase().replace(/^["']|["']$/g, ''));
              const parsed = lines.slice(1).map(line => {
                const cols = line.split(sep).map(c => c.trim().replace(/^["']|["']$/g, ''));
                const obj = {};
                header.forEach((h, i) => { obj[h] = cols[i]; });
                return obj;
              }).filter(c => c.nome);
              if (!parsed.length) { flash('Nenhuma competência válida. Verifique coluna "nome".'); setImporting(false); e.target.value = ''; return; }
              const r = await importarCompetenciasCSV(empresaId, parsed);
              flash(r.success ? r.message : 'Erro: ' + r.error);
              setImporting(false);
              e.target.value = '';
              if (r.success) handleSelectEmpresa(empresaId);
            }} />
          </label>
        </div>
      )}

      {loadingComps && <div className="flex items-center justify-center py-12"><Loader2 size={24} className="animate-spin text-cyan-400" /></div>}

      {/* Filtro por cargo */}
      {!loadingComps && comps.length > 0 && (() => {
        const cargos = [...new Set(comps.map(c => c.cargo).filter(Boolean))].sort();
        return cargos.length > 1 ? (
          <div className="flex items-center gap-2 mb-3">
            <Filter size={14} className="text-gray-500" />
            <select value={filtroCargo} onChange={e => setFiltroCargo(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-xs text-white border border-white/10 outline-none" style={{ background: '#091D35' }}>
              <option value="">Todos os cargos ({comps.length})</option>
              {cargos.map(c => <option key={c} value={c}>{c} ({comps.filter(x => x.cargo === c).length})</option>)}
            </select>
          </div>
        ) : null;
      })()}

      {/* Empty */}
      {!loadingComps && empresaId && comps.length === 0 && (
        <div className="text-center py-12">
          <BookMarked size={32} className="text-gray-600 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Nenhuma competencia cadastrada</p>
        </div>
      )}

      {/* Table */}
      {!loadingComps && comps.length > 0 && (
        <div className="rounded-xl border border-white/[0.06] overflow-hidden mb-6" style={{ background: '#0F2A4A' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Cod</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Nome</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Pilar</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Cargo</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Descricao</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase">Acoes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {comps.filter(c => !filtroCargo || c.cargo === filtroCargo).map(c => (
                  <tr key={c.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 text-gray-400 font-mono text-xs">{c.cod_comp || '-'}</td>
                    <td className="px-4 py-3 text-white font-semibold">{c.nome}</td>
                    <td className="px-4 py-3 text-gray-400">{c.pilar || '-'}</td>
                    <td className="px-4 py-3 text-gray-400">{c.cargo || '-'}</td>
                    <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate">{c.descricao || '-'}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(c)} className="w-7 h-7 flex items-center justify-center rounded text-gray-500 hover:text-cyan-400 transition-colors">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => handleDelete(c.id)} className="w-7 h-7 flex items-center justify-center rounded text-gray-500 hover:text-red-400 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Base competencies */}
      {showBase && baselist.length > 0 && (
        <div className="rounded-xl border border-white/[0.06] overflow-hidden" style={{ background: '#0F2A4A' }}>
          <div className="px-5 py-3 border-b border-white/[0.06] flex items-center gap-2">
            <Copy size={16} className="text-cyan-400" />
            <span className="text-sm font-bold text-white">Competencias Base {segmento ? `(${segmento})` : '(Global)'}</span>
          </div>

          {/* Seletor de cargo destino */}
          <div className="px-5 py-3 border-b border-white/[0.06]" style={{ background: '#091D35' }}>
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Copiar competência para qual cargo/função?</p>
            <select value={cargoParaCopiar} onChange={e => setCargoParaCopiar(e.target.value)}
              className="w-full max-w-xs px-3 py-2 rounded-lg text-xs text-white border border-white/10 outline-none" style={{ background: '#0F2A4A' }}>
              <option value="">Sem cargo (genérica)</option>
              {cargosEmpresa.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {cargosEmpresa.length === 0 && (
              <p className="text-[10px] text-amber-400 mt-1">Nenhum cargo encontrado. Importe colaboradores com cargo primeiro.</p>
            )}
          </div>

          <div className="divide-y divide-white/[0.03]">
            {baselist.map(b => (
              <div key={b.id} className="flex items-center justify-between px-5 py-3 hover:bg-white/[0.02] transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">{b.nome}</p>
                  <p className="text-xs text-gray-500 truncate max-w-md">{b.descricao || ''}</p>
                  {b.pilar && <span className="text-[9px] text-gray-600">{b.pilar}</span>}
                </div>
                <button onClick={() => handleCopy(b.id)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10 transition-all shrink-0">
                  <Copy size={12} /> {cargoParaCopiar ? `→ ${cargoParaCopiar}` : 'Copiar'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowModal(false)}>
          <div className="rounded-xl border border-white/10 w-full max-w-lg mx-4 p-6" style={{ background: '#0F2A4A' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">{editComp.id ? 'Editar' : 'Nova'} Competencia</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-white"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              {[
                { key: 'nome', label: 'Nome', placeholder: 'Nome da competencia' },
                { key: 'cod_comp', label: 'Codigo', placeholder: 'Ex: COMP-01' },
                { key: 'pilar', label: 'Pilar', placeholder: 'Ex: Lideranca' },
                { key: 'cargo', label: 'Cargo', placeholder: 'Ex: Gerente' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-bold text-gray-400 mb-1">{f.label}</label>
                  <input value={editComp[f.key] || ''} onChange={e => setEditComp(p => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="w-full rounded-lg border border-white/10 bg-[#091D35] text-white text-sm px-3 py-2 focus:outline-none focus:border-cyan-400/50" />
                </div>
              ))}
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">Descricao</label>
                <textarea value={editComp.descricao || ''} onChange={e => setEditComp(p => ({ ...p, descricao: e.target.value }))}
                  rows={3} placeholder="Descricao da competencia..."
                  className="w-full rounded-lg border border-white/10 bg-[#091D35] text-white text-sm px-3 py-2 focus:outline-none focus:border-cyan-400/50 resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg text-sm text-gray-400 border border-white/10 hover:text-white transition-colors">Cancelar</button>
              <button onClick={handleSave} disabled={saving || !editComp.nome.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold text-white bg-teal-600 hover:bg-teal-500 transition-colors disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
