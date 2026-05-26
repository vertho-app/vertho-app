import { loadAuditLog } from './actions';
import { getLocale, getTranslations } from 'next-intl/server';

export const dynamic = 'force-dynamic';

const RESULTADO_COR: Record<string, string> = {
  ok: '#34d399',
  parcial: '#fbbf24',
  erro: '#f87171',
};

function fmtData(iso: string, locale: string) {
  try {
    return new Date(iso).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'medium' });
  } catch {
    return iso;
  }
}

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<{ acao?: string; empresa?: string; admin?: string }>;
}) {
  const sp = await searchParams;
  const locale = await getLocale();
  const t = await getTranslations('AdminAudit');
  const acaoLabel = t.raw('actions') as Record<string, string>;
  const { rows, acoes, empresas, error } = await loadAuditLog({
    acao: sp.acao,
    empresaId: sp.empresa,
    adminEmail: sp.admin,
  });

  return (
    <div className="min-h-full bg-[#07162a] px-6 py-8 text-white">
      <div className="max-w-[1300px] mx-auto">
        <h1 className="text-2xl font-bold mb-1">{t('title')}</h1>
        <p className="text-sm text-white/55 mb-6">
          {t('subtitle')}
        </p>

        {error && (
          <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 mb-6 text-sm text-amber-200">
            {t('loadError')} <code>{error}</code>
            <br />
            <span className="text-amber-200/70">
              {t.rich('migrationHint', { code: (chunks) => <code>{chunks}</code> })}
            </span>
          </div>
        )}

        {/* Filtros (GET — server component, sem JS) */}
        <form method="GET" className="flex flex-wrap items-end gap-3 mb-6">
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-white/45">
            {t('filters.action')}
            <select name="acao" defaultValue={sp.acao || ''}
              className="bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-white min-w-[200px]">
              <option value="">{t('filters.all')}</option>
              {acoes.map((a) => <option key={a} value={a}>{acaoLabel[a] || a}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-white/45">
            {t('filters.company')}
            <select name="empresa" defaultValue={sp.empresa || ''}
              className="bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-white min-w-[160px]">
              <option value="">{t('filters.all')}</option>
              {empresas.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-white/45">
            {t('filters.admin')}
            <input name="admin" defaultValue={sp.admin || ''} placeholder={t('filters.adminPlaceholder')}
              className="bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-white min-w-[200px] placeholder:text-white/25" />
          </label>
          <button type="submit"
            className="rounded-lg px-4 py-2 text-sm font-bold text-[#06172C]"
            style={{ background: 'linear-gradient(135deg,#34c5cc,#0D9488)' }}>
            {t('filters.submit')}
          </button>
          <a href="/admin/auditoria" className="text-xs text-white/45 hover:text-white py-2">{t('filters.clear')}</a>
        </form>

        <p className="text-xs text-white/40 mb-3">{t('rowsSummary', { count: rows.length })}</p>

        <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-white/45 border-b border-white/10">
                <th className="px-3 py-2.5 whitespace-nowrap">{t('headers.when')}</th>
                <th className="px-3 py-2.5">{t('headers.admin')}</th>
                <th className="px-3 py-2.5">{t('headers.action')}</th>
                <th className="px-3 py-2.5">{t('headers.company')}</th>
                <th className="px-3 py-2.5">{t('headers.target')}</th>
                <th className="px-3 py-2.5">{t('headers.result')}</th>
                <th className="px-3 py-2.5">{t('headers.details')}</th>
                <th className="px-3 py-2.5">{t('headers.ip')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !error && (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-white/40">{t('empty')}</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-white/[0.05] align-top hover:bg-white/[0.02]">
                  <td className="px-3 py-2.5 whitespace-nowrap font-mono text-[12px] text-white/70">{fmtData(r.criado_em, locale)}</td>
                  <td className="px-3 py-2.5 text-white/85">{r.admin_email}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{acaoLabel[r.acao] || r.acao}</td>
                  <td className="px-3 py-2.5 text-white/70">{r.empresa_slug || (r.empresa_id ? r.empresa_id.slice(0, 8) : '—')}</td>
                  <td className="px-3 py-2.5 text-white/70">{r.alvo || '—'}</td>
                  <td className="px-3 py-2.5">
                    <span className="font-bold uppercase text-[11px]" style={{ color: RESULTADO_COR[r.resultado] || '#cbd5e1' }}>
                      {r.resultado}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 max-w-[320px]">
                    <code className="text-[11px] text-white/55 break-words">
                      {Object.keys(r.detalhes || {}).length ? JSON.stringify(r.detalhes) : '—'}
                    </code>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-white/40 whitespace-nowrap">{r.ip || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
