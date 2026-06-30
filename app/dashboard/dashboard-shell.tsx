'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { getSupabase } from '@/lib/supabase-browser';
import { localeCookieName } from '@/lib/i18n';
import { Home, Clock, Play, TrendingUp, User, LogOut, Users2, ListOrdered } from 'lucide-react';
import BetoChat from '@/components/beto-chat';
import { UserAvatar } from '@/components/user-avatar';
import type { TenantTheme } from '@/lib/ui-resolver';

type NavItem = { href: string; labelKey: string; icon: any; gestorOnly?: boolean };

// Fallback = tema Vertho atual (usado se o layout não passar theme).
const DEFAULT_THEME: TenantTheme = {
  bgStart: '#091D35',
  bgEnd: '#0F2A4A',
  accent: '#22d3ee',
  accentRaw: null,
  logoUrl: '/logo-vertho.png',
};

/** Deriva o ramp brand-100..700 a partir do accent do tenant (clarear/escurecer). */
function brandRampVars(accent: string): Record<string, string> {
  const lighten = (pct: number) => `color-mix(in oklab, ${accent} ${pct}%, white)`;
  const darken = (pct: number) => `color-mix(in oklab, ${accent} ${pct}%, black)`;
  return {
    '--brand-100': lighten(25),
    '--brand-200': lighten(45),
    '--brand-300': lighten(70),
    '--brand-400': accent,
    '--brand-500': darken(85),
    '--brand-600': darken(70),
    '--brand-700': darken(55),
  };
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', labelKey: 'home', icon: Home },
  { href: '/dashboard/gestor', labelKey: 'team', icon: Users2, gestorOnly: true },
  { href: '/dashboard/gestor/ranking', labelKey: 'ranking', icon: ListOrdered, gestorOnly: true },
  { href: '/dashboard/jornada', labelKey: 'journey', icon: Clock },
  { href: '/dashboard/temporada', labelKey: 'season', icon: Play },
  { href: '/dashboard/evolucao', labelKey: 'evolution', icon: TrendingUp },
  { href: '/dashboard/perfil', labelKey: 'profile', icon: User },
];

export default function DashboardShell({ children, theme = DEFAULT_THEME }: { children: React.ReactNode; theme?: TenantTheme }) {
  const t = useTranslations('DashboardShell');
  const router = useRouter();
  const pathname = usePathname();
  const supabase = getSupabase();
  const [user, setUser] = useState<any>(null);
  const [colaborador, setColaborador] = useState<{ nome_completo?: string; foto_url?: string; avatar_preset?: string | null; role?: string; locale?: string } | null>(null);
  const isGestorOuRH = colaborador?.role === 'gestor' || colaborador?.role === 'rh';
  const navItems = NAV_ITEMS.filter((it) => !it.gestorOnly || isGestorOuRH);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.replace('/login'); return; }
      setUser(session.user);

      fetch('/api/me')
        .then(r => r.json())
        .then(d => {
          if (d?.locale) document.cookie = `${localeCookieName}=${d.locale}; path=/; max-age=31536000; samesite=lax`;
          if (d?.nome_completo) setColaborador(d);
        })
        .catch(() => {});
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_OUT' || !session) router.replace('/login');
        else setUser(session.user);
      }
    );
    return () => subscription.unsubscribe();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  if (!user) return null;

  return (
    <div
      className="min-h-dvh flex flex-col"
      style={{
        background: `linear-gradient(180deg, ${theme.bgStart} 0%, ${theme.bgEnd} 100%)`,
        // White-label do ramp de marca: só sobrescreve quando o tenant configurou
        // um accent (senão cai nos fallbacks = cyan exato = Vertho). brand-400 é o
        // accent; as demais tonalidades são derivadas (clarear p/ 100-300, escurecer
        // p/ 500-700) via color-mix, dando um ramp coerente a partir de 1 cor.
        ...(theme.accentRaw ? brandRampVars(theme.accentRaw) : {}),
      }}
    >

      {/* Sidebar (desktop) */}
      <aside
        className="hidden md:flex fixed left-0 top-0 h-full w-20 border-r border-white/[0.08] flex-col items-center py-6 gap-8 z-40"
        style={{ background: theme.bgStart, backdropFilter: 'blur(12px)' }}
      >
        {/* ✅ UserAvatar substitui o botão com initials hardcoded */}
        <UserAvatar
          name={colaborador?.nome_completo ?? user?.email}
          photoUrl={colaborador?.foto_url}
          avatarPreset={colaborador?.avatar_preset}
          size={40}
          onClick={() => router.push('/dashboard/perfil')}
        />

        <nav className="flex flex-col gap-6 flex-1">
          {navItems.map(item => {
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
            const Icon = item.icon;
            const label = t(`nav.${item.labelKey}`);
            return (
              <div key={item.href} className="relative group">
                <button
                  onClick={() => router.push(item.href)}
                  title={label}
                  className={`transition-all duration-300 block ${
                    isActive
                      ? 'scale-110'
                      : 'text-gray-500 hover:text-white hover:scale-110 active:scale-95'
                  }`}
                  style={isActive ? { color: theme.accent, filter: `drop-shadow(0 0 8px ${theme.accent})` } : undefined}
                >
                  <Icon size={22} />
                </button>
                <span className="absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1 rounded-md bg-slate-800/95 text-white text-xs font-semibold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border border-white/10 shadow-lg z-50">
                  {label}
                </span>
              </div>
            );
          })}
        </nav>

        <button onClick={handleLogout} title={t('logout')} className="text-gray-500 hover:text-red-400 transition-colors">
          <LogOut size={20} />
        </button>
      </aside>

      {/* Header mobile */}
      <header
        className="md:hidden flex items-center justify-between px-4 shrink-0"
        style={{ height: 'var(--header-height)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <img src={theme.logoUrl} alt="Logo" style={{ height: '22px' }} />
        <div className="flex items-center gap-3">
          {/* ✅ Avatar no header mobile também */}
          <UserAvatar
            name={colaborador?.nome_completo ?? user?.email}
            photoUrl={colaborador?.foto_url}
            avatarPreset={colaborador?.avatar_preset}
            size={32}
            onClick={() => router.push('/dashboard/perfil')}
          />
          <button onClick={handleLogout} className="text-gray-500 hover:text-white transition-colors" title={t('logout')}>
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto pb-[calc(var(--nav-height)+72px)] md:pb-0 md:ml-20">
        {children}
      </main>

      {/* Bottom Nav mobile */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 flex items-center justify-around border-t border-white/[0.06] z-40"
        style={{ height: 'var(--nav-height)', background: theme.bgStart }}
      >
        {navItems.map(item => {
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
          const Icon = item.icon;
          const label = t(`nav.${item.labelKey}`);
          return (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              className={`flex flex-col items-center gap-0.5 py-1 px-3 transition-colors ${isActive ? '' : 'text-gray-500'}`}
              style={isActive ? { color: theme.accent } : undefined}
            >
              <Icon size={20} />
              <span className="text-[10px] font-semibold">{label}</span>
            </button>
          );
        })}
      </nav>

      {!/^\/dashboard\/temporada\/semana\//.test(pathname) && <BetoChat />}
    </div>
  );
}
