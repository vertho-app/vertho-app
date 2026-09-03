'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { getSupabase } from '@/lib/supabase-browser';
import { localeCookieName } from '@/lib/i18n';
import { Home, Clock, Play, TrendingUp, User, LogOut, Users2, ListOrdered, ShieldCheck, FileChartColumn, Activity } from 'lucide-react';
import BetoChat from '@/components/beto-chat';
import { UserAvatar } from '@/components/user-avatar';
import { PresentationEnvironment } from '@/components/dashboard/presentation-role-switcher';
import type { TenantTheme } from '@/lib/ui-resolver';

type NavItem = {
  href: string; labelKey: string; icon: any;
  gestorOnly?: boolean; rhOnly?: boolean; participante?: boolean;
  /** Some para o Admin da empresa, que chega no mesmo destino por outro caminho. */
  exceptoRh?: boolean;
};

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
  { href: '/dashboard/gestor/ranking', labelKey: 'ranking', icon: ListOrdered, rhOnly: true },
  { href: '/dashboard/relatorios', labelKey: 'reports', icon: FileChartColumn, rhOnly: true },
  // Seleção saiu daqui em 24/08/2026: era a única tela de OPERAÇÃO no menu do
  // cliente (criar vaga · gerar perfil · avaliar candidatos) e virou operação da
  // Vertho em /admin. O ranking das vagas segue visível ao RH em .../ranking, que já
  // inclui `eh_vaga`. Ver o docstring de `gestor/selecao/page.tsx`.
  // `participante`: telas da jornada de quem FAZ o programa. O papel `rh` é o
  // Admin da empresa e não participa (medido 24/08/2026: 0 dos 8 com role='rh'
  // têm sessão de avaliação), então para ele são portas para tela vazia — a
  // mesma razão que tirou a jornada da home dele. Ver `home-rh.tsx`.
  // Telas de EQUIPE. Para quem lidera sem participar (cargo de adequação, Top 5
  // vazio) elas são o conteúdo do menu: o coordenador acompanha o time, não faz
  // a própria jornada.
  { href: '/dashboard/gestor/engajamento', labelKey: 'teamEngagement', icon: Activity, gestorOnly: true },
  // Para o RH a evolução já é uma ABA da central de relatórios: no menu, o
  // mesmo destino apareceria duas vezes na mesma tela.
  { href: '/dashboard/gestor/equipe-evolucao', labelKey: 'teamEvolution', icon: TrendingUp, gestorOnly: true, exceptoRh: true },
  { href: '/dashboard/jornada', labelKey: 'journey', icon: Clock, participante: true },
  { href: '/dashboard/temporada', labelKey: 'season', icon: Play, participante: true },
  { href: '/dashboard/evolucao', labelKey: 'evolution', icon: TrendingUp, participante: true },
  { href: '/dashboard/perfil', labelKey: 'profile', icon: User },
];

export default function DashboardShell({ children, theme = DEFAULT_THEME }: { children: React.ReactNode; theme?: TenantTheme }) {
  const t = useTranslations('DashboardShell');
  const router = useRouter();
  const pathname = usePathname();
  const isImmersiveContent = pathname.startsWith('/dashboard/conteudo/');
  const supabase = getSupabase();
  const [user, setUser] = useState<any>(null);
  const [colaborador, setColaborador] = useState<{ nome_completo?: string; foto_url?: string; avatar_preset?: string | null; role?: string; locale?: string; platformAdmin?: boolean; temTrilhaPossivel?: boolean } | null>(null);
  const isGestorOuRH = colaborador?.role === 'gestor' || colaborador?.role === 'rh';
  const ehAdminDaEmpresa = colaborador?.role === 'rh';
  // Cargo com Top 5 vazio não faz mapeamento nem trilha: as telas de jornada
  // abrem vazias. `undefined` (ainda carregando, ou /api/me antigo) conta como
  // participante — na dúvida, mostra.
  const participaDaJornada = colaborador?.temTrilhaPossivel !== false;
  // Quem administra a plataforma também é colaborador de algum tenant, e entrar
  // por um deles não é erro — mas daqui não havia caminho de volta ao painel
  // (medido 24/08/2026: nenhum link para /admin fora do próprio /admin). Quem
  // decide é o servidor, no /api/me; o gate real é o layout de /admin.
  const ehAdminDaPlataforma = colaborador?.platformAdmin === true;
  const navItems = NAV_ITEMS.filter((it) =>
    (!it.gestorOnly || isGestorOuRH)
    && (!it.rhOnly || ehAdminDaEmpresa)
    && (!it.participante || (!ehAdminDaEmpresa && participaDaJornada))
    && (!it.exceptoRh || !ehAdminDaEmpresa),
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        // 🔑 LEVA O DESTINO JUNTO. Sem isto, quem toca no link da semana 5 e não
        // tem sessão neste navegador entra e cai na home genérica — o conteúdo
        // que a mensagem anunciou fica a três cliques de distância, e a pessoa
        // não sabe que chegou no lugar errado. O `?redirect=` já é honrado pelo
        // `login-form`, e é ele que o aviso de navegador embutido carrega para o
        // Safari.
        const destino = `${window.location.pathname}${window.location.search}`;
        router.replace(destino && destino !== '/dashboard'
          ? `/login?redirect=${encodeURIComponent(destino)}`
          : '/login');
        return;
      }
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

  // ⚠️ DECISÃO: o logout NÃO desativa o push. Já esteve aqui e foi removido.
  //
  // A tentação é óbvia — a assinatura pertence ao NAVEGADOR, não à conta, então
  // entre o logout de A e o login de B o aparelho segue recebendo o que é de A.
  // Mas o remédio custava mais que a doença:
  //
  //  · desativar no logout transforma o opt-in em "opt-in até você sair", e a
  //    reativação só acontece quando a pessoa VOLTA — justamente o intervalo em
  //    que o push existe para atuar (trazer de volta quem saiu);
  //  · o denominador do experimento WhatsApp × push passaria a depender de
  //    hábito de logout, em silêncio, e a regra de health acusaria "push zerado"
  //    por gente que apenas saiu da conta;
  //  · e o `await` antes do signOut podia pendurar o botão "Sair" numa rede ruim.
  //
  // A troca de dono já é resolvida onde ela de fato acontece: no REGISTRO
  // (app/api/notifications/subscriptions/route.ts), que reassocia a assinatura a
  // quem entrou e tem índice único no banco garantindo um dono ativo por
  // aparelho. O resíduo aceito é a janela entre o logout de A e o login de B —
  // que exige o aparelho trocar de mãos exatamente nesse intervalo.
  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  if (!user) return null;

  return (
    <PresentationEnvironment>
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

        {ehAdminDaPlataforma && (
          <button
            onClick={() => router.push('/admin/dashboard')}
            title={t('platformPanel')}
            className="text-gray-500 hover:text-white transition-colors"
          >
            <ShieldCheck size={20} />
          </button>
        )}

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
          {ehAdminDaPlataforma && (
            <button
              onClick={() => router.push('/admin/dashboard')}
              className="text-gray-500 hover:text-white transition-colors"
              title={t('platformPanel')}
            >
              <ShieldCheck size={18} />
            </button>
          )}
          <button onClick={handleLogout} className="text-gray-500 hover:text-white transition-colors" title={t('logout')}>
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Content */}
      <main className={`flex-1 overflow-y-auto md:ml-20 ${isImmersiveContent ? 'pb-0' : 'pb-[calc(var(--nav-height)+72px)] md:pb-0'}`}>
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

        {!/^\/dashboard\/temporada\/semana\//.test(pathname) && !isImmersiveContent && <BetoChat />}
      </div>
    </PresentationEnvironment>
  );
}
