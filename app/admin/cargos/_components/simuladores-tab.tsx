'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Loader2, RefreshCw, Save, Search } from 'lucide-react';
import { toast } from 'sonner';
import { carregarAcessosSimuladores, salvarAcessoSimuladores } from '../simuladores-actions';
import { SIMULADORES, type AcessoSimuladores, type Simulador } from '@/lib/simuladores/acesso-cargo';

type Cargo = { id: string; nome: string; acesso: AcessoSimuladores };

export default function SimuladoresTab({ empresaId }: { empresaId: string }) {
  const t = useTranslations('AdminSimuladores');
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [edits, setEdits] = useState<Record<string, AcessoSimuladores>>({});
  const [habilitados, setHabilitados] = useState<AcessoSimuladores | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [recarregar, setRecarregar] = useState(0);

  useEffect(() => {
    let ativo = true;
    carregarAcessosSimuladores(empresaId).then(result => {
      if (!ativo) return;
      if (!result.success) { setErro(result.error); return; }
      setCargos(result.cargos);
      setEdits(Object.fromEntries(result.cargos.map(c => [c.id, { ...c.acesso }])));
      setHabilitados(result.habilitados);
    }).catch(() => { if (ativo) setErro(t('loadError')); })
      .finally(() => { if (ativo) setLoading(false); });
    return () => { ativo = false; };
  }, [empresaId, recarregar, t]);

  async function salvar() {
    if (salvando || !alterados.length) return;
    setSalvando(true);
    const alteracoes = alterados.map(cargo => ({ cargoId: cargo.id, acesso: { ...edits[cargo.id] }, anterior: cargo.acesso }));
    try {
      const result = await salvarAcessoSimuladores({ empresaId, cargos: alteracoes });
      if (!result.success) { toast.error(result.error); return; }
      const salvos = new Map(alteracoes.map(c => [c.cargoId, c.acesso]));
      setCargos(prev => prev.map(c => salvos.has(c.id) ? { ...c, acesso: salvos.get(c.id)! } : c));
      toast.success(t('saved'));
    } catch { toast.error(t('saveError')); }
    finally { setSalvando(false); }
  }

  const links: Record<Simulador, string> = {
    vendas: `/admin/simulador-vendas?empresa=${empresaId}`,
    atendimento: `/admin/treino-atendimento?empresa=${empresaId}`,
    lideranca: `/admin/fit?empresa=${empresaId}&tab=prontidao`,
  };
  const visiveis = cargos.filter(c => c.nome.toLocaleLowerCase().includes(busca.toLocaleLowerCase().trim()));
  const alterados = cargos.filter(c => SIMULADORES.some(s => edits[c.id]?.[s] !== c.acesso[s]));
  const pendentes = alterados.length;

  if (loading) return <div role="status" className="flex items-center justify-center gap-2 py-12 text-gray-300"><Loader2 size={20} className="animate-spin" />{t('loading')}</div>;
  if (erro) return <div role="alert" className="rounded-xl border border-red-400/25 bg-red-400/5 p-5 text-sm text-red-200">
    <p>{erro}</p><button onClick={() => { setLoading(true); setErro(''); setRecarregar(v => v + 1); }} className="mt-3 inline-flex items-center gap-2 underline"><RefreshCw size={14} />{t('retry')}</button>
  </div>;

  return <div className="space-y-5">
    <div>
      <h2 className="text-lg font-semibold text-white">{t('title')}</h2>
      <p className="mt-1 text-sm leading-relaxed text-gray-300">{t('description')}</p>
      <p className="mt-2 text-xs leading-relaxed text-gray-400">{t('defaults')}</p>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      {SIMULADORES.map(sim => <Link key={sim} href={links[sim]} className="rounded-xl border border-white/10 bg-[#0F2A4A] p-4 hover:border-cyan-400/40">
        <div className="text-sm font-semibold text-white">{t(sim)}</div>
        <div className={`mt-2 text-xs ${habilitados?.[sim] ? 'text-emerald-300' : 'text-amber-200'}`}>{t(habilitados?.[sim] ? 'enabled' : 'disabled')}</div>
        <div className="mt-2 text-xs text-cyan-300">{t('configure')} →</div>
      </Link>)}
    </div>
    <p className="rounded-xl border border-cyan-400/15 bg-cyan-400/5 p-3 text-xs leading-relaxed text-cyan-100/85">{t('leadershipHint')}</p>
    {cargos.length === 0 ? <p className="py-10 text-center text-sm text-gray-400">{t('empty')}</p> : <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex w-full max-w-sm items-center gap-2 rounded-lg border border-white/10 bg-[#0F2A4A] px-3 py-2 text-gray-400">
          <Search size={16} /><input aria-label={t('search')} placeholder={t('search')} value={busca} onChange={e => setBusca(e.target.value)} className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none" />
        </label>
        <p aria-live="polite" className="text-xs text-gray-400">{pendentes ? t('pending', { count: pendentes }) : t('allSaved')}</p>
      </div>
      <div className="relative overflow-x-auto rounded-xl border border-white/10 bg-[#0F2A4A]">
        <table className="w-full text-sm">
          <caption className="sr-only">{t('title')}</caption>
          <thead className="border-b border-white/10 bg-white/[0.03] text-gray-300"><tr>
            <th scope="col" className="px-4 py-3 text-left">{t('role')}</th>
            {SIMULADORES.map(sim => <th scope="col" key={sim} className="px-3 py-3 text-center text-xs">{t(sim)}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-white/[0.06]">
            {visiveis.map(cargo => {
              const alterado = SIMULADORES.some(s => edits[cargo.id]?.[s] !== cargo.acesso[s]);
              return <tr key={cargo.id} className={alterado ? 'bg-cyan-400/[0.04]' : ''}>
                <th scope="row" className="min-w-36 px-4 py-4 text-left font-medium text-white">{cargo.nome}</th>
                {SIMULADORES.map(sim => <td key={sim} className="px-3 py-3 text-center">
                  <input type="checkbox" aria-label={`${cargo.nome} — ${t(sim)}`} checked={edits[cargo.id]?.[sim] === true} disabled={salvando}
                    onChange={e => setEdits(prev => ({ ...prev, [cargo.id]: { ...prev[cargo.id], [sim]: e.target.checked } }))}
                    className="h-5 w-5 cursor-pointer accent-cyan-400 disabled:cursor-wait" />
                </td>)}
              </tr>;
            })}
            {!visiveis.length && <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">{t('noResults')}</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end">
        <button disabled={!pendentes || salvando} onClick={salvar} aria-busy={salvando}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-500 disabled:opacity-40 disabled:cursor-default sm:w-auto">
          {salvando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}{t('save')}
        </button>
      </div>
    </>}
  </div>;
}
