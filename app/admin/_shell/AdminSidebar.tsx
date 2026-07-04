'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ChevronRight, LogOut } from 'lucide-react';
import { NAV_ITEMS, GROUP_ORDER, activeNavKey, empresaGlyph, serifStyle as serif } from './nav-items';
import { useAdminShell } from './AdminShellContext';

export default function AdminSidebar() {
  const t = useTranslations('AdminDashboard');
  const router = useRouter();
  const pathname = usePathname();
  const { collapsed, setCollapsed, empresaSelecionada, podeVer } = useAdminShell();

  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (!podeVer(item.permission)) return false;
    if (empresaSelecionada) return item.showWhenEmpresa !== false;
    return item.showWhenAll !== false;
  });

  const groups = GROUP_ORDER
    .map((g) => ({ key: g, items: visibleNavItems.filter((i) => i.group === g) }))
    .filter((g) => g.items.length > 0);

  const activeKey = activeNavKey(pathname, empresaSelecionada?.id);

  return (
    <aside
      className={`${collapsed ? 'w-16' : 'w-64'} shrink-0 flex flex-col transition-all duration-200 hidden md:flex`}
      style={{
        background: 'rgba(7,27,56,.65)',
        backdropFilter: 'blur(12px)',
        borderRight: '1px solid rgba(255,255,255,.06)',
      }}
    >
      {/* Logo */}
      <div className="px-4 pt-5 pb-4 flex items-center justify-between gap-2" style={{ borderBottom: '1px solid rgba(255,255,255,.05)' }}>
        {!collapsed && (
          <div className="flex items-center gap-2 min-w-0">
            <img src="/logo-vertho.png" alt="Vertho" style={{ height: 22, opacity: 0.95 }} />
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-widest" style={{ color: 'rgba(255,255,255,.4)', letterSpacing: '.2em' }}>{t('sidebar.panel')}</p>
            </div>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-white/5 transition-colors shrink-0"
          style={{ color: 'rgba(255,255,255,.4)' }}
          title={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
        >
          <ChevronRight size={14} className={collapsed ? '' : 'rotate-180'} />
        </button>
      </div>

      {/* Contexto de filtro (visível apenas quando alguma empresa está selecionada) */}
      {!collapsed && empresaSelecionada && (
        <div className="px-3 pt-3 pb-1">
          <div className="rounded-lg px-3 py-2 flex items-center gap-2"
            style={{ background: 'rgba(52,197,204,.08)', border: '1px solid rgba(52,197,204,.25)' }}>
            <span style={{ ...serif, fontSize: 16, color: '#34c5cc' }}>{empresaGlyph(empresaSelecionada.nome)}</span>
            <div className="flex-1 min-w-0">
              <p className="text-[9px] uppercase tracking-widest" style={{ color: 'rgba(52,197,204,.7)', letterSpacing: '.18em' }}>{t('sidebar.context')}</p>
              <p className="text-xs font-bold text-white truncate">{empresaSelecionada.nome}</p>
            </div>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 flex flex-col gap-0.5">
        {groups.map((group, gi) => (
          <div key={group.key} className="flex flex-col gap-0.5">
            {collapsed ? (
              gi > 0 && <div className="my-2 mx-2" style={{ borderTop: '1px solid rgba(255,255,255,.08)' }} />
            ) : (
              <p
                className={`px-3 ${gi > 0 ? 'pt-4' : 'pt-1'} pb-1 text-[9px] uppercase truncate`}
                style={{ color: 'rgba(255,255,255,.32)', letterSpacing: '.18em' }}
              >
                {t(`nav.groups.${group.key}`)}
              </p>
            )}
            {group.items.map((item) => {
          const Icon = item.icon;
          const active = item.key === activeKey;
          const href = item.hrefFn(empresaSelecionada?.id);
          return (
            <button
              key={item.key}
              onClick={() => router.push(href)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all"
              title={collapsed ? t(`nav.labels.${item.labelKey}`) : undefined}
              style={{
                background: active ? 'rgba(52,197,204,.12)' : 'transparent',
                border: active ? '1px solid rgba(52,197,204,.25)' : '1px solid transparent',
                color: active ? '#34c5cc' : 'rgba(255,255,255,.7)',
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.04)';
                  (e.currentTarget as HTMLElement).style.color = '#fff';
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                  (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,.7)';
                }
              }}
            >
              <Icon size={16} className="shrink-0" />
              {!collapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">{t(`nav.labels.${item.labelKey}`)}</p>
                  <p className="text-[10px] truncate" style={{ color: 'rgba(255,255,255,.4)' }}>{t(`nav.subs.${item.subKey}`)}</p>
                </div>
              )}
            </button>
          );
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="px-3 py-3" style={{ borderTop: '1px solid rgba(255,255,255,.05)' }}>
          <button
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left transition-colors hover:bg-white/5"
            style={{ color: 'rgba(255,255,255,.55)' }}
            onClick={() => router.push('/login')}
          >
            <LogOut size={14} />
            <span>{t('sidebar.logout')}</span>
          </button>
        </div>
      )}
    </aside>
  );
}
