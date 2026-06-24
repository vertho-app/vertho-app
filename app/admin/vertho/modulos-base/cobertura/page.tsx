'use client';

// Cobertura de conteúdo por DESCRITOR: pra a empresa escolhida, mostra a matriz
// competência × descritor do modelo dela e quantos módulos-base existem em cada
// célula (publicados/rascunhos + melhor nota da auditoria). Ver docs/MODULOS-BASE-CONTEUDO.md.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import BackButton from '@/components/back-button';
import { coberturaPorDescritor } from '@/actions/modulos-base';
import { listarEmpresasParaEscopo } from '@/actions/extracao-video';

export default function CoberturaPage() {
  const [empresas, setEmpresas] = useState<{ id: string; nome: string }[]>([]);
  const [empresaId, setEmpresaId] = useState('');
  const [pilar, setPilar] = useState('');
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => { listarEmpresasParaEscopo().then((r) => setEmpresas(r.data || [])); }, []);

  async function carregar(pilarSel?: string) {
    if (!empresaId) return;
    setBusy(true); setErro('');
    const r: any = await coberturaPorDescritor(empresaId, { pilar: pilarSel ?? (pilar || undefined) });
    setBusy(false);
    if (r.error) { setErro(r.error); return; }
    setData(r);
  }
  useEffect(() => { if (empresaId) carregar(); /* eslint-disable-next-line */ }, [empresaId]);

  const resumo = data?.resumo;

  return (
    <div className="max-w-[1000px] mx-auto px-4 py-6 sm:px-6" style={{ minHeight: '100dvh' }}>
      <BackButton href="/admin/vertho/modulos-base" />
      <div className="mb-5">
        <h1 className="text-xl font-bold text-white">📊 Cobertura por descritor</h1>
        <p className="text-xs text-gray-500">Quantos módulos-base existem em cada (competência × descritor) do modelo da empresa — para ver o que falta produzir.</p>
      </div>

      <div className="flex flex-wrap items-end gap-2 mb-4">
        <label className="text-[11px] text-white/60">Empresa
          <select value={empresaId} onChange={(e) => { setEmpresaId(e.target.value); setPilar(''); setData(null); }}
            className="mt-1 block w-64 bg-[#091D35] border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
            <option value="">— escolha —</option>
            {empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
        </label>
        {data?.pilares?.length > 0 && (
          <label className="text-[11px] text-white/60">Pilar
            <select value={pilar} onChange={(e) => { setPilar(e.target.value); carregar(e.target.value || undefined); }}
              className="mt-1 block w-56 bg-[#091D35] border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
              <option value="">Todos os pilares</option>
              {data.pilares.map((p: string) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
        )}
      </div>

      {erro && <div className="rounded-lg border border-red-400/30 bg-red-400/10 p-3 mb-4 text-sm text-red-200">{erro}</div>}
      {busy && <div className="text-white/50 text-sm py-3">Carregando…</div>}

      {resumo && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            ['Células do modelo', resumo.totalCels],
            ['Cobertas (≥1 publicado)', resumo.cobertas],
            ['Módulos da empresa', resumo.modulos],
          ].map(([l, v]) => (
            <div key={l as string} className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
              <div className="text-2xl font-bold text-white">{v as number}</div>
              <div className="text-[11px] text-white/50">{l as string}</div>
            </div>
          ))}
        </div>
      )}

      {data?.competencias?.map((c: any) => (
        <div key={c.cod_comp || c.nome} className="mb-5 rounded-xl bg-white/5 border border-white/10 overflow-hidden">
          <div className="px-3 py-2 bg-white/5 flex items-center gap-2">
            <span className="text-[10px] font-mono text-cyan-300">{c.cod_comp}</span>
            <h2 className="text-sm font-bold text-white">{c.nome}</h2>
            <span className="text-[10px] text-white/35">{c.pilar}</span>
            <span className="ml-auto text-[10px] text-white/40">
              {c.descritores.filter((d: any) => d.publicados > 0).length}/{c.descritores.filter((d: any) => !d.cod_desc.startsWith('(')).length} descritores cobertos
            </span>
          </div>
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase text-white/40">
              <tr>
                <th className="text-left px-3 py-1.5 w-16">Cód</th>
                <th className="text-left px-3 py-1.5">Descritor</th>
                <th className="px-2 py-1.5 w-20">Módulos</th>
                <th className="px-2 py-1.5 w-16">Public.</th>
                <th className="px-2 py-1.5 w-16">Rasc.</th>
                <th className="px-2 py-1.5 w-16">Nota</th>
              </tr>
            </thead>
            <tbody>
              {c.descritores.map((d: any) => {
                const vazia = d.total === 0;
                const semPub = d.total > 0 && d.publicados === 0;
                return (
                  <tr key={d.cod_desc} className="border-t border-white/[0.06]">
                    <td className="px-3 py-2 font-mono text-[11px] text-white/50">{d.cod_desc}</td>
                    <td className="px-3 py-2 text-[12px] text-white/75">{d.descritor}</td>
                    <td className="px-2 py-2 text-center">
                      <span className={`inline-block min-w-[22px] rounded-full px-1.5 text-[11px] font-bold ${vazia ? 'bg-white/5 text-white/30' : 'bg-cyan-400/15 text-cyan-200'}`}>{d.total}</span>
                    </td>
                    <td className="px-2 py-2 text-center text-[12px] text-emerald-300">{d.publicados || '—'}</td>
                    <td className="px-2 py-2 text-center text-[12px] text-amber-300/80">{d.rascunhos || '—'}</td>
                    <td className="px-2 py-2 text-center text-[12px]">
                      {d.melhorNota != null
                        ? <span className={d.melhorNota >= 7 ? 'text-emerald-300' : 'text-amber-300'}>{d.melhorNota.toFixed(1)}</span>
                        : <span className="text-white/25">—</span>}
                      {vazia && <span className="ml-1 text-red-400/70" title="sem conteúdo">●</span>}
                      {semPub && <span className="ml-1 text-amber-400/70" title="só rascunho">●</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}

      {data && !data.competencias?.length && <p className="text-white/40 text-sm">Nenhuma competência no modelo dessa empresa{pilar ? ` no pilar ${pilar}` : ''}.</p>}

      {data?.competencias?.length > 0 && (
        <p className="text-[11px] text-white/35 mt-2">
          <span className="text-red-400/70">●</span> sem conteúdo · <span className="text-amber-400/70">●</span> só rascunho. O match módulo→descritor é por similaridade de texto; ajuste fino com o <Link href="/admin/vertho/modulos-base" className="text-cyan-400 hover:underline">catálogo de módulos</Link>.
        </p>
      )}
    </div>
  );
}
