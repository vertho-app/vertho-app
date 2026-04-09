'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Loader2, BookOpen, ChevronDown, ExternalLink, Filter
} from 'lucide-react';
import { loadMoodleCatalogo, loadCatalogoEnriquecido, loadCobertura } from '@/actions/moodle-load';

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
  const [filtroCargo, setFiltroCargo] = useState('');

  useEffect(() => {
    Promise.all([
      loadMoodleCatalogo(empresaId),
      loadCatalogoEnriquecido(empresaId),
      loadCobertura(empresaId),
    ]).then(([cat, enr, cob]) => {
      setCatalogo(cat);
      setEnriquecido(enr);
      setCobertura(cob);
      setLoading(false);
    });
  }, [empresaId]);

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
              <div className="rounded-xl border border-white/[0.06] overflow-hidden" style={{ background: '#0F2A4A' }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06] text-[9px] font-bold text-gray-500 uppercase tracking-widest">
                      <th className="px-4 py-2 text-left">Curso</th>
                      <th className="px-4 py-2 text-left">Cargo</th>
                      <th className="px-4 py-2 text-left">Competência</th>
                      <th className="px-4 py-2 text-center w-12">Nível</th>
                      <th className="px-4 py-2 text-center w-16">Tempo</th>
                      <th className="px-4 py-2 text-center w-16">Conf.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.03]">
                    {enriquecido.filter(e => !filtroCargo || e.cargo === filtroCargo).map(e => (
                      <tr key={e.id} className="hover:bg-white/[0.02]">
                        <td className="px-4 py-2 text-xs text-white font-medium">{e.curso_nome}</td>
                        <td className="px-4 py-2 text-xs text-gray-400">{e.cargo || '—'}</td>
                        <td className="px-4 py-2 text-xs text-cyan-400">{e.competencia || '—'}</td>
                        <td className="px-4 py-2 text-xs text-center text-gray-400">N{e.nivel_ideal || '?'}</td>
                        <td className="px-4 py-2 text-xs text-center text-gray-500">{e.tempo_estimado_min ? `${e.tempo_estimado_min}min` : '—'}</td>
                        <td className="px-4 py-2 text-center">
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                            e.confianca === 'alta' ? 'bg-green-400/15 text-green-400' :
                            e.confianca === 'media' ? 'bg-amber-400/15 text-amber-400' :
                            'bg-gray-400/15 text-gray-400'
                          }`}>{e.confianca || '—'}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
                    <tr className="border-b border-white/[0.06] text-[9px] font-bold text-gray-500 uppercase tracking-widest">
                      <th className="px-4 py-2 text-left">Cargo</th>
                      <th className="px-4 py-2 text-left">Competência</th>
                      <th className="px-4 py-2 text-left">Descritor</th>
                      <th className="px-4 py-2 text-center">N1-N2</th>
                      <th className="px-4 py-2 text-center">N2-N3</th>
                      <th className="px-4 py-2 text-center w-16">%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.03]">
                    {cobertura.filter(c => !filtroCargo || c.cargo === filtroCargo).map(c => {
                      const s1 = STATUS_COLORS[c.n1_n2_status] || STATUS_COLORS.vermelho;
                      const s2 = STATUS_COLORS[c.n2_n3_status] || STATUS_COLORS.vermelho;
                      return (
                        <tr key={c.id} className="hover:bg-white/[0.02]">
                          <td className="px-4 py-2 text-xs text-gray-400">{c.cargo}</td>
                          <td className="px-4 py-2 text-xs text-white font-medium">{c.competencia}</td>
                          <td className="px-4 py-2 text-xs text-gray-500">{c.descritor}</td>
                          <td className="px-4 py-2 text-center">
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${s1.bg} ${s1.text}`}>{c.n1_n2_qtd || 0}</span>
                          </td>
                          <td className="px-4 py-2 text-center">
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${s2.bg} ${s2.text}`}>{c.n2_n3_qtd || 0}</span>
                          </td>
                          <td className="px-4 py-2 text-center">
                            <span className={`text-[9px] font-bold ${c.cobertura_pct >= 100 ? 'text-green-400' : c.cobertura_pct >= 50 ? 'text-amber-400' : 'text-red-400'}`}>{c.cobertura_pct || 0}%</span>
                          </td>
                        </tr>
                      );
                    })}
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
