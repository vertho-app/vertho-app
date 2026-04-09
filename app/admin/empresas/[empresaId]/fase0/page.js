'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Loader2, BookOpen, ChevronDown, ExternalLink, Filter, Pencil, Check, X
} from 'lucide-react';
import { loadMoodleCatalogo, loadCatalogoEnriquecido, loadCobertura, salvarCatalogoItem, loadDescritoresPorCompetencia } from '@/actions/moodle-load';
import { loadCompetencias } from '@/app/admin/competencias/actions';

const STATUS_COLORS = {
  verde: { bg: 'bg-green-400/15', text: 'text-green-400', label: 'Coberto' },
  amarelo: { bg: 'bg-amber-400/15', text: 'text-amber-400', label: 'Parcial' },
  vermelho: { bg: 'bg-red-400/15', text: 'text-red-400', label: 'Gap' },
};

export default function Fase0Page({ params }) {
  const { empresaId } = use(params);
  const router = useRouter();

  const [tab, setTab] = useState('catalogo');
  const [loading, setLoading] = useState(true);
  const [catalogo, setCatalogo] = useState([]);
  const [enriquecido, setEnriquecido] = useState([]);
  const [cobertura, setCobertura] = useState([]);
  const [competencias, setCompetencias] = useState([]);
  const [filtroCargo, setFiltroCargo] = useState('');
  const [editId, setEditId] = useState(null);
  const [editData, setEditData] = useState({});
  const [toast, setToast] = useState(null);
  function flash(msg) { setToast(msg); setTimeout(() => setToast(null), 2500); }

  async function refresh() {
    const [cat, enr, cob, compsR] = await Promise.all([
      loadMoodleCatalogo(empresaId),
      loadCatalogoEnriquecido(empresaId),
      loadCobertura(empresaId),
      loadCompetencias(empresaId),
    ]);
    setCatalogo(cat);
    setEnriquecido(enr);
    setCobertura(cob);
    if (compsR.success) setCompetencias(compsR.data || []);
    setLoading(false);
  }

  useEffect(() => { refresh(); }, [empresaId]);

  // Competências únicas por cargo para dropdown
  const compsPorCargo = {};
  competencias.forEach(c => {
    const cargo = c.cargo || '_geral';
    if (!compsPorCargo[cargo]) compsPorCargo[cargo] = new Set();
    compsPorCargo[cargo].add(c.nome);
  });
  const getCompsDropdown = (cargo) => [...(compsPorCargo[cargo] || compsPorCargo._geral || new Set())].sort();

  const cargosEnr = [...new Set(enriquecido.map(e => e.cargo).filter(Boolean))].sort();
  const cargosCob = [...new Set(cobertura.map(c => c.cargo).filter(Boolean))].sort();

  const cobStats = {
    total: cobertura.length,
    verde: cobertura.filter(c => c.n1_n2_status === 'verde' && c.n2_n3_status === 'verde').length,
    amarelo: cobertura.filter(c => (c.n1_n2_status === 'amarelo' || c.n2_n3_status === 'amarelo') && c.n1_n2_status !== 'vermelho' && c.n2_n3_status !== 'vermelho').length,
    vermelho: cobertura.filter(c => c.n1_n2_status === 'vermelho' || c.n2_n3_status === 'vermelho').length,
  };

  if (loading) return <div className="flex items-center justify-center h-dvh"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-6 sm:px-6" style={{ minHeight: '100dvh' }}>
      {toast && <div className="fixed top-4 right-4 z-50 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold shadow-lg">{toast}</div>}

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push(`/admin/empresas/${empresaId}`)}
          className="w-9 h-9 flex items-center justify-center rounded-lg border border-white/10 text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <BookOpen size={20} className="text-cyan-400" /> Moodle — Catálogo e Cobertura
          </h1>
          <p className="text-xs text-gray-500">{catalogo.length} cursos importados · {enriquecido.length} catalogados · {cobertura.length} análises</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 p-1 rounded-xl border border-white/[0.06]" style={{ background: '#091D35' }}>
        {[
          { key: 'catalogo', label: `Catálogo (${catalogo.length})` },
          { key: 'enriquecido', label: `Catalogado IA (${enriquecido.length})` },
          { key: 'cobertura', label: `Cobertura (${cobertura.length})` },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition-all ${
              tab === t.key ? 'bg-white/[0.06] text-white' : 'text-gray-500 hover:text-gray-300'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══ CATÁLOGO MOODLE ═══ */}
      {tab === 'catalogo' && (
        <div>
          {catalogo.length === 0 ? (
            <Empty text="Catálogo vazio. Rode 'Importar Catálogo' no pipeline." />
          ) : (
            <div className="rounded-xl border border-white/[0.06] overflow-hidden" style={{ background: '#0F2A4A' }}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] text-[9px] font-bold text-gray-500 uppercase tracking-widest">
                    <th className="px-4 py-2 text-left">Curso</th>
                    <th className="px-4 py-2 text-center w-16">Seções</th>
                    <th className="px-4 py-2 text-center w-16">Módulos</th>
                    <th className="px-4 py-2 text-center w-16">Link</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03]">
                  {catalogo.map(c => (
                    <tr key={c.id} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-2 text-xs text-white font-medium">{c.curso_nome}</td>
                      <td className="px-4 py-2 text-xs text-gray-400 text-center">{c.qtd_secoes}</td>
                      <td className="px-4 py-2 text-xs text-gray-400 text-center">{c.qtd_modulos}</td>
                      <td className="px-4 py-2 text-center">
                        {c.curso_url && <a href={c.curso_url} target="_blank" className="text-cyan-400 hover:text-cyan-300"><ExternalLink size={12} /></a>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══ CATALOGADO IA ═══ */}
      {tab === 'enriquecido' && (
        <div>
          {enriquecido.length === 0 ? (
            <Empty text="Nenhum conteúdo catalogado. Rode 'Catalogar Conteúdos' no pipeline." />
          ) : (
            <>
              {cargosEnr.length > 1 && (
                <div className="flex items-center gap-2 mb-3">
                  <Filter size={14} className="text-gray-400" />
                  <select value={filtroCargo} onChange={e => setFiltroCargo(e.target.value)}
                    className="px-3 py-1.5 rounded-lg text-xs text-white border border-white/10 outline-none" style={{ background: '#091D35' }}>
                    <option value="">Todos os cargos</option>
                    {cargosEnr.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              )}
              <div className="space-y-2">
                {enriquecido.filter(e => !filtroCargo || e.cargo === filtroCargo).map((e, idx) => {
                  const descritores = [e.descritor_1, e.descritor_2, e.descritor_3].filter(Boolean);
                  const isEditing = editId === e.id;
                  const bgColor = idx % 2 === 0 ? '#0F2A4A' : '#0A2240';
                  const compsOptions = getCompsDropdown(e.cargo || filtroCargo);

                  return (
                    <div key={e.id} className="rounded-xl border border-white/[0.06] overflow-hidden" style={{ background: bgColor }}>
                      {/* Header do curso */}
                      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.04]">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-bold text-white">{e.curso_nome}</span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                            e.confianca === 'alta' ? 'bg-green-400/15 text-green-400' :
                            e.confianca === 'media' ? 'bg-amber-400/15 text-amber-400' : 'bg-gray-400/15 text-gray-400'
                          }`}>{e.confianca || '—'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {isEditing ? (
                            <>
                              <button onClick={async () => {
                                const r = await salvarCatalogoItem(e.id, editData);
                                setEditId(null);
                                if (r.success) { flash('Salvo'); refresh(); }
                                else flash('Erro: ' + r.error);
                              }} className="text-green-400 hover:text-green-300"><Check size={14} /></button>
                              <button onClick={() => setEditId(null)} className="text-gray-500 hover:text-white"><X size={14} /></button>
                            </>
                          ) : (
                            <button onClick={() => { setEditId(e.id); setEditData({
                              competencia: e.competencia || '', nivel_ideal: e.nivel_ideal || 2,
                              descritor_1: e.descritor_1 || '', descritor_2: e.descritor_2 || '', descritor_3: e.descritor_3 || '',
                              nivel_desc_1: e.nivel_desc_1 || e.nivel_ideal || 2, nivel_desc_2: e.nivel_desc_2 || e.nivel_ideal || 2, nivel_desc_3: e.nivel_desc_3 || e.nivel_ideal || 2,
                            }); }}
                              className="text-gray-600 hover:text-cyan-400"><Pencil size={14} /></button>
                          )}
                        </div>
                      </div>

                      {/* Competência editável */}
                      <div className="px-4 py-2 flex items-center gap-3 border-b border-white/[0.03]">
                        <span className="text-[9px] text-gray-500 uppercase w-20 shrink-0">Competência</span>
                        {isEditing ? (
                          <select value={editData.competencia} onChange={async ev => {
                            const novaComp = ev.target.value;
                            setEditData(p => ({ ...p, competencia: novaComp }));
                            // Atualizar descritores ao mudar competência
                            if (novaComp) {
                              const descs = await loadDescritoresPorCompetencia(empresaId, novaComp, e.cargo || filtroCargo);
                              setEditData(p => ({
                                ...p, competencia: novaComp,
                                descritor_1: descs[0] || null, descritor_2: descs[1] || null, descritor_3: descs[2] || null,
                                nivel_desc_1: p.nivel_desc_1 || e.nivel_ideal, nivel_desc_2: p.nivel_desc_2 || e.nivel_ideal, nivel_desc_3: p.nivel_desc_3 || e.nivel_ideal,
                              }));
                            }
                          }}
                            className="flex-1 px-2 py-1 rounded text-xs text-white border border-white/10 bg-[#091D35] outline-none">
                            <option value="">Selecione...</option>
                            {compsOptions.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        ) : (
                          <span className="text-xs text-cyan-400 font-medium">{e.competencia || '—'}</span>
                        )}
                        <span className="text-[9px] text-gray-600 ml-auto">{e.tempo_estimado_min ? `${e.tempo_estimado_min}min` : ''}</span>
                      </div>

                      {/* Descritores com nível individual */}
                      <div className="divide-y divide-white/[0.02]">
                        {[
                          { key: 'descritor_1', nivelKey: 'nivel_desc_1', val: isEditing ? editData.descritor_1 : e.descritor_1, nivel: isEditing ? editData.nivel_desc_1 : e.nivel_desc_1 },
                          { key: 'descritor_2', nivelKey: 'nivel_desc_2', val: isEditing ? editData.descritor_2 : e.descritor_2, nivel: isEditing ? editData.nivel_desc_2 : e.nivel_desc_2 },
                          { key: 'descritor_3', nivelKey: 'nivel_desc_3', val: isEditing ? editData.descritor_3 : e.descritor_3, nivel: isEditing ? editData.nivel_desc_3 : e.nivel_desc_3 },
                        ].filter(d => d.val).map((d, di) => (
                          <div key={di} className="px-4 py-1.5 flex items-center gap-2">
                            <span className="text-[9px] text-gray-600 w-20 shrink-0">Descritor {di + 1}</span>
                            <span className="text-[10px] text-gray-400 flex-1">{d.val}</span>
                            {isEditing ? (
                              <select value={d.nivel || e.nivel_ideal || 2} onChange={ev => setEditData(p => ({ ...p, [d.nivelKey]: Number(ev.target.value) }))}
                                className="w-14 px-1 py-0.5 rounded text-[10px] text-white border border-white/10 bg-[#091D35] outline-none">
                                <option value="1">N1</option><option value="2">N2</option><option value="3">N3</option><option value="4">N4</option>
                              </select>
                            ) : (
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                (d.nivel || e.nivel_ideal) >= 3 ? 'bg-green-400/15 text-green-400' :
                                (d.nivel || e.nivel_ideal) >= 2 ? 'bg-amber-400/15 text-amber-400' : 'bg-red-400/15 text-red-400'
                              }`}>N{d.nivel || e.nivel_ideal || '?'}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══ COBERTURA ═══ */}
      {tab === 'cobertura' && (
        <div>
          {cobertura.length === 0 ? (
            <Empty text="Nenhuma análise. Rode 'Cobertura' no pipeline." />
          ) : (
            <>
              {/* Stats */}
              <div className="flex items-center gap-3 mb-4 text-[10px]">
                <span className="text-gray-400">Total: <span className="text-white font-bold">{cobStats.total}</span></span>
                {cobStats.verde > 0 && <span className="bg-green-400/15 text-green-400 px-1.5 py-0.5 rounded font-bold">{cobStats.verde} cobertos</span>}
                {cobStats.amarelo > 0 && <span className="bg-amber-400/15 text-amber-400 px-1.5 py-0.5 rounded font-bold">{cobStats.amarelo} parciais</span>}
                {cobStats.vermelho > 0 && <span className="bg-red-400/15 text-red-400 px-1.5 py-0.5 rounded font-bold">{cobStats.vermelho} gaps</span>}
              </div>

              {cargosCob.length > 1 && (
                <div className="flex items-center gap-2 mb-3">
                  <Filter size={14} className="text-gray-400" />
                  <select value={filtroCargo} onChange={e => setFiltroCargo(e.target.value)}
                    className="px-3 py-1.5 rounded-lg text-xs text-white border border-white/10 outline-none" style={{ background: '#091D35' }}>
                    <option value="">Todos os cargos</option>
                    {cargosCob.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              )}

              <div className="rounded-xl border border-white/[0.06] overflow-hidden" style={{ background: '#0F2A4A' }}>
                <table className="w-full text-sm">
                  <thead>
                    {(() => {
                      const cobFiltered = cobertura.filter(c => !filtroCargo || c.cargo === filtroCargo);
                      const temDescritores = cobFiltered.some(c => c.descritor && c.descritor !== '(geral)');
                      return (
                    <tr className="border-b border-white/[0.06] text-[9px] font-bold text-gray-500 uppercase tracking-widest">
                      <th className="px-4 py-2 text-left">Competência</th>
                      {temDescritores && <th className="px-4 py-2 text-left">Descritor</th>}
                      <th className="px-4 py-2 text-center">N1-N2</th>
                      <th className="px-4 py-2 text-center">N2-N3</th>
                      <th className="px-4 py-2 text-center w-16">Cobertura</th>
                    </tr>
                      );
                    })()}
                  </thead>
                  <tbody className="divide-y divide-white/[0.03]">
                    {(() => {
                      const cobFiltered = cobertura.filter(c => !filtroCargo || c.cargo === filtroCargo);
                      const temDescritores = cobFiltered.some(c => c.descritor && c.descritor !== '(geral)');
                      return cobFiltered.map(c => {
                      const s1 = STATUS_COLORS[c.n1_n2_status] || STATUS_COLORS.vermelho;
                      const s2 = STATUS_COLORS[c.n2_n3_status] || STATUS_COLORS.vermelho;
                      return (
                        <tr key={c.id} className="hover:bg-white/[0.02]">
                          <td className="px-4 py-2 text-xs text-white font-medium">{c.competencia}</td>
                          {temDescritores && <td className="px-4 py-2 text-xs text-gray-400">{c.descritor && c.descritor !== '(geral)' ? c.descritor : '—'}</td>}
                          <td className="px-4 py-2 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${s1.bg} ${s1.text}`}>{s1.label}</span>
                              <span className="text-[8px] text-gray-600">({c.n1_n2_qtd || 0})</span>
                            </div>
                            {c.n1_n2_cursos && <p className="text-[8px] text-gray-600 mt-0.5 truncate max-w-[150px]">{c.n1_n2_cursos}</p>}
                          </td>
                          <td className="px-4 py-2 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${s2.bg} ${s2.text}`}>{s2.label}</span>
                              <span className="text-[8px] text-gray-600">({c.n2_n3_qtd || 0})</span>
                            </div>
                            {c.n2_n3_cursos && <p className="text-[8px] text-gray-600 mt-0.5 truncate max-w-[150px]">{c.n2_n3_cursos}</p>}
                          </td>
                          <td className="px-4 py-2 text-center">
                            <span className={`text-sm font-bold ${c.cobertura_pct >= 100 ? 'text-green-400' : c.cobertura_pct >= 50 ? 'text-amber-400' : 'text-red-400'}`}>{c.cobertura_pct || 0}%</span>
                          </td>
                        </tr>
                      );
                    });
                    })()}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Empty({ text }) {
  return (
    <div className="text-center py-12">
      <BookOpen size={32} className="text-gray-600 mx-auto mb-3" />
      <p className="text-sm text-gray-500">{text}</p>
    </div>
  );
}
