'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Menu, X, LogOut } from 'lucide-react';
import { NAV_ITEMS, activeNavKey, empresaGlyph, serifStyle as serif } from './nav-items';
import { useAdminShell } from './AdminShellContext';

/**
 * Navegação mobile do admin (drawer). A AdminSidebar é `hidden md:flex`, então
 * no celular não havia menu. Este hambúrguer (md:hidden) abre um painel lateral
 * com os mesmos NAV_ITEMS, respeitando o contexto de empresa selecionada.
 */
export default function AdminMobileNav() {
  const t = useTranslations('AdminDashboard');
  const router = useRouter();
  const pathname = usePathname();
  const { empresaSelecionada } = useAdminShell();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Fecha ao trocar de rota
  useEffect(() => { setOpen(false); }, [pathname]);

  // Trava scroll do body + fecha no ESC enquanto aberto
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const visibleNavItems = NAV_ITEMS.filter((item) =>
    empresaSelecionada ? item.showWhenEmpresa !== false : item.showWhenAll !== false,
  );
  const activeKey = activeNavKey(pathname, empresaSelecionada?.id);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white/5 transition-colors shrink-0"
        style={{ color: 'rgba(255,255,255,.7)' }}
        aria-label={t('sidebar.panel')}
      >
        <Menu size={20} />
      </button>

      {mounted && open && createPortal(
        <div className="md:hidden fixed inset-0 z-[200]">
          <div
            className="absolute inset-0"
            style={{ background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(2px)' }}
            onClick={() => setOpen(false)}
          />
          <aside
            className="absolute left-0 top-0 h-full w-[82%] max-w-[320px] flex flex-col"
            style={{ background: 'rgba(7,27,56,.98)', backdropFilter: 'blur(12px)', borderRight: '1px solid rgba(255,255,255,.08)' }}
          >
            {/* Logo + fechar */}
            <div className="px-4 pt-5 pb-4 flex items-center justify-between gap-2" style={{ borderBottom: '1px solid rgba(255,255,255,.05)' }}>
              <div className="flex items-center gap-2 min-w-0">
                <img src="/logo-vertho.png" alt="Vertho" style={{ height: 22, opacity: 0.95 }} />
                <p className="text-[10px] uppercase" style={{ color: 'rgba(255,255,255,.4)', letterSpacing: '.2em' }}>{t('sidebar.panel')}</p>
              </div>
              <button onClick={() => setOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-white/5 shrink-0" style={{ color: 'rgba(255,255,255,.5)' }} aria-label={t('sidebar.collapse')}>
                <X size={18} />
              </button>
            </div>

            {/* Contexto de empresa */}
            {empresaSelecionada && (
              <div className="px-3 pt-3 pb-1">
                <div className="rounded-lg px-3 py-2 flex items-center gap-2" style={{ background: 'rgba(52,197,204,.08)', border: '1px solid rgba(52,197,204,.25)' }}>
                  <span style={{ ...serif, fontSize: 16, color: '#34c5cc' }}>{empresaGlyph(empresaSelecionada.nome)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[9px] uppercase" style={{ color: 'rgba(52,197,204,.7)', letterSpacing: '.18em' }}>{t('sidebar.context')}</p>
                    <p className="text-xs font-bold text-white truncate">{empresaSelecionada.nome}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Nav */}
            <nav className="flex-1 overflow-y-auto py-3 px-2 flex flex-col gap-0.5">
              {visibleNavItems.map((item) => {
                const Icon = item.icon;
                const active = item.key === activeKey;
                const href = item.hrefFn(empresaSelecionada?.id);
                return (
                  <button
                    key={item.key}
                    onClick={() => go(href)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all"
                    style={{
                      background: active ? 'rgba(52,197,204,.12)' : 'transparent',
                      border: active ? '1px solid rgba(52,197,204,.25)' : '1px solid transparent',
                      color: active ? '#34c5cc' : 'rgba(255,255,255,.7)',
                    }}
                  >
                    <Icon size={16} className="shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate">{t(`nav.labels.${item.labelKey}`)}</p>
                      <p className="text-[10px] truncate" style={{ color: 'rgba(255,255,255,.4)' }}>{t(`nav.subs.${item.subKey}`)}</p>
                    </div>
                  </button>
                );
              })}
            </nav>

            {/* Footer */}
            <div className="px-3 py-3" style={{ borderTop: '1px solid rgba(255,255,255,.05)' }}>
              <button
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left transition-colors hover:bg-white/5"
                style={{ color: 'rgba(255,255,255,.55)' }}
                onClick={() => go('/login')}
              >
                <LogOut size={14} />
                <span>{t('sidebar.logout')}</span>
              </button>
            </div>
          </aside>
        </div>,
        document.body,
      )}
    </>
  );
}
