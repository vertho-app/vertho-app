import Link from 'next/link';

export function RadarHeader() {
  return (
    <header className="max-w-[1100px] mx-auto px-6 pt-8 pb-4 flex items-center justify-between">
      <Link href="/" className="flex items-center gap-3">
        <img src="/logo-vertho.png" alt="Vertho" style={{ height: 22, opacity: 0.85 }} />
        <span className="text-[10px] font-bold tracking-[0.25em] uppercase" style={{ color: '#34c5cc' }}>
          Radar
        </span>
      </Link>
      <nav className="flex items-center gap-5 text-xs text-white/60">
        <Link href="/" className="hover:text-white">Início</Link>
        <Link href="/metodologia" className="hover:text-white">Metodologia</Link>
        <a href="https://vertho.ai" className="hover:text-white">vertho.ai</a>
      </nav>
    </header>
  );
}

export function RadarFooter() {
  return (
    <footer className="border-t border-white/[0.06] mt-16">
      <div className="max-w-[1100px] mx-auto px-6 py-6 flex flex-wrap items-center justify-between gap-3 text-[10px] text-white/35 uppercase tracking-[0.1em]">
        <span>© Vertho Mentor IA — radar.vertho.ai</span>
        <span>Dados oficiais INEP · MEC</span>
      </div>
    </footer>
  );
}
