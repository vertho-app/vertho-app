'use client';
import { useEffect, useState } from 'react';
import { fetchAuth } from '@/lib/auth/fetch-auth';
import type { SessaoPublica } from '@/lib/simulador-vendas/core';
import Relatorio from './relatorio';
type Treino = SessaoPublica & { nomeVendedor: string; testeAdmin: boolean };
export default function Gestao({ empresaId }: { empresaId: string }) {
  const [pagina, setPagina] = useState(0), [dados, setDados] = useState<{ total: number; treinos: Treino[] } | null>(null);
  const [erro, setErro] = useState(''), [ocupado, setOcupado] = useState(false), [selecionado, setSelecionado] = useState<Treino | null>(null);
  async function carregar(p: number) {
    const r = await fetchAuth(`/api/simulador-vendas/gestao?empresaId=${encodeURIComponent(empresaId)}&pagina=${p}`, { cache: 'no-store' });
    const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Não foi possível consultar o histórico.'); return d;
  }
  useEffect(() => {
    let alive = true; setOcupado(true); setErro('');
    carregar(pagina).then(d => { if (alive) setDados(d); }).catch(e => { if (alive) setErro(e.message); }).finally(() => { if (alive) setOcupado(false); });
    return () => { alive = false; };
  }, [empresaId, pagina]);
  async function exportar() {
    setOcupado(true); setErro('');
    try {
      const rows: Treino[] = []; let total = 0;
      for (let p = 0; ; p++) { const d = await carregar(p); total = d.total; rows.push(...d.treinos); if (rows.length >= total || d.treinos.length === 0) break; }
      if (rows.length !== total) throw new Error('O histórico mudou durante a exportação. Tente novamente.');
      const cell = (v: unknown) => { const s = String(v ?? ''); return '"' + (/^[=+@\-\t\r]/.test(s) ? "'" : '') + s.replace(/"/g, '""') + '"'; };
      const csv = [['Participante', 'Teste administrativo', 'Data', 'Nível', 'Estado', 'P', 'A', 'C', 'E', 'Média', 'Resumo'], ...rows.map(r => [r.nomeVendedor, r.testeAdmin ? 'Sim' : 'Não', r.criadoEm, r.nivel, r.status, r.relatorio?.P, r.relatorio?.A, r.relatorio?.C, r.relatorio?.E, r.relatorio?.Media, r.relatorio?.Resumo])].map(row => row.map(cell).join(';')).join('\r\n');
      const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = 'treinos-vendas-pace.csv'; link.click(); URL.revokeObjectURL(url);
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível exportar.'); } finally { setOcupado(false); }
  }
  return <section><div className="flex justify-between gap-4 items-center mb-5"><p className="text-sm text-slate-300">{dados?.total ?? '…'} treinos nesta empresa</p><button onClick={exportar} disabled={ocupado || !dados?.total}>Exportar histórico CSV</button></div>
    {erro && <p role="alert" className="text-amber-200 my-3">{erro}</p>}
    <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr className="text-slate-400 border-b border-white/10">{['Participante', 'Data', 'Estado', 'Nota PACE', 'Relatório'].map(h => <th key={h} className="py-3 pr-4 font-medium">{h}</th>)}</tr></thead>
      <tbody>{dados?.treinos.map(r => <tr key={r.id} className="border-b border-white/10"><td className="py-3 pr-4">{r.nomeVendedor}{r.testeAdmin && <small className="block text-slate-400">Teste administrativo</small>}</td><td className="pr-4 whitespace-nowrap">{new Date(r.criadoEm).toLocaleDateString('pt-BR')}</td><td className="pr-4">{r.status.replace('_', ' ')}</td><td className="pr-4">{r.relatorio?.Media ?? '—'}</td><td><button disabled={!r.relatorio} onClick={() => setSelecionado(r)}>Ver relatório</button></td></tr>)}</tbody></table></div>
    {dados?.total === 0 && <p className="text-slate-400 py-8">O histórico aparecerá aqui após o primeiro treino.</p>}
    <div className="flex items-center gap-3 mt-5"><button disabled={ocupado || pagina === 0} onClick={() => setPagina(p => p - 1)}>Anterior</button><span className="text-sm">Página {pagina + 1}</span><button disabled={ocupado || (pagina + 1) * 50 >= (dados?.total || 0)} onClick={() => setPagina(p => p + 1)}>Próxima</button></div>
    {selecionado?.relatorio && <div className="border border-white/15 rounded-xl p-5 mt-6"><div className="flex justify-between items-center mb-5"><p>{selecionado.nomeVendedor}</p><button onClick={() => setSelecionado(null)}>Fechar relatório</button></div><Relatorio relatorio={selecionado.relatorio}/></div>}
  </section>;
}
