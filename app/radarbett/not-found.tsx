'use client';

import { useRouter } from 'next/navigation';
import { Search, ArrowLeft, Home } from 'lucide-react';
import { BettSearch } from './_components/bett-search';

export default function NotFound() {
  const router = useRouter();
  return (
    <main
      className="min-h-dvh flex flex-col"
      style={{
        background:
          'radial-gradient(1100px 600px at 88% -5%, rgba(52,197,204,.12), transparent 55%),' +
          'radial-gradient(900px 500px at -5% 30%, rgba(154,226,230,.07), transparent 60%),' +
          'linear-gradient(180deg,#06172C 0%,#091D35 50%,#0a1f3a 100%)',
      }}
    >
      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="text-center max-w-[520px] w-full">
          <p className="text-[10px] tracking-[0.3em] uppercase font-mono text-cyan-300/80 mb-3">
            Radar Vertho · 404
          </p>
          <h1
            className="text-white mb-4"
            style={{
              fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
              fontWeight: 600,
              fontSize: 'clamp(36px, 6vw, 56px)',
              lineHeight: 1.05,
              letterSpacing: '-0.02em',
            }}
          >
            Não encontramos essa <em style={{ color: '#34c5cc', fontStyle: 'italic' }}>leitura</em>.
          </h1>
          <p className="text-white/65 leading-relaxed mb-8" style={{ fontSize: 15 }}>
            A escola ou município pode não estar cadastrado no Radar ainda, ou o link pode estar
            desatualizado. Tente buscar pelo nome ou volte pra home.
          </p>

          <div className="mb-6">
            <BettSearch
              onSelectResult={(r) => {
                if (r.tipo === 'escola') router.push(`/escola/${r.id}`);
                else router.push(`/municipio/${r.id}`);
              }}
            />
          </div>

          <button
            onClick={() => router.push('/')}
            className="inline-flex items-center gap-2 text-[12px] text-white/55 hover:text-white"
          >
            <Home size={12} /> Voltar pra home
          </button>
        </div>
      </div>
    </main>
  );
}
