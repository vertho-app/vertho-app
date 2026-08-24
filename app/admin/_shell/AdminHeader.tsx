'use client';

import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { RefreshCw, Settings, LayoutGrid } from 'lucide-react';
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
        {/* Ida para a arquitetura nova. O ShellV2 já tinha o caminho de VOLTA
            (dois links para /admin/dashboard), e o de ida não existia em lugar
            nenhum: a única porta para o v2 era a raiz do host genérico, que
            redireciona sozinha — quem entrasse por aqui ficava sem saber que ele
            existe. Um par de portas, não uma via de mão única.

            ⚠️ Nasceu como ícone cinza de 14px entre o refresh e a engrenagem, e
            o dono não o achou na própria tela (24/08) — destino que ninguém
            encontra não é caminho. Daí o CHIP com rótulo e a cor do sistema, que
            é como o ShellV2 marca os atalhos dele. */}
        <Link
          href="/admin-v2"
          title={t('header.adminV2')}
          className="flex items-center gap-1.5 shrink-0 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors hover:bg-[#34c5cc]/10"
          style={{ ...mono, color: '#34c5cc', borderColor: 'rgba(52,197,204,.4)' }}
        >
          <LayoutGrid size={13} />
          <span className="hidden sm:inline">arquitetura v2</span>
          <span className="sm:hidden">v2</span>
        </Link>
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
