'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Layers, Download, Target, GraduationCap } from 'lucide-react';
import { loadPotencialCidades, type PotencialCidadeRow } from './actions';
import { getCidadeXlsxUrl } from '@/actions/radarempresas/busca';

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
const fmt = (n: number | null | undefined) => n == null ? '—' : Number(n).toLocaleString('pt-BR');
const fmtBrl = (n: number | null | undefined) => n == null ? '—' : `R$ ${Math.round(n).toLocaleString('pt-BR')}`;

export default function PotencialCidadesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<PotencialCidadeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [buscando, setBuscando] = useState(false);
  const [uf, setUf] = useState('');
  const [busca, setBusca] = useState('');
  const [baixando, setBaixando] = useState<string | null>(null);

  async function carregar() {
    setBuscando(true);
    const r = await loadPotencialCidades({ uf: uf || undefined, municipioBusca: busca || undefined });
    if ('ok' in r) setRows(r.rows);
    setBuscando(false); setLoading(false);
  }
  useEffect(() => { carregar(); /* eslint-disable-line */ }, []);

  async function baixarXlsx(c: PotencialCidadeRow) {
    if (!c.emp?.xlsx_path) return;
    setBaixando(c.municipio_ibge);
    const url = await getCidadeXlsxUrl(c.emp.xlsx_path);
    setBaixando(null);
    if (url) window.open(url, '_blank'); else alert('Link indisponível.');
  }

  if (loading) return <div className="flex items-center justify-center h-dvh"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;

  const lista = rows.slice(0, 1000);

  return (
    <div className="max-w-[1280px] mx-auto px-4 py-6 sm:px-6" style={{ minHeight: '100dvh' }}>
      <div className="flex items-center gap-3 mb-2">
        <button onClick={() => router.push('/admin/dashboard')}
          className="w-9 h-9 flex items-center justify-center rounded-lg border border-white/10 text-gray-400 hover:text-white">
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Layers size={20} className="text-cyan-400" /> Potencial por Cidade
          </h1>
          <p className="text-xs text-gray-500">Visão unificada · Empresas e Escolas lado a lado (2 motores, mesma cidade)</p>
        </div>
      </div>

      <div className="mb-4 p-3 rounded-xl border border-white/[0.06] bg-white/[0.02] text-[11px] text-gray-400 leading-relaxed">
        Dois sinais distintos, <span className="text-gray-300 font-semibold">não somados</span>:
        <span className="text-cyan-300"> Empresas</span> = oportunidade B2B (Receita/CAGED/RAIS, snapshot mensal).
        <span className="text-violet-300"> Escolas</span> = TAM × fit pedagógico/financeiro (INEP/Censo, dados live).
      </div>

      <div className="flex items-center gap-2 mb-3">
        <select value={uf} onChange={e => setUf(e.target.value)}
          className="rounded-lg border border-white/10 bg-[#091D35] text-white text-xs px-2 py-1.5">
          <option value="">Todas UFs</option>
          {UFS.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Município..."
          onKeyDown={e => e.key === 'Enter' && carregar()}
          className="flex-1 rounded-lg border border-white/10 bg-[#091D35] text-white text-sm px-3 py-1.5 focus:outline-none focus:border-cyan-400/50" />
        <button onClick={carregar} disabled={buscando}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-[#0F2B54] bg-cyan-400 hover:brightness-110 disabled:opacity-50">
          {buscando ? <Loader2 size={13} className="animate-spin" /> : 'Filtrar'}
        </button>
        <span className="text-[11px] text-gray-500">{fmt(rows.length)} cidades</span>
      </div>

      <div className="rounded-xl border border-white/[0.06] overflow-x-auto" style={{ background: '#0F2A4A' }}>
        <table className="w-full text-[11px] min-w-[900px]">
          <thead>
            <tr className="text-gray-500 border-b border-white/[0.06]">
              <th className="px-3 py-2 text-left" rowSpan={2}>Município</th>
              <th className="px-3 py-1 text-center border-l border-white/[0.06] text-cyan-300" colSpan={5}>Empresas (B2B)</th>
              <th className="px-3 py-1 text-center border-l border-white/[0.06] text-violet-300" colSpan={4}>Escolas</th>
            </tr>
            <tr className="text-gray-600 border-b border-white/[0.06] text-[10px]">
              <th className="px-3 py-1 text-right border-l border-white/[0.06]">Prioriz.</th>
              <th className="px-3 py-1 text-right">Abordar</th>
              <th className="px-3 py-1 text-right">Redes</th>
              <th className="px-3 py-1 text-right">Score</th>
              <th className="px-3 py-1 text-center">XLSX</th>
              <th className="px-3 py-1 text-right border-l border-white/[0.06]">Escolas</th>
              <th className="px-3 py-1 text-right">Profs.</th>
              <th className="px-3 py-1 text-right">TAM/mês</th>
              <th className="px-3 py-1 text-right">Score</th>
            </tr>
          </thead>
          <tbody>
            {lista.map(c => (
              <tr key={c.municipio_ibge} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                <td className="px-3 py-2 text-white whitespace-nowrap">{c.municipio}<span className="text-gray-600">/{c.uf}</span></td>
                <td className="px-3 py-2 text-right text-cyan-300 font-semibold border-l border-white/[0.04]">{c.emp ? fmt(c.emp.n_priorizados) : '—'}</td>
                <td className="px-3 py-2 text-right text-gray-400">{c.emp ? fmt(c.emp.n_abordar) : '—'}</td>
                <td className="px-3 py-2 text-right text-gray-400">{c.emp ? fmt(c.emp.n_redes) : '—'}</td>
                <td className="px-3 py-2 text-right text-gray-400">{c.emp?.score_medio == null ? '—' : Math.round(c.emp.score_medio)}</td>
                <td className="px-3 py-2 text-center">
                  {c.emp?.xlsx_path ? (
                    <button onClick={() => baixarXlsx(c)} disabled={baixando === c.municipio_ibge}
                      className="inline-flex items-center px-1.5 py-1 rounded border border-white/10 text-cyan-300 hover:bg-white/[0.04] disabled:opacity-40">
                      {baixando === c.municipio_ibge ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
                    </button>
                  ) : <span className="text-gray-700">—</span>}
                </td>
                <td className="px-3 py-2 text-right text-violet-300 font-semibold border-l border-white/[0.04]">{c.esc ? fmt(c.esc.qt_escolas) : '—'}</td>
                <td className="px-3 py-2 text-right text-gray-400">{c.esc ? fmt(c.esc.qt_professores) : '—'}</td>
                <td className="px-3 py-2 text-right text-gray-400">{c.esc ? fmtBrl(c.esc.tam_mensal) : '—'}</td>
                <td className="px-3 py-2 text-right text-gray-400">{c.esc?.score == null ? '—' : fmt(Math.round(c.esc.score))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 1000 && <p className="text-[10px] text-gray-600 mt-2">Mostrando 1.000 de {fmt(rows.length)} — filtre por UF/município.</p>}

      <div className="flex gap-2 mt-5">
        <button onClick={() => router.push('/admin/vertho/radarempresas')}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-cyan-400/20 text-xs text-cyan-300 hover:bg-cyan-400/[0.06]">
          <Target size={13} /> Abrir Radar Empresas
        </button>
        <button onClick={() => router.push('/admin/vertho/mercado-potencial')}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-violet-400/20 text-xs text-violet-300 hover:bg-violet-400/[0.06]">
          <GraduationCap size={13} /> Abrir Mercado Potencial (Escolas)
        </button>
      </div>
    </div>
  );
}
