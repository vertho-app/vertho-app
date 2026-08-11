'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CircleDot, Building2, Sparkles, TrendingUp, DollarSign, Settings, LogOut, Search,
} from 'lucide-react';

/**
 * Shell da arquitetura proposta: 6 áreas globais que NÃO mudam com o cliente
 * selecionado. No admin atual são 39 itens em 10 grupos, dos quais só 10
 * aparecem nos dois contextos do filtro de empresa (medido em nav-items.ts).
 *
 * Sem badge de contagem aqui de propósito: número no menu teria de ser buscado
 * a cada navegação e, se ficar defasado, o menu mente. As contagens vivem em
 * "Meu trabalho", que é onde elas são lidas do banco.
 */
type Area = {
  href: string;
  icone: React.ComponentType<{ size?: number; className?: string }>;
  rotulo: string;
  sub: string;
  pronta: boolean;
};

const AREAS: Area[] = [
  { href: '/admin-v2', icone: CircleDot, rotulo: 'Meu trabalho', sub: 'Pendências e aprovações', pronta: true },
  { href: '/admin-v2/clientes', icone: Building2, rotulo: 'Clientes', sub: 'Carteira e operação', pronta: true },
  { href: '/admin-v2/conteudo', icone: Sparkles, rotulo: 'Estúdio de Conteúdo', sub: 'Biblioteca, produção, kits', pronta: true },
  { href: '/admin-v2/em-breve?area=crescimento', icone: TrendingUp, rotulo: 'Crescimento', sub: 'Radar e mercado', pronta: false },
  { href: '/admin-v2/em-breve?area=comercial', icone: DollarSign, rotulo: 'Comercial & Financeiro', sub: 'Filas, propostas, custos', pronta: false },
  { href: '/admin-v2/em-breve?area=plataforma', icone: Settings, rotulo: 'Plataforma', sub: 'Acessos, dados, governança', pronta: false },
];

const TITULOS: { teste: (p: string) => boolean; crumb: string; h1: React.ReactNode }[] = [
  {
    teste: (p) => p === '/admin-v2',
    crumb: 'Meu trabalho',
    h1: <>O que precisa de <em className="font-[family-name:var(--font-serif)] italic text-[var(--cyan-soft)]">atenção</em></>,
  },
  {
    teste: (p) => p.startsWith('/admin-v2/clientes'),
    crumb: 'Clientes',
    h1: <>Carteira de <em className="font-[family-name:var(--font-serif)] italic text-[var(--cyan-soft)]">clientes</em></>,
  },
  {
    teste: (p) => p.startsWith('/admin-v2/conteudo'),
    crumb: 'Estúdio de Conteúdo',
    h1: <>Acervo e <em className="font-[family-name:var(--font-serif)] italic text-[var(--cyan-soft)]">produção</em></>,
  },
  {
    teste: (p) => p.startsWith('/admin-v2/cliente'),
    crumb: 'Clientes › workspace',
    h1: <>Workspace do <em className="font-[family-name:var(--font-serif)] italic text-[var(--cyan-soft)]">cliente</em></>,
  },
];

export default function ShellV2({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const titulo = TITULOS.find((t) => t.teste(pathname));

  const ativo = (href: string) => {
    const base = href.split('?')[0];
    if (base === '/admin-v2') return pathname === '/admin-v2';
    if (base === '/admin-v2/clientes') return pathname.startsWith('/admin-v2/cliente');
    return pathname.startsWith(base);
  };

  return (
    <div className="min-h-dvh text-[var(--ink)]">
      <div className="sticky top-0 z-50 flex flex-wrap items-center gap-3 border-b border-[#e1aaef47] bg-[#9e4edd24] px-5 py-2 text-xs text-[var(--lilac)]">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em]">Arquitetura proposta</span>
        <span className="text-[var(--ink-dim)]">
          Lendo dados reais · o admin atual continua em{' '}
          <Link href="/admin/dashboard" className="underline underline-offset-2 hover:text-[var(--cyan)]">/admin</Link>
        </span>
      </div>

      <div className="grid min-h-[calc(100dvh-37px)] grid-cols-1 md:grid-cols-[264px_1fr]">
        <aside className="flex flex-col gap-5 border-b border-white/[0.08] bg-[#06172c80] p-5 md:border-b-0 md:border-r">
          <div className="flex items-center gap-2 px-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-[var(--cyan)] to-[var(--purple)] text-sm font-bold text-[#06172C]">
              V
            </span>
            <span className="text-[15px] font-semibold">
              vertho<em className="font-[family-name:var(--font-serif)] not-italic text-[var(--cyan)]">.ai</em>
            </span>
          </div>

          <nav className="flex flex-col gap-0.5">
            <span className="px-2.5 pb-1.5 font-mono text-[9.5px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">
              Áreas
            </span>
            {AREAS.map(({ href, icone: Icone, rotulo, sub, pronta }) => {
              const on = ativo(href);
              return (
                <Link
                  key={rotulo}
                  href={href}
                  aria-current={on ? 'page' : undefined}
                  className={`flex items-start gap-3 rounded-[10px] px-3 py-2.5 text-[13.5px] leading-tight transition-colors ${
                    on ? 'bg-[#34c5cc1f] shadow-[inset_2px_0_0_var(--cyan)]' : 'hover:bg-white/[0.04]'
                  }`}
                >
                  <Icone size={16} className={`mt-0.5 shrink-0 ${on ? 'text-[var(--cyan)]' : 'text-[var(--ink-faint)]'}`} />
                  <span className="min-w-0 flex-1">
                    <span className={`block font-medium ${on ? 'text-[var(--cyan)]' : ''} ${pronta ? '' : 'text-[var(--ink-dim)]'}`}>
                      {rotulo}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-[var(--ink-faint)]">{sub}</span>
                  </span>
                  {!pronta && (
                    <span className="mt-0.5 shrink-0 rounded-full border border-white/[0.14] px-1.5 py-px font-mono text-[9px] text-[var(--ink-faint)]">
                      a fazer
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto rounded-[10px] border border-dashed border-red-400/40 bg-red-400/5 px-3.5 py-2.5 text-xs text-[var(--ink-dim)]">
            <b className="font-semibold text-red-300">Hoje:</b> 39 itens em 10 grupos, dos quais só 10 aparecem nos dois
            contextos do filtro. Aqui as 6 áreas nunca somem — o cliente muda o conteúdo, não a estrutura.
          </div>
        </aside>

        <main className="flex min-w-0 flex-col">
          <div className="sticky top-[37px] z-40 flex flex-wrap items-center gap-4 border-b border-white/[0.08] bg-gradient-to-b from-[#06172ceb] to-[#06172cb8] px-7 py-4 backdrop-blur-[10px]">
            <div className="min-w-0">
              <p className="font-mono text-[11.5px] text-[var(--ink-faint)]">{titulo?.crumb ?? 'Admin'}</p>
              <h1 className="mt-0.5 text-[23px] font-semibold leading-tight">{titulo?.h1 ?? 'Área'}</h1>
            </div>
            <div className="ml-auto flex items-center gap-2.5">
              <span className="flex items-center gap-1.5 rounded-lg border border-white/[0.14] px-2.5 py-1.5 font-mono text-[11px] text-[var(--ink-faint)]">
                <Search size={12} /> ⌘K
              </span>
              <Link
                href="/admin/dashboard"
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-[var(--ink-faint)] transition-colors hover:text-[var(--cyan)]"
              >
                <LogOut size={13} /> admin atual
              </Link>
            </div>
          </div>

          <div className="flex flex-col gap-6 px-7 pb-16 pt-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
