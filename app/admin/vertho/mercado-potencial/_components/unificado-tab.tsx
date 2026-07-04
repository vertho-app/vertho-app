'use client';

/**
 * Tab "Potencial por Cidade" (visão UNIFICADA Empresas + Escolas) do
 * workspace Mercado Potencial. Conteúdo movido de
 * app/admin/vertho/potencial-cidades/page.tsx (Fase 3 da reorganização
 * do admin) — a rota antiga virou redirect pra cá.
 *
 * As actions ficam onde sempre estiveram (potencial-cidades/actions.ts):
 * só a UI mudou de endereço.
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Loader2, Layers, Download, Target, GraduationCap } from 'lucide-react';
import { loadPotencialCidades, type PotencialCidadeRow } from '@/app/admin/vertho/potencial-cidades/actions';
import { getCidadeXlsxUrl } from '@/actions/radarempresas/busca';

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
const empty = '—';
const fmt = (n: number | null | undefined, locale: string) => n == null ? empty : Number(n).toLocaleString(locale);
const fmtBrl = (n: number | null | undefined, locale: string) => n == null ? empty : new Intl.NumberFormat(locale, { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(Math.round(n));

export default function UnificadoTab({ onOpenMercado }: { onOpenMercado: () => void }) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('AdminCityPotential');
  const [rows, setRows] = useState<PotencialCidadeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [buscando, setBuscando] = useState(false);
  const [uf, setUf] = useState('');
  const [busca, setBusca] = useState('');
  const [pctEscopo, setPctEscopo] = useState(15);   // % do quadro
  const [precoPessoa, setPrecoPessoa] = useState(300); // R$/pessoa/mês
  const [baixando, setBaixando] = useState<string | null>(null);

  async function carregar() {
    setBuscando(true);
    const r = await loadPotencialCidades({
      uf: uf || undefined, municipioBusca: busca || undefined,
      pctEscopo: pctEscopo / 100, precoPessoa,
    });
    if ('ok' in r) setRows(r.rows);
    setBuscando(false); setLoading(false);
  }
  useEffect(() => { carregar(); /* eslint-disable-line */ }, []);

  async function baixarXlsx(c: PotencialCidadeRow) {
    if (!c.emp?.xlsx_path) return;
    setBaixando(c.municipio_ibge);
    const url = await getCidadeXlsxUrl(c.emp.xlsx_path);
    setBaixando(null);
    if (url) window.open(url, '_blank'); else toast.error(t('messages.linkUnavailable'));
  }

  if (loading) return <div className="flex items-center justify-center py-24"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;

  const lista = rows.slice(0, 1000);

  return (
    <div>
      <div className="flex items-center gap-3 mb-2">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Layers size={20} className="text-cyan-400" /> {t('title')}
          </h1>
          <p className="text-xs text-gray-500">{t('subtitle')}</p>
        </div>
      </div>

      <div className="mb-4 p-3 rounded-xl border border-white/[0.06] bg-white/[0.02] text-[11px] text-gray-400 leading-relaxed">
        {t('explanation')}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select value={uf} onChange={e => setUf(e.target.value)}
          className="rounded-lg border border-white/10 bg-[#091D35] text-white text-xs px-2 py-1.5">
          <option value="">{t('filters.allStates')}</option>
          {UFS.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder={t('filters.cityPlaceholder')}
          onKeyDown={e => e.key === 'Enter' && carregar()}
          className="flex-1 min-w-[160px] rounded-lg border border-white/10 bg-[#091D35] text-white text-sm px-3 py-1.5 focus:outline-none focus:border-cyan-400/50" />
        <label className="flex items-center gap-1 text-[11px] text-gray-400">
          {t('filters.scopePct')}
          <input type="number" min={1} max={100} value={pctEscopo}
            onChange={e => setPctEscopo(Math.max(1, Math.min(100, Number(e.target.value) || 0)))}
            className="w-14 rounded-lg border border-white/10 bg-[#091D35] text-white text-xs px-2 py-1.5" />
        </label>
        <label className="flex items-center gap-1 text-[11px] text-gray-400">
          {t('filters.pricePerPerson')}
          <input type="number" min={0} value={precoPessoa}
            onChange={e => setPrecoPessoa(Math.max(0, Number(e.target.value) || 0))}
            className="w-16 rounded-lg border border-white/10 bg-[#091D35] text-white text-xs px-2 py-1.5" />
        </label>
        <button onClick={carregar} disabled={buscando}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-[#0F2B54] bg-cyan-400 hover:brightness-110 disabled:opacity-50">
          {buscando ? <Loader2 size={13} className="animate-spin" /> : t('filters.apply')}
        </button>
        <span className="text-[11px] text-gray-500">{t('filters.cityCount', { count: fmt(rows.length, locale) })}</span>
      </div>

      <div className="rounded-xl border border-white/[0.06] overflow-x-auto" style={{ background: '#0F2A4A' }}>
        <table className="w-full text-[11px] min-w-[1040px]">
          <thead>
            <tr className="text-gray-500 border-b border-white/[0.06]">
              <th className="px-3 py-2 text-left" rowSpan={2}>{t('table.city')}</th>
              <th className="px-3 py-1 text-center border-l border-white/[0.06] text-cyan-300" colSpan={6}>{t('table.companies')}</th>
              <th className="px-3 py-1 text-center border-l border-white/[0.06] text-violet-300" colSpan={4}>{t('table.schools')}</th>
              <th className="px-3 py-2 text-right border-l border-white/[0.06] text-emerald-300" rowSpan={2}>{t('table.totalTam')}</th>
            </tr>
            <tr className="text-gray-600 border-b border-white/[0.06] text-[10px]">
              <th className="px-3 py-1 text-right border-l border-white/[0.06]">{t('table.prioritized')}</th>
              <th className="px-3 py-1 text-right">{t('table.approach')}</th>
              <th className="px-3 py-1 text-right">{t('table.networks')}</th>
              <th className="px-3 py-1 text-right">Score</th>
              <th className="px-3 py-1 text-right">{t('table.estimatedTam')}</th>
              <th className="px-3 py-1 text-center">XLSX</th>
              <th className="px-3 py-1 text-right border-l border-white/[0.06]">{t('table.schoolsShort')}</th>
              <th className="px-3 py-1 text-right">{t('table.teachers')}</th>
              <th className="px-3 py-1 text-right">TAM/mês</th>
              <th className="px-3 py-1 text-right">Score</th>
            </tr>
          </thead>
          <tbody>
            {lista.map(c => (
              <tr key={c.municipio_ibge} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                <td className="px-3 py-2 text-white whitespace-nowrap">{c.municipio}<span className="text-gray-600">/{c.uf}</span></td>
                <td className="px-3 py-2 text-right text-cyan-300 font-semibold border-l border-white/[0.04]">{c.emp ? fmt(c.emp.n_priorizados, locale) : empty}</td>
                <td className="px-3 py-2 text-right text-gray-400">{c.emp ? fmt(c.emp.n_abordar, locale) : empty}</td>
                <td className="px-3 py-2 text-right text-gray-400">{c.emp ? fmt(c.emp.n_redes, locale) : empty}</td>
                <td className="px-3 py-2 text-right text-gray-400">{c.emp?.score_medio == null ? empty : Math.round(c.emp.score_medio)}</td>
                <td className="px-3 py-2 text-right text-amber-300/80">{c.emp?.tam_empresas == null ? empty : fmtBrl(c.emp.tam_empresas, locale)}</td>
                <td className="px-3 py-2 text-center">
                  {c.emp?.xlsx_path ? (
                    <button onClick={() => baixarXlsx(c)} disabled={baixando === c.municipio_ibge}
                      className="inline-flex items-center px-1.5 py-1 rounded border border-white/10 text-cyan-300 hover:bg-white/[0.04] disabled:opacity-40">
                      {baixando === c.municipio_ibge ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
                    </button>
                  ) : <span className="text-gray-700">{empty}</span>}
                </td>
                <td className="px-3 py-2 text-right text-violet-300 font-semibold border-l border-white/[0.04]">{c.esc ? fmt(c.esc.qt_escolas, locale) : empty}</td>
                <td className="px-3 py-2 text-right text-gray-400">{c.esc ? fmt(c.esc.qt_professores, locale) : empty}</td>
                <td className="px-3 py-2 text-right text-gray-400">{c.esc ? fmtBrl(c.esc.tam_mensal, locale) : empty}</td>
                <td className="px-3 py-2 text-right text-gray-400">{c.esc?.score == null ? empty : fmt(Math.round(c.esc.score), locale)}</td>
                <td className="px-3 py-2 text-right text-emerald-300 font-semibold border-l border-white/[0.04]">{c.tam_total == null ? empty : fmtBrl(c.tam_total, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 1000 && <p className="text-[10px] text-gray-600 mt-2">{t('showingLimit', { total: fmt(rows.length, locale) })}</p>}

      <div className="flex gap-2 mt-5">
        <button onClick={() => router.push('/admin/vertho/radarempresas')}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-cyan-400/20 text-xs text-cyan-300 hover:bg-cyan-400/[0.06]">
          <Target size={13} /> {t('actions.openCompanyRadar')}
        </button>
        {/* Cross-link antigo p/ /admin/vertho/mercado-potencial: agora vira troca de tab no workspace */}
        <button onClick={onOpenMercado}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-violet-400/20 text-xs text-violet-300 hover:bg-violet-400/[0.06]">
          <GraduationCap size={13} /> {t('actions.openSchoolMarket')}
        </button>
      </div>
    </div>
  );
}
