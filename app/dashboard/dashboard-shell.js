'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getSupabase } from '@/lib/supabase-browser';
import { Home, Clock, Play, TrendingUp, User, LogOut } from 'lucide-react';
import BetoChat from '@/components/beto-chat';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Início', icon: Home },
  { href: '/dashboard/jornada', label: 'Jornada', icon: Clock },
  { href: '/dashboard/praticar', label: 'Praticar', icon: Play },
  { href: '/dashboard/evolucao', label: 'Evolução', icon: TrendingUp },
  { href: '/dashboard/perfil', label: 'Perfil', icon: User },
];

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

  return (
    <div className="min-h-dvh flex flex-col" style={{ background: 'linear-gradient(180deg, #091D35 0%, #0F2A4A 100%)' }}>
      {/* Header */}
      <header className="flex items-center justify-between px-4 shrink-0"
        style={{ height: 'var(--header-height)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <img src="/logo-vertho.png" alt="Vertho" style={{ height: '22px' }} />
        <button onClick={handleLogout} className="text-gray-500 hover:text-white transition-colors" title="Sair">
          <LogOut size={18} />
        </button>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto pb-[calc(var(--nav-height)+16px)]">
        {children}
      </main>

      {/* BETO Chat */}
      <BetoChat />

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 flex items-center justify-around border-t border-white/[0.06]"
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
    </div>
  );
}
