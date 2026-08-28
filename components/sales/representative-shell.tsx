'use client';

// Portal do Representante — shell (sidebar + header + drawer mobile).
// Visual alinhado ao padrão navy/glass da plataforma, mas 100% independente
// do shell do admin (não importa componentes de app/admin/**).
import { useEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import {
  Briefcase, Coins, FileText, Headphones, LayoutDashboard, Lightbulb, LogOut, Menu, MonitorPlay, Target, X,
} from 'lucide-react';
import { ConfirmDialogProvider } from '@/components/admin/confirm-dialog';
import { Toaster } from 'sonner';

const serif: CSSProperties = {
  fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
  fontStyle: 'italic',
  fontWeight: 400,
};

const NAV = [
  { key: 'inicio', label: 'Início', sub: 'Visão geral', href: '/representante', icon: LayoutDashboard },
  { key: 'crm', label: 'CRM', sub: 'Pipeline qualificado', href: '/representante/crm', icon: Target },
  { key: 'propostas', label: 'Propostas', sub: 'Aprovação e envio', href: '/representante/propostas', icon: FileText },
  { key: 'comissoes', label: 'Comissões', sub: 'A receber e pagas', href: '/representante/comissoes', icon: Coins },
  { key: 'carteira', label: 'Carteira', sub: 'Carteira ativa', href: '/representante/carteira', icon: Briefcase },
  { key: 'copiloto', label: 'Copiloto PACE', sub: 'Planejar e conduzir conversas', href: '/copiloto', icon: Headphones },
  { key: 'inteligencia', label: 'Inteligência Comercial', sub: 'Materiais e playbooks', href: '/representante/inteligencia-comercial', icon: Lightbulb },
  { key: 'demo', label: 'Ambiente de Demonstração', sub: 'Treinar e apresentar', href: '/representante/demo', icon: MonitorPlay },
] as const;

/** Item ativo = prefixo mais longo que casa com o pathname. */
function activeKey(pathname: string | null): string | null {
  if (!pathname) return null;
  const match = NAV
    .filter((n) => pathname === n.href || pathname.startsWith(`${n.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return match?.key ?? null;
}

function NavButton({
  item, active, onClick,
}: { item: (typeof NAV)[number]; active: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all w-full"
      style={{
        background: active ? 'rgba(52,197,204,.12)' : 'transparent',
        border: active ? '1px solid rgba(52,197,204,.25)' : '1px solid transparent',
        color: active ? '#34c5cc' : 'rgba(255,255,255,.7)',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'rgba(255,255,255,.04)';
          e.currentTarget.style.color = '#fff';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = 'rgba(255,255,255,.7)';
        }
      }}
    >
      <Icon size={16} className="shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold truncate">{item.label}</p>
        <p className="text-[10px] truncate" style={{ color: 'rgba(255,255,255,.4)' }}>{item.sub}</p>
      </div>
    </button>
  );
}

function MobileDrawer({ repName }: { repName: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { setOpen(false); }, [pathname]);
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

  const active = activeKey(pathname);
  function go(href: string) { setOpen(false); router.push(href); }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white/5 transition-colors shrink-0"
        style={{ color: 'rgba(255,255,255,.7)' }}
        aria-label="Abrir menu"
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
            <div className="px-4 pt-5 pb-4 flex items-center justify-between gap-2" style={{ borderBottom: '1px solid rgba(255,255,255,.05)' }}>
              <div className="flex items-center gap-2 min-w-0">
                <img src="/logo-vertho.png" alt="Vertho" style={{ height: 22, opacity: 0.95 }} />
                <p className="text-[10px] uppercase" style={{ color: 'rgba(255,255,255,.4)', letterSpacing: '.2em' }}>Portal Comercial</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-white/5 shrink-0"
                style={{ color: 'rgba(255,255,255,.5)' }}
                aria-label="Fechar menu"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-3 pt-3 pb-1">
              <div className="rounded-lg px-3 py-2" style={{ background: 'rgba(52,197,204,.08)', border: '1px solid rgba(52,197,204,.25)' }}>
                <p className="text-[9px] uppercase" style={{ color: 'rgba(52,197,204,.7)', letterSpacing: '.18em' }}>Representante</p>
                <p className="text-xs font-bold text-white truncate">{repName}</p>
              </div>
            </div>

            <nav className="flex-1 overflow-y-auto py-3 px-2 flex flex-col gap-0.5">
              {NAV.map((item) => (
                <NavButton key={item.key} item={item} active={item.key === active} onClick={() => go(item.href)} />
              ))}
            </nav>

            <div className="px-3 py-3" style={{ borderTop: '1px solid rgba(255,255,255,.05)' }}>
              <button
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left transition-colors hover:bg-white/5"
                style={{ color: 'rgba(255,255,255,.55)' }}
                onClick={() => go('/login')}
              >
                <LogOut size={14} />
                <span>Sair</span>
              </button>
            </div>
          </aside>
        </div>,
        document.body,
      )}
    </>
  );
}

export default function RepresentativeShell({
  rep, children,
}: { rep: { name: string }; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const active = activeKey(pathname);

  return (
    <div
      className="min-h-dvh flex"
      style={{
        background:
          'radial-gradient(1100px 500px at 90% -5%, rgba(52,197,204,.07), transparent 55%), ' +
          'radial-gradient(900px 500px at -5% 30%, rgba(158,78,221,.1), transparent 60%), ' +
          'linear-gradient(180deg, #06172c 0%, #091d35 50%, #0a1f3a 100%)',
        color: '#d7e3ff',
      }}
    >
      {/* Sidebar desktop */}
      <aside
        className="w-64 shrink-0 flex-col hidden md:flex"
        style={{
          background: 'rgba(7,27,56,.65)',
          backdropFilter: 'blur(12px)',
          borderRight: '1px solid rgba(255,255,255,.06)',
        }}
      >
        <div className="px-4 pt-5 pb-4 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(255,255,255,.05)' }}>
          <img src="/logo-vertho.png" alt="Vertho" style={{ height: 22, opacity: 0.95 }} />
          <p className="text-[10px] uppercase tracking-widest" style={{ color: 'rgba(255,255,255,.4)', letterSpacing: '.2em' }}>Portal Comercial</p>
        </div>

        <div className="px-3 pt-3 pb-1">
          <div className="rounded-lg px-3 py-2" style={{ background: 'rgba(52,197,204,.08)', border: '1px solid rgba(52,197,204,.25)' }}>
            <p className="text-[9px] uppercase tracking-widest" style={{ color: 'rgba(52,197,204,.7)', letterSpacing: '.18em' }}>Representante</p>
            <p className="text-xs font-bold text-white truncate">{rep.name}</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2 flex flex-col gap-0.5">
          {NAV.map((item) => (
            <NavButton key={item.key} item={item} active={item.key === active} onClick={() => router.push(item.href)} />
          ))}
        </nav>

        <div className="px-3 py-3" style={{ borderTop: '1px solid rgba(255,255,255,.05)' }}>
          <button
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left transition-colors hover:bg-white/5"
            style={{ color: 'rgba(255,255,255,.55)' }}
            onClick={() => router.push('/login')}
          >
            <LogOut size={14} />
            <span>Sair</span>
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header
          className="flex items-center justify-between gap-3 px-4 md:px-6 py-3"
          style={{
            background: 'rgba(7,27,56,.5)',
            backdropFilter: 'blur(12px)',
            borderBottom: '1px solid rgba(255,255,255,.06)',
          }}
        >
          <div className="flex items-center gap-2 md:gap-3 min-w-0 overflow-hidden">
            <MobileDrawer repName={rep.name} />
            <h1 className="text-[19px] md:text-[26px] whitespace-nowrap" style={{ ...serif, color: '#fff', lineHeight: 1 }}>
              Portal <em style={{ color: '#34c5cc' }}>Comercial</em>
            </h1>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden sm:inline text-xs font-semibold truncate max-w-[220px]" style={{ color: 'rgba(255,255,255,.65)' }}>
              {rep.name}
            </span>
            <button
              onClick={() => router.push('/login')}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors hover:bg-white/5"
              style={{ color: 'rgba(255,255,255,.6)', border: '1px solid rgba(255,255,255,.1)' }}
            >
              <LogOut size={13} />
              Sair
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <ConfirmDialogProvider>{children}</ConfirmDialogProvider>
        </main>
      </div>
      {/* Toaster próprio do portal — o do layout raiz não cobre esta área. */}
      <Toaster position="top-right" theme="dark" richColors closeButton />
    </div>
  );
}
