import Link from 'next/link';

/**
 * ⚠️ Todo caminho daqui para baixo começa com `/radar`.
 *
 * Até 10/08/2026 o Radar era servido por `radar.vertho.ai`, e o REWRITE do
 * proxy prefixava tudo: `/comparar` chegava como `/radar/comparar` sozinho.
 * Com a ferramenta interna em `app.vertho.ai/radar` o rewrite não existe mais,
 * e um `href="/"` leva para a home do APP, não para a home do Radar. Guarda:
 * `tests/unit/security/radar-interno-guard.test.ts`.
 */
export function RadarHeader() {
  return (
    <header className="max-w-[1100px] mx-auto px-6 pt-8 pb-4 flex items-center justify-between">
      <Link href="/radar" className="flex items-center gap-3">
        <img src="/logo-vertho.png" alt="Vertho" style={{ height: 22, opacity: 0.85 }} />
        <span className="text-[10px] font-bold tracking-[0.25em] uppercase" style={{ color: '#34c5cc' }}>
          Radar
        </span>
      </Link>
      <nav className="flex items-center gap-5 text-xs text-white/60">
        <Link href="/radar" className="hover:text-white">Início</Link>
        <Link href="/radar/comparar" className="hover:text-white">Comparar</Link>
        <Link href="/radar/metodologia" className="hover:text-white">Metodologia</Link>
        {/* Volta para o painel: a sidebar do admin não acompanha esta rota. */}
        <Link href="/admin/dashboard" className="hover:text-white">← Painel</Link>
      </nav>
    </header>
  );
}

export function RadarFooter() {
  return (
    <footer className="border-t border-white/[0.06] mt-16">
      <div className="max-w-[1100px] mx-auto px-6 py-6 flex flex-wrap items-center justify-between gap-3 text-[10px] text-white/35 uppercase tracking-[0.1em]">
        <span>© Vertho Mentor IA — ferramenta interna</span>
        <span>Dados oficiais INEP · MEC</span>
      </div>
    </footer>
  );
}
