'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowUpRight,
  BookOpenCheck,
  BriefcaseBusiness,
  Building2,
  ChevronRight,
  CircleDot,
  Inbox,
  Layers3,
  Settings2,
} from 'lucide-react';

type Area = {
  href: string;
  rotulo: string;
  descricao: string;
  icone: React.ComponentType<{ size?: number; className?: string }>;
};

const AREAS: Area[] = [
  { href: '/admin-v2', rotulo: 'Hoje', descricao: 'O que pede ação', icone: CircleDot },
  { href: '/admin-v2/clientes', rotulo: 'Clientes', descricao: 'Empresas e turmas', icone: Building2 },
  { href: '/admin-v2/conteudo', rotulo: 'Conteúdo', descricao: 'Demanda à entrega', icone: BookOpenCheck },
  { href: '/admin-v2/negocios', rotulo: 'Negócios', descricao: 'Mercado ao handoff', icone: BriefcaseBusiness },
  { href: '/admin-v2/plataforma', rotulo: 'Plataforma', descricao: 'Governança e saúde', icone: Settings2 },
];

const SECOES: Array<{ teste: (path: string) => boolean; titulo: string; trilha: string[] }> = [
  {
    teste: (path) => /\/clientes\/[^/]+\/turmas\/[^/]+/.test(path),
    titulo: 'Operação da turma',
    trilha: ['Clientes', 'Empresa', 'Turma'],
  },
  {
    teste: (path) => /^\/admin-v2\/clientes\/[^/]+/.test(path),
    titulo: 'Workspace da empresa',
    trilha: ['Clientes', 'Empresa'],
  },
  { teste: (path) => path.startsWith('/admin-v2/clientes'), titulo: 'Clientes e turmas', trilha: ['Clientes'] },
  { teste: (path) => path.startsWith('/admin-v2/conteudo'), titulo: 'Fluxo de conteúdo', trilha: ['Conteúdo'] },
  { teste: (path) => path.startsWith('/admin-v2/negocios'), titulo: 'Negócios', trilha: ['Negócios'] },
  { teste: (path) => path.startsWith('/admin-v2/plataforma'), titulo: 'Plataforma', trilha: ['Plataforma'] },
  { teste: (path) => path.startsWith('/admin-v2/inbox'), titulo: 'Caixa de entrada', trilha: ['Caixa'] },
  { teste: (path) => path === '/admin-v2', titulo: 'Central de operação', trilha: ['Hoje'] },
];

function areaAtiva(pathname: string, href: string) {
  if (href === '/admin-v2') return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function ShellV2({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/admin-v2';
  const secao = SECOES.find((item) => item.teste(pathname)) ?? SECOES.at(-1)!;

  return (
    <div className="min-h-dvh bg-[var(--navy-deep)] text-[var(--ink)]">
      <div className="grid min-h-dvh grid-cols-1 md:grid-cols-[216px_minmax(0,1fr)]">
        <aside className="border-b border-white/[0.08] bg-[#071a31] md:sticky md:top-0 md:flex md:h-dvh md:flex-col md:border-b-0 md:border-r">
          <div className="flex items-center justify-between gap-3 px-4 py-4 md:px-5 md:pb-6 md:pt-5">
            <Link href="/admin-v2" className="flex min-w-0 items-center gap-2.5 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--cyan)]">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] border border-[#34c5cc55] bg-[#34c5cc12] font-[family-name:var(--font-serif)] text-lg italic text-[var(--cyan-soft)]">
                V
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-semibold tracking-[-0.02em]">vertho.ai</span>
                <span className="block font-[family-name:var(--font-manrope)] text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-faint)]">
                  operação
                </span>
              </span>
            </Link>
            <span className="rounded-full border border-[#e1aaef3b] bg-[#e1aaef0f] px-2 py-1 font-[family-name:var(--font-manrope)] text-[8px] font-bold uppercase tracking-[0.14em] text-[var(--lilac)]">
              local
            </span>
          </div>

          <nav aria-label="Áreas do admin" className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible md:px-3 md:pb-0">
            {AREAS.map(({ href, rotulo, descricao, icone: Icone }) => {
              const ativo = areaAtiva(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={ativo ? 'page' : undefined}
                  className={`group flex min-w-max items-center gap-3 rounded-[10px] border px-3 py-2.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cyan)] md:min-w-0 ${
                    ativo
                      ? 'border-[#34c5cc2e] bg-[#34c5cc12] text-[var(--ink)]'
                      : 'border-transparent text-[var(--ink-dim)] hover:border-white/[0.06] hover:bg-white/[0.025] hover:text-[var(--ink)]'
                  }`}
                >
                  <Icone size={16} className={ativo ? 'text-[var(--cyan)]' : 'text-[var(--ink-faint)] group-hover:text-[var(--ink-dim)]'} />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold">{rotulo}</span>
                    <span className="hidden truncate text-[10.5px] text-[var(--ink-faint)] md:block">{descricao}</span>
                  </span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto hidden px-4 pb-4 md:block">
            <div className="mb-3 border-t border-white/[0.06] pt-3">
              <Link
                href="/admin-v2/inbox"
                className="flex items-center gap-2 rounded-[10px] px-2.5 py-2 text-[12px] text-[var(--ink-dim)] transition-colors hover:bg-white/[0.03] hover:text-[var(--cyan)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--cyan)]"
              >
                <Inbox size={14} /> Caixa de entrada
              </Link>
              <Link
                href="/admin-v2/plataforma?secao=jobs"
                className="flex items-center gap-2 rounded-[10px] px-2.5 py-2 text-[12px] text-[var(--ink-dim)] transition-colors hover:bg-white/[0.03] hover:text-[var(--cyan)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--cyan)]"
              >
                <Layers3 size={14} /> Central de jobs
              </Link>
            </div>
            <Link
              href="/admin/dashboard"
              className="flex items-center justify-between rounded-[10px] border border-white/[0.08] px-3 py-2 text-[11px] text-[var(--ink-faint)] transition-colors hover:border-white/[0.14] hover:text-[var(--ink-dim)]"
            >
              Admin atual <ArrowUpRight size={12} />
            </Link>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-40 flex min-h-[62px] items-center gap-4 border-b border-white/[0.08] bg-[#06172cf2] px-4 backdrop-blur-xl sm:px-6 lg:px-8">
            <div className="min-w-0">
              <div className="flex items-center gap-1 font-[family-name:var(--font-manrope)] text-[9px] font-semibold uppercase tracking-[0.13em] text-[var(--ink-faint)]">
                {secao.trilha.map((item, index) => (
                  <span key={`${item}-${index}`} className="flex items-center gap-1">
                    {index > 0 && <ChevronRight size={10} />}
                    {item}
                  </span>
                ))}
              </div>
              <p className="mt-0.5 truncate text-[15px] font-semibold tracking-[-0.015em]">{secao.titulo}</p>
            </div>
            <div className="ml-auto flex items-center gap-2 sm:hidden">
              <Link href="/admin-v2/inbox" aria-label="Caixa de entrada" className="rounded-lg border border-white/[0.1] p-2 text-[var(--ink-dim)]">
                <Inbox size={15} />
              </Link>
            </div>
            <div className="ml-auto hidden items-center gap-2 sm:flex">
              <span className="rounded-full border border-[#34c5cc32] bg-[#34c5cc0d] px-3 py-1.5 font-[family-name:var(--font-manrope)] text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--cyan-soft)]">
                Admin por fluxo
              </span>
              <Link
                href="/admin-v2/inbox"
                className="flex items-center gap-1.5 rounded-[10px] border border-white/[0.1] px-3 py-1.5 text-[11px] text-[var(--ink-dim)] transition-colors hover:border-[var(--cyan)] hover:text-[var(--cyan)]"
              >
                <Inbox size={13} /> Caixa
              </Link>
            </div>
          </header>

          <main className="px-4 pb-16 pt-6 sm:px-6 lg:px-8">
            <div className="mx-auto w-full max-w-[1540px]">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
