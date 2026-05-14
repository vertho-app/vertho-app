'use client';

import { CheckCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Props {
  pulseMoment: 'T0' | 'T2';
}

export function PulseCompletion({ pulseMoment }: Props) {
  const router = useRouter();
  return (
    <div className="max-w-md mx-auto text-center py-12 px-6">
      <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-cyan-400/15 flex items-center justify-center">
        <CheckCircle2 size={32} className="text-cyan-400" />
      </div>
      <h2 className="text-xl font-bold text-white mb-2">Obrigado.</h2>
      <p className="text-sm text-gray-400 mb-8">
        Seu pulso {pulseMoment === 'T0' ? 'inicial' : 'final'} foi registrado com segurança.
      </p>
      <button
        onClick={() => router.push('/dashboard')}
        className="px-6 py-3 rounded-xl text-sm font-bold text-[#0F2B54] bg-cyan-400 hover:brightness-110 transition-all"
      >
        Voltar pro dashboard
      </button>
    </div>
  );
}
