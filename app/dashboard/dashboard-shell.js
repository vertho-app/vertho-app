'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getSupabase } from '@/lib/supabase-browser';
import { Home, Clock, Play, TrendingUp, User, LogOut, Settings } from 'lucide-react';
import BetoChat from '@/components/beto-chat';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Início', icon: Home },
  { href: '/dashboard/jornada', label: 'Jornada', icon: Clock },
  { href: '/dashboard/praticar', label: 'Praticar', icon: Play },
  { href: '/dashboard/evolucao', label: 'Evolução', icon: TrendingUp },
  { href: '/dashboard/perfil', label: 'Perfil', icon: User },
];

function initialsFromEmail(email) {
  if (!email) return 'U';
  const base = email.split('@')[0] || '';
  const parts = base.replace(/[._-]+/g, ' ').split(' ').filter(Boolean);
  const first = parts[0]?.[0] || base[0] || 'U';
  const second = parts[1]?.[0] || '';
  return (first + second).toUpperCase();
}

export default function DashboardShell({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = getSupabase();
  const [user, setUser] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.replace('/login'); return; }
      setUser(session.user);
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

  const initials = initialsFromEmail(user.email);

  return (
    <div className="min-h-dvh flex flex-col" style={{ background: 'linear-gradient(180deg, #091D35 0%, #0F2A4A 100%)' }}>
      {/* Sidebar (desktop) */}
      <aside
        className="hidden md:flex fixed left-0 top-0 h-full w-20 border-r border-white/[0.08] flex-col items-center py-6 gap-8 z-40"
        style={{ background: 'rgba(9,29,53,0.95)', backdropFilter: 'blur(12px)' }}
      >
        <button onClick={() => router.push('/dashboard/perfil')}
          className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-md"
          style={{ background: 'linear-gradient(135deg, #0D9488, #0F766E)' }}
          title="Meu perfil">
          {initials}
        </button>
        <nav className="flex flex-col gap-6 flex-1">
          {NAV_ITEMS.map(item => {
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
            const Icon = item.icon;
            return (
              <div key={item.href} className="relative group">
                <button onClick={() => router.push(item.href)}
                  title={item.label}
                  className={`transition-all duration-300 block ${
                    isActive
                      ? 'text-cyan-400 drop-shadow-[0_0_8px_rgba(0,180,216,0.45)] scale-110'
                      : 'text-gray-500 hover:text-white hover:scale-110 active:scale-95'
                  }`}>
                  <Icon size={22} />
                </button>
                {/* Tooltip flutuante (desktop) */}
                <span className="absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1 rounded-md bg-slate-800/95 text-white text-xs font-semibold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border border-white/10 shadow-lg z-50">
                  {item.label}
                </span>
              </div>
            );
          })}
        </nav>
        <button onClick={handleLogout}
          title="Sair"
          className="text-gray-500 hover:text-red-400 transition-colors">
          <LogOut size={20} />
        </button>
      </aside>

      {/* Header mobile (some em md+) */}
      <header className="md:hidden flex items-center justify-between px-4 shrink-0"
        style={{ height: 'var(--header-height)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <img src="/logo-vertho.png" alt="Vertho" style={{ height: '22px' }} />
        <button onClick={handleLogout} className="text-gray-500 hover:text-white transition-colors" title="Sair">
          <LogOut size={18} />
        </button>
      </header>

      {/* Content — ml-20 em desktop pra respeitar a sidebar fixa */}
      {/* pb generoso em mobile pra não esconder conteúdo embaixo do BETO FAB */}
      <main className="flex-1 overflow-y-auto pb-[calc(var(--nav-height)+72px)] md:pb-0 md:ml-20">
        {children}
      </main>

      {/* Bottom Nav (mobile apenas) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 flex items-center justify-around border-t border-white/[0.06] z-40"
        style={{ height: 'var(--nav-height)', background: '#091D35' }}>
        {NAV_ITEMS.map(item => {
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <button key={item.href} onClick={() => router.push(item.href)}
              className={`flex flex-col items-center gap-0.5 py-1 px-3 transition-colors ${isActive ? 'text-cyan-400' : 'text-gray-500'}`}>
              <Icon size={20} />
              <span className="text-[10px] font-semibold">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* BETO — chat flutuante */}
      <BetoChat />
    </div>
  );
}
