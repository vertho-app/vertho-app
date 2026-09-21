'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { getSupabase } from '@/lib/supabase-browser';
import { localeCookieName } from '@/lib/i18n';
import { Home, Clock, Play, TrendingUp, User, LogOut, Users2, ListOrdered, ShieldCheck, FileChartColumn, Activity, Headset, Handshake, ChartLine, Compass, Crown } from 'lucide-react';
import BetoChat from '@/components/beto-chat';
import { UserAvatar } from '@/components/user-avatar';
import { PresentationEnvironment } from '@/components/dashboard/presentation-role-switcher';
import PresentationNavigation from '@/components/dashboard/presentation-navigation';
import type { TenantTheme } from '@/lib/ui-resolver';

type NavItem = {
  href: string; labelKey: string; icon: any;
  gestorOnly?: boolean; rhOnly?: boolean; participante?: boolean;
  /** Só aparece quando a empresa contratou o módulo de Prontidão para Liderança (`/api/me`). */
  moduloProntidao?: boolean;
  /** Some para o Admin da empresa, que chega no mesmo destino por outro caminho. */
  exceptoRh?: boolean;
  recepcao?: boolean;
  vendas?: boolean;
  /** Item de TREINO: some para quem só acompanha (gestor e RH). */
  treina?: boolean;
  /** Item de ACOMPANHAMENTO da equipe: só para quem só acompanha (gestor e RH). */
  acompanha?: boolean;
  /** Simulador interativo: a população autorizada do trilho de liderança (`/api/me`). */
  simuladorLideranca?: boolean;
  liderancaEquipe?: boolean;
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

/**
 * A ordem é a régua: **primeiro a minha jornada, depois o meu time.**
 *
 * A ordem anterior intercalava os dois papéis (equipe · ranking · relatórios ·
 * engajamento · evolução da equipe · e só então jornada e temporada), então
 * quem lidera E participa via os ícones da própria jornada no fim da coluna,
 * depois de cinco de gestão. Pedido do dono em 04/09/2026.
 *
 * Os filtros por papel NÃO mudam com isto: quem só lidera (cargo de adequação,
 * Top 5 vazio) continua sem o bloco individual, e para essa pessoa a coluna
 * fica idêntica à de antes.
 */
const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', labelKey: 'home', icon: Home },

  // ── O QUE A PESSOA FAZ ───────────────────────────────────────────────────
  // `participante`: telas da jornada de quem FAZ o programa. O papel `rh` é o
  // Admin da empresa e não participa (medido 24/08/2026: 0 dos 8 com role='rh'
  // têm sessão de avaliação), então para ele são portas para tela vazia — a
  // mesma razão que tirou a jornada da home dele. Ver `home-rh.tsx`.
  { href: '/dashboard/jornada', labelKey: 'journey', icon: Clock, participante: true },
  { href: '/dashboard/temporada', labelKey: 'season', icon: Play, participante: true },
  // Um ícone por destino (16/09/2026, pedido do dono): os dois simuladores
  // usavam o mesmo balão de conversa, e a evolução da equipe repetia a seta da
  // evolução individual. Na coluna só de ícones, ícone repetido é item que
  // ninguém distingue. `tests/unit/dashboard-shell-menu.test.ts` cobra.
  //
  // 17/09/2026 (pedido do dono): atendimento e vendas são TREINO de quem atende
  // e vende. Gestor e RH não treinam: os mesmos destinos aparecem para eles mais
  // abaixo, com nome de acompanhamento. O gestor pratica o simulador de
  // LIDERANÇA; o RH não pratica nenhum.
  { href: '/dashboard/treino-atendimento', labelKey: 'receptionTraining', icon: Headset, recepcao: true, treina: true },
  { href: '/dashboard/simulador-vendas', labelKey: 'salesTraining', icon: Handshake, vendas: true, treina: true },
  { href: '/dashboard/simulador-lideranca', labelKey: 'leadershipSimulator', icon: Crown, simuladorLideranca: true },
  { href: '/dashboard/evolucao', labelKey: 'evolution', icon: TrendingUp, participante: true },

  // ── O QUE A PESSOA ACOMPANHA ─────────────────────────────────────────────
  // Telas de EQUIPE. Para quem lidera sem participar elas são o conteúdo do
  // menu: o coordenador acompanha o time, não faz a própria jornada.
  { href: '/dashboard/gestor', labelKey: 'team', icon: Users2, gestorOnly: true },
  { href: '/dashboard/gestor/engajamento', labelKey: 'teamEngagement', icon: Activity, gestorOnly: true },
  // Para o RH a evolução já é uma ABA da central de relatórios: no menu, o
  // mesmo destino apareceria duas vezes na mesma tela.
  { href: '/dashboard/gestor/equipe-evolucao', labelKey: 'teamEvolution', icon: ChartLine, gestorOnly: true, exceptoRh: true },
  // Os simuladores como ACOMPANHAMENTO: mesma tela, que para gestor e RH abre
  // direto na aba da equipe e sem a parte de treinar.
  { href: '/dashboard/treino-atendimento', labelKey: 'receptionTeam', icon: Headset, recepcao: true, acompanha: true },
  { href: '/dashboard/simulador-vendas', labelKey: 'salesTeam', icon: Handshake, vendas: true, acompanha: true },
  // Liderança: quem acompanha e NÃO pratica (o RH, e gestor fora da população do
  // programa). Quem pratica chega à mesma tela pelo item de cima, com a aba Equipe.
  { href: '/dashboard/simulador-lideranca', labelKey: 'leadershipTeam', icon: Crown, liderancaEquipe: true },
  // Seleção saiu daqui em 24/08/2026: era a única tela de OPERAÇÃO no menu do
  // cliente (criar vaga · gerar perfil · avaliar candidatos) e virou operação da
  // Vertho em /admin. O ranking das vagas segue visível ao RH em .../ranking, que
  // já inclui `eh_vaga`. Ver o docstring de `gestor/selecao/page.tsx`.
  { href: '/dashboard/gestor/ranking', labelKey: 'ranking', icon: ListOrdered, rhOnly: true },
  { href: '/dashboard/gestor/prontidao-lideranca', labelKey: 'prontidaoLideranca', icon: Compass, rhOnly: true, moduloProntidao: true },
  { href: '/dashboard/relatorios', labelKey: 'reports', icon: FileChartColumn, rhOnly: true },

  { href: '/dashboard/perfil', labelKey: 'profile', icon: User },
];

/**
 * Qual item do menu está aceso.
 *
 * `pathname.startsWith(href)` sozinho acende TODO prefixo: em
 * `/dashboard/gestor/engajamento`, o ícone de "Minha equipe"
 * (`/dashboard/gestor`) ficava aceso ao lado do de engajamento — dois itens
 * iluminados, e o de cima nunca apagava.
 *
 * A régua é "o mais específico vence": entre os itens que casam, só o de href
 * mais longo fica ativo. O casamento exige a barra, senão `/dashboard/gestorX`
 * passaria por filho de `/dashboard/gestor`.
 */
function hrefAtivo(pathname: string, itens: NavItem[]): string | null {
  const candidatos = itens
    .map((item) => item.href)
    .filter((href) => pathname === href || (href !== '/dashboard' && pathname.startsWith(`${href}/`)));
  if (!candidatos.length) return null;
  return candidatos.reduce((maior, href) => (href.length > maior.length ? href : maior));
}

export default function DashboardShell({ children, theme = DEFAULT_THEME }: { children: React.ReactNode; theme?: TenantTheme }) {
  const t = useTranslations('DashboardShell');
  const router = useRouter();
  const pathname = usePathname();
  const isImmersiveContent = pathname.startsWith('/dashboard/conteudo/');
  const supabase = getSupabase();
  const [user, setUser] = useState<any>(null);
  const [colaborador, setColaborador] = useState<{ nome_completo?: string; foto_url?: string; avatar_preset?: string | null; role?: string; locale?: string; platformAdmin?: boolean; temTrilhaPossivel?: boolean; treinoRecepcao?: boolean; treinoVendas?: boolean; prontidaoLideranca?: boolean; soAcompanhaSimuladores?: boolean; simuladorLideranca?: boolean; liderancaEquipe?: boolean } | null>(null);
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
  // Quem decide é o servidor (`soAcompanhaSimuladores` em lib/simuladores/papel),
  // que já descontou quem administra a plataforma.
  const soAcompanha = colaborador?.soAcompanhaSimuladores === true;
  const navItems = NAV_ITEMS.filter((it) =>
    (!it.recepcao || colaborador?.treinoRecepcao === true)
    && (!it.vendas || colaborador?.treinoVendas === true)
    && (!it.gestorOnly || isGestorOuRH)
    && (!it.rhOnly || ehAdminDaEmpresa)
    && (!it.moduloProntidao || colaborador?.prontidaoLideranca === true)
    && (!it.participante || (!ehAdminDaEmpresa && participaDaJornada))
    && (!it.exceptoRh || !ehAdminDaEmpresa)
    && (!it.treina || !soAcompanha)
    && (!it.acompanha || soAcompanha)
    && (!it.simuladorLideranca || colaborador?.simuladorLideranca === true)
    && (!it.liderancaEquipe || (colaborador?.liderancaEquipe === true && colaborador?.simuladorLideranca !== true)),
  );
  const ativo = hrefAtivo(pathname, navItems);

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

      {/*
        Sidebar (desktop), EXPANSÍVEL (16/09/2026, sugestão do dono: "para quem
        está vendo pela 1ª vez pode ajudar"). Recolhida, é a coluna de ícones de
        sempre; ao passar o mouse ou navegar pelo teclado ela abre por CIMA do
        conteúdo (o `md:ml-20` do main não muda, então nada salta) e mostra o nome
        de cada item. No celular a barra inferior já tinha os nomes.
        Aberta, ela tem 256 px (w-64): em 240 px, "Simulações de atendimento"
        terminava a 1 px da borda (medido no navegador em 17/09/2026).
        Teclado abre por `has-focus-visible`, NÃO por `focus-within`: o botão
        clicado com o mouse guarda o foco, e com `focus-within` a coluna ficava
        aberta por cima da tela depois da navegação.
        🔴 Aberta, a coluna fica em z-[44]: acima do conteúdo (até z-40) e ABAIXO
        da barra da sala de apresentação (z-[45], rente à coluna). Em z-50 ela
        cobria a barra, e o ponto de "Voltar ao início" virava o botão Sair: quem
        descia o mouse pela coluna até a barra deslogava da sala (visto no
        navegador em 16/09/2026).
        Sem classe arbitrária com vírgula: o Tailwind não gera e a regra some
        calada (memória `reference_tailwind_classe_arbitraria_virgula`).
      */}
      <aside
        data-menu="lateral"
        className="group/menu hidden md:flex fixed left-0 top-0 h-full w-20 overflow-hidden border-r border-white/[0.08] flex-col py-6 gap-6 z-40 transition-[width] duration-200 ease-out hover:w-64 hover:z-[44] hover:shadow-2xl has-focus-visible:w-64 has-focus-visible:z-[44] has-focus-visible:shadow-2xl"
        style={{ background: theme.bgStart, backdropFilter: 'blur(12px)' }}
      >
        <div className="flex w-64 items-center gap-3 px-5">
          {/* ✅ UserAvatar substitui o botão com initials hardcoded */}
          <UserAvatar
            name={colaborador?.nome_completo ?? user?.email}
            photoUrl={colaborador?.foto_url}
            avatarPreset={colaborador?.avatar_preset}
            size={40}
            onClick={() => router.push('/dashboard/perfil')}
          />
          <span className="min-w-0 truncate text-sm font-semibold text-white/85 opacity-0 transition-opacity duration-200 group-hover/menu:opacity-100 group-has-focus-visible/menu:opacity-100">
            {colaborador?.nome_completo?.split(' ')[0] || ''}
          </span>
        </div>

        <nav className="flex w-64 flex-1 flex-col gap-2">
          {navItems.map(item => {
            const isActive = item.href === ativo;
            const Icon = item.icon;
            const label = t(`nav.${item.labelKey}`);
            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                aria-label={label}
                aria-current={isActive ? 'page' : undefined}
                data-menu-item={item.href}
                className={`flex w-full items-center gap-4 px-[29px] py-2 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:bg-white/[0.06] ${
                  isActive ? '' : 'text-gray-500 hover:bg-white/[0.04] hover:text-white'
                }`}
                style={isActive ? { color: theme.accent } : undefined}
              >
                <Icon
                  size={22}
                  className="shrink-0"
                  style={isActive ? { filter: `drop-shadow(0 0 8px ${theme.accent})` } : undefined}
                />
                <span className="whitespace-nowrap text-sm font-semibold opacity-0 transition-opacity duration-200 group-hover/menu:opacity-100 group-has-focus-visible/menu:opacity-100">
                  {label}
                </span>
              </button>
            );
          })}
        </nav>

        <div className="flex w-64 flex-col gap-2">
          {ehAdminDaPlataforma && (
            <button
              onClick={() => router.push('/admin/dashboard')}
              aria-label={t('platformPanel')}
              className="flex w-full items-center gap-4 px-[30px] py-2 text-left text-gray-500 transition-colors hover:bg-white/[0.04] hover:text-white focus-visible:outline-none focus-visible:bg-white/[0.06]"
            >
              <ShieldCheck size={20} className="shrink-0" />
              <span className="whitespace-nowrap text-sm font-semibold opacity-0 transition-opacity duration-200 group-hover/menu:opacity-100 group-has-focus-visible/menu:opacity-100">
                {t('platformPanel')}
              </span>
            </button>
          )}

          <button
            onClick={handleLogout}
            aria-label={t('logout')}
            className="flex w-full items-center gap-4 px-[30px] py-2 text-left text-gray-500 transition-colors hover:bg-white/[0.04] hover:text-red-400 focus-visible:outline-none focus-visible:bg-white/[0.06]"
          >
            <LogOut size={20} className="shrink-0" />
            <span className="whitespace-nowrap text-sm font-semibold opacity-0 transition-opacity duration-200 group-hover/menu:opacity-100 group-has-focus-visible/menu:opacity-100">
              {t('logout')}
            </span>
          </button>
        </div>
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
        <PresentationNavigation />
        {children}
      </main>

      {/*
        Bottom Nav mobile. ROLA na horizontal quando os itens não cabem.
        Medido no iPhone em 17/09/2026: o gestor tinha 8 itens e a colaboradora 7,
        e os últimos (Perfil entre eles) ficavam FORA da tela, sem como alcançar;
        os rótulos longos quebravam em três linhas e vazavam a barra. Cada item tem
        largura fixa e o rótulo vai a no máximo duas linhas. `w-max min-w-full`:
        com poucos itens eles se espalham; com muitos, a faixa passa da tela sem
        espaço negativo (com `justify-around` o primeiro item sumiria à esquerda).
      */}
      <nav
        data-menu="inferior"
        className="md:hidden fixed bottom-0 left-0 right-0 overflow-x-auto border-t border-white/[0.06] z-40 [scrollbar-width:none]"
        style={{ height: 'var(--nav-height)', background: theme.bgStart }}
      >
        <div className="flex h-full w-max min-w-full items-center justify-around">
          {navItems.map(item => {
            const isActive = item.href === ativo;
            const Icon = item.icon;
            const label = t(`nav.${item.labelKey}`);
            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className={`flex w-[76px] shrink-0 flex-col items-center gap-0.5 py-1 transition-colors ${isActive ? '' : 'text-gray-500'}`}
                style={isActive ? { color: theme.accent } : undefined}
              >
                <Icon size={20} className="shrink-0" />
                <span className="line-clamp-2 w-full text-center text-[10px] font-semibold leading-tight">{label}</span>
              </button>
            );
          })}
        </div>
      </nav>

        {!/^\/dashboard\/temporada\/semana\//.test(pathname) && !pathname.startsWith('/dashboard/treino-atendimento') && !pathname.startsWith('/dashboard/simulador-vendas') && !isImmersiveContent && <BetoChat />}
      </div>
    </PresentationEnvironment>
  );
}
