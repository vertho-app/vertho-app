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
import { parseSpreadsheet } from '@/lib/parse-spreadsheet';

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
  const [editComp, setEditComp] = useState<any>(EMPTY_COMP);
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
    if (r1.success) setComps(r1.data || []);
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
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-white/10 text-gray-300 hover:border-green-400/30 hover:text-green-400 transition-all">
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
          <p className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest mb-2">Importar Competências (CSV ou Excel)</p>
          <p className="text-xs text-gray-400 mb-1">Colunas aceitas (1ª linha = cabeçalho):</p>
          <p className="text-[10px] text-cyan-400 font-mono mb-1">cod_comp, <strong>nome</strong>*, pilar, cargo, <strong>descricao</strong>*, cod_desc, nome_curto, descritor_completo, <strong>n1_gap</strong>*, <strong>n2_desenvolvimento</strong>*, n3_meta, <strong>n4_referencia</strong>*, evidencias_esperadas, perguntas_alvo</p>
          <p className="text-[10px] text-gray-600">* obrigatórios: <strong>nome, descricao, n1_gap, n2_desenvolvimento, n4_referencia</strong>. Demais são opcionais. Dedup por cod_comp+cod_desc.</p>
          <label className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white cursor-pointer"
            style={{ background: 'linear-gradient(135deg, #0D9488, #0F766E)' }}>
            {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {importing ? 'Importando...' : 'Selecionar arquivo (CSV ou XLSX)'}
            <input type="file" accept=".csv,.xlsx,.xls" className="hidden" disabled={importing} onChange={async e => {
              const file = e.target.files?.[0];
              if (!file) return;
              setImporting(true);
              const rowsRaw = await parseSpreadsheet(file);

              // Forward-fill: quando planilha tem células mescladas para a competência,
              // as linhas dos descritores subsequentes vêm com nome/descricao/etc vazios.
              // Copia do registro anterior para manter o agrupamento por competência.
              const CAMPOS_COMP = ['nome', 'cod_comp', 'pilar', 'cargo', 'descricao', 'evidencias_esperadas', 'perguntas_alvo'];
              const rows = [];
              let anterior = {};
              for (const r of rowsRaw) {
                const filled = { ...r };
                for (const k of CAMPOS_COMP) {
                  if (!filled[k]?.trim() && anterior[k]?.trim()) filled[k] = anterior[k];
                }
                // Só inclui se tem pelo menos nome_curto OU descritor_completo (é uma linha de descritor)
                // OU se tem nome (linha-cabeçalho com apenas a competência)
                if (filled.nome?.trim()) {
                  rows.push(filled);
                  anterior = filled;
                }
              }

              const parsed = rows;
              if (!parsed.length) { flash('Nenhuma linha válida. Verifique coluna "nome".'); setImporting(false); e.target.value = ''; return; }

              // Validação de obrigatórios (após forward-fill)
              const OBRIG = ['nome', 'descricao', 'n1_gap', 'n2_desenvolvimento', 'n4_referencia'];
              const invalidos = parsed.filter(c => OBRIG.some(k => !c[k]?.trim()));
              if (invalidos.length > 0) {
                flash(`${invalidos.length} linha(s) sem obrigatórios (${OBRIG.join(', ')}). Linhas ignoradas.`);
                const validos = parsed.filter(c => OBRIG.every(k => c[k]?.trim()));
                if (validos.length === 0) { setImporting(false); e.target.value = ''; return; }
                parsed.length = 0; parsed.push(...validos);
              }
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
        return cargos.length > 0 ? (
          <div className="flex items-center gap-2 mb-3">
            <Filter size={14} className="text-gray-400" />
            <select value={filtroCargo} onChange={e => setFiltroCargo(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-xs text-white border border-white/10 outline-none" style={{ background: '#091D35' }}>
              <option value="">Todos os cargos</option>
              {cargos.map(c => <option key={c} value={c}>{c}</option>)}
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

      {/* Table — agrupada por competência */}
      {!loadingComps && comps.length > 0 && (() => {
        // Agrupar por cod_comp (ou nome se não tiver cod)
        const filtered = comps.filter(c => !filtroCargo || c.cargo === filtroCargo);
        const grupos = {};
        filtered.forEach(c => {
          const key = c.cod_comp || c.nome;
          if (!grupos[key]) grupos[key] = { comp: c, descritores: [] };
          if (c.cod_desc || c.nome_curto || c.descritor_completo) {
            grupos[key].descritores.push(c);
          } else if (!grupos[key].descritores.length) {
            // Competência sem descritores — é a própria linha
            grupos[key].descritores.push(c);
          }
        });
        const uniqueComps = Object.values(grupos);
        const compCount = uniqueComps.length;
        const descCount = filtered.length;

        return (
        <div className="mb-6">
          <p className="text-[10px] text-gray-500 mb-2">{compCount} competências · {descCount} descritores</p>
          <div className="space-y-2">
            {uniqueComps.map(({ comp: c, descritores }) => (
              <div key={c.cod_comp || c.id} className="rounded-xl border border-white/[0.06] overflow-hidden" style={{ background: '#0F2A4A' }}>
                {/* Competência header */}
                <div className="flex items-center gap-4 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">{c.nome}</span>
                      <span className="text-[9px] font-mono text-cyan-400/70 bg-cyan-400/10 px-1.5 py-0.5 rounded">{c.cod_comp}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {c.pilar && <span className="text-[10px] text-gray-300">{c.pilar}</span>}
                      {descritores.length > 0 && <span className="text-[10px] text-gray-500">· {descritores.length} descritores</span>}
                    </div>
                    {c.descricao && <p className="text-[10px] text-gray-400 mt-1 truncate max-w-lg">{c.descricao}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => openEdit(c)} className="w-7 h-7 flex items-center justify-center rounded text-gray-500 hover:text-cyan-400"><Pencil size={13} /></button>
                    <button onClick={() => {
                      if (!confirm(`Excluir "${c.nome}" e todos os seus descritores?`)) return;
                      Promise.all(descritores.map(d => excluirCompetencia(d.id))).then(() => {
                        flash('Competência excluída');
                        handleSelectEmpresa(empresaId);
                      });
                    }} className="w-7 h-7 flex items-center justify-center rounded text-gray-500 hover:text-red-400"><Trash2 size={13} /></button>
                  </div>
                </div>

                {/* Descritores */}
                {descritores.length > 0 && descritores[0].cod_desc && (
                  <div className="border-t border-white/[0.04]">
                    <div className="divide-y divide-white/[0.02]">
                      {descritores.map(d => (
                        <div key={d.id} className="px-4 py-2 text-[11px] text-gray-200 hover:bg-white/[0.02]">
                          {d.nome_curto || d.descritor_completo || '—'}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        );
      })()}

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
              <option value="">Selecione um cargo...</option>
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
                <button onClick={() => handleCopy(b.id)} disabled={!cargoParaCopiar}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all shrink-0 ${cargoParaCopiar ? 'text-cyan-400 border-cyan-400/30 hover:bg-cyan-400/10' : 'text-gray-600 border-white/5 cursor-not-allowed'}`}>
                  <Copy size={12} /> {cargoParaCopiar ? `→ ${cargoParaCopiar}` : 'Copiar'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onMouseDown={e => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div className="rounded-xl border border-white/10 w-full max-w-lg mx-4 p-6" style={{ background: '#0F2A4A' }}>
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
