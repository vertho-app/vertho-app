'use client';

import { useRouter } from 'next/navigation';
import { Home, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  const router = useRouter();
  return (
    <div className="min-h-dvh flex items-center justify-center px-6"
      style={{ background: 'linear-gradient(180deg, #091D35 0%, #0F2A4A 100%)' }}>
      <div className="text-center max-w-md">
        <img src="/logo-vertho.png" alt="Vertho" className="h-7 mx-auto mb-8 opacity-80" />
        <p className="text-7xl md:text-8xl font-black mb-4"
          style={{
            background: 'linear-gradient(135deg, #00B4D8, #0D9488)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
          404
        </p>
        <h1 className="text-xl md:text-2xl font-extrabold text-white mb-2">Página não encontrada</h1>
        <p className="text-sm text-gray-400 mb-6 leading-relaxed">
          A página que você procura não existe, foi movida ou você pode não ter permissão pra acessá-la.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button onClick={() => router.back()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold text-gray-300 border border-white/10 hover:bg-white/5 transition-all">
            <ArrowLeft size={14} /> Voltar
          </button>
          <button onClick={() => router.push('/dashboard')}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-extrabold text-white"
            style={{ background: 'linear-gradient(135deg, #0D9488, #0F766E)', boxShadow: '0 0 24px rgba(0,180,216,0.25)' }}>
            <Home size={16} /> Ir ao dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
