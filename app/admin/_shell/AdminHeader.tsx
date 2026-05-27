'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { RefreshCw, Settings } from 'lucide-react';
import { monoStyle as mono, serifStyle as serif } from './nav-items';
import EmpresaFilter from './EmpresaFilter';
import AdminMobileNav from './AdminMobileNav';
import { useAdminShell } from './AdminShellContext';

export default function AdminHeader() {
  const t = useTranslations('AdminDashboard');
  const locale = useLocale();
  const router = useRouter();
  const { empresas, empresaFiltro, setEmpresaFiltro, empresaSelecionada, triggerRefresh, refreshing } = useAdminShell();

  return (
    <header
      className="flex items-center justify-between gap-2 md:gap-4 px-4 md:px-8 h-16 shrink-0"
      style={{ background: 'rgba(7,27,56,.45)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,.05)' }}
    >
      <div className="flex items-center gap-2 md:gap-3 min-w-0 overflow-hidden">
        <AdminMobileNav />
        <h1 className="text-[19px] md:text-[28px] whitespace-nowrap" style={{ ...serif, color: '#fff', lineHeight: 1 }}>
          {t.rich('header.title', { em: (chunks) => <em style={{ color: '#34c5cc' }}>{chunks}</em> })}
        </h1>
        <span className="hidden sm:inline shrink-0" style={{ ...mono, fontSize: 10, color: 'rgba(255,255,255,.4)', letterSpacing: '.14em', textTransform: 'uppercase' }}>
          {new Date().toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })}
        </span>
      </div>
      <div className="flex items-center gap-2 min-w-0">
        <EmpresaFilter
          empresas={empresas}
          value={empresaFiltro}
          onChange={setEmpresaFiltro}
          t={t}
          locale={locale}
        />
        <button onClick={triggerRefresh} disabled={refreshing} title={t('header.refresh')}
          className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white/5 transition-colors"
          style={{ color: 'rgba(255,255,255,.5)' }}
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
        </button>
        {empresaSelecionada && (
          <button
            onClick={() => router.push(`/admin/empresas/${empresaSelecionada.id}/configuracoes`)}
            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white/5 transition-colors"
            style={{ color: 'rgba(255,255,255,.5)' }}
            title={t('header.settings')}
          >
            <Settings size={14} />
          </button>
        )}
      </div>
    </header>
  );
}
